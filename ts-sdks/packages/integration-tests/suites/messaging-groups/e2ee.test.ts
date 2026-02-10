// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, inject, beforeAll } from 'vitest';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromHex } from '@mysten/sui/utils';
import { EncryptedObject, SessionKey } from '@mysten/seal';
import type { SealCompatibleClient } from '@mysten/seal';
import { permissionedGroups } from '@mysten/permissioned-groups';
import { messagingGroups, decodeIdentity } from '@mysten/messaging-groups';
import { requestSuiFromFaucetV2 } from '@mysten/sui/faucet';

import { createMockSealClient } from '../../src/seal-mock/index.js';
import type { ClientWithCoreApi } from '@mysten/sui/client';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type TestClient = ReturnType<typeof createTestClient>;

interface TestClientConfig {
	suiClientUrl: string;
	permissionedGroupsPackageId: string;
	messagingPackageId: string;
	namespaceId: string;
}

function createTestClient(config: TestClientConfig) {
	const { suiClientUrl, permissionedGroupsPackageId, messagingPackageId, namespaceId } = config;
	const witnessType = `${messagingPackageId}::messaging::Messaging`;

	const suiClient = new SuiJsonRpcClient({
		url: suiClientUrl,
		network: 'localnet',
		mvr: {
			overrides: {
				packages: {
					'@local-pkg/permissioned-groups': permissionedGroupsPackageId,
					'@local-pkg/messaging': messagingPackageId,
				},
			},
		},
	});

	return suiClient
		.$extend(
			permissionedGroups({
				packageConfig: { packageId: permissionedGroupsPackageId },
				witnessType,
			}),
			{
				name: 'seal' as const,
				register: (client: ClientWithCoreApi) =>
					createMockSealClient({ suiClient: client, packageId: messagingPackageId }),
			},
		)
		.$extend(
			messagingGroups({
				packageConfig: {
					packageId: messagingPackageId,
					namespaceId,
				},
			}),
		);
}

function createSessionKey(keypair: Ed25519Keypair, packageId: string): SessionKey {
	return SessionKey.import(
		{
			address: keypair.getPublicKey().toSuiAddress(),
			packageId,
			creationTimeMs: Date.now(),
			ttlMin: 30,
			sessionKey: keypair.getSecretKey(),
		},
		{} as SealCompatibleClient,
	);
}

async function fundNewKeypair(faucetUrl: string): Promise<Ed25519Keypair> {
	const keypair = new Ed25519Keypair();
	await requestSuiFromFaucetV2({
		host: faucetUrl,
		recipient: keypair.getPublicKey().toSuiAddress(),
	});
	return keypair;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('e2ee', () => {
	let clientConfig: TestClientConfig;
	let adminClient: TestClient;
	let adminKeypair: Ed25519Keypair;
	let messagingPackageId: string;
	let faucetUrl: string;

	beforeAll(() => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const namespaceId = inject('messagingNamespaceId');
		const adminAccount = inject('adminAccount');
		const faucetPort = inject('faucetPort');

		messagingPackageId = publishedPackages['messaging'].packageId;
		faucetUrl = `http://localhost:${faucetPort}`;
		adminKeypair = Ed25519Keypair.fromSecretKey(adminAccount.secretKey);

		clientConfig = {
			suiClientUrl,
			permissionedGroupsPackageId: publishedPackages['permissioned-groups'].packageId,
			messagingPackageId,
			namespaceId: namespaceId!,
		};

		adminClient = createTestClient(clientConfig);
	});

	// ── Test 1: Group creation stores a valid EncryptedObject on-chain ────

	it('should store a valid EncryptedObject DEK on group creation', async () => {
		const uuid = crypto.randomUUID();

		await adminClient.messaging.createAndShareGroup({
			signer: adminKeypair,
			uuid,
		});

		const encryptedKeyBytes = await adminClient.messaging.view.currentEncryptedKey({ uuid });
		expect(encryptedKeyBytes).toBeInstanceOf(Uint8Array);
		expect(encryptedKeyBytes.length).toBeGreaterThan(0);

		// Parse as EncryptedObject — validates BCS structure integrity
		const parsed = EncryptedObject.parse(encryptedKeyBytes);
		expect(parsed.version).toBe(0);
		expect(parsed.packageId).toBe(messagingPackageId);
		expect(parsed.threshold).toBe(2);

		// Verify identity bytes encode correct groupId + keyVersion=0
		const identity = decodeIdentity(fromHex(parsed.id));
		const expectedGroupId = adminClient.messaging.derive.groupId({ uuid });
		expect(identity.groupId).toBe(expectedGroupId);
		expect(identity.keyVersion).toBe(0n);
	});

	// ── Test 2: seal_approve_reader access control ───────────────────────

	it('should grant seal_approve access to creator but deny non-members', async () => {
		const uuid = crypto.randomUUID();

		await adminClient.messaging.createAndShareGroup({
			signer: adminKeypair,
			uuid,
		});

		const groupId = adminClient.messaging.derive.groupId({ uuid });
		const encryptionHistoryId = adminClient.messaging.derive.encryptionHistoryId({ uuid });

		// Creator (admin) should succeed — they get all permissions on creation
		const adminSessionKey = createSessionKey(adminKeypair, messagingPackageId);

		const adminDek = await adminClient.messaging.encryption.decrypt({
			groupId,
			encryptionHistoryId,
			keyVersion: 0n,
			sessionKey: adminSessionKey,
			envelope: {
				// Encrypt a test payload to decrypt
				...(await adminClient.messaging.encryption.encrypt({
					groupId,
					encryptionHistoryId,
					keyVersion: 0n,
					sessionKey: adminSessionKey,
					data: new TextEncoder().encode('test'),
				})),
			},
		});
		expect(adminDek).toEqual(new TextEncoder().encode('test'));

		// Non-member uses their own client (cold cache, must go through seal_approve)
		const outsiderKeypair = await fundNewKeypair(faucetUrl);
		const outsiderClient = createTestClient(clientConfig);
		const outsiderSessionKey = createSessionKey(outsiderKeypair, messagingPackageId);

		await expect(
			outsiderClient.messaging.encryption.encrypt({
				groupId,
				encryptionHistoryId,
				keyVersion: 0n,
				sessionKey: outsiderSessionKey,
				data: new TextEncoder().encode('should fail'),
			}),
		).rejects.toThrow(/seal_approve/);
	});

	// ── Test 3: Grant MessagingReader → outsider gains access ────────────

	it('should allow access after granting MessagingReader permission', async () => {
		const uuid = crypto.randomUUID();

		await adminClient.messaging.createAndShareGroup({
			signer: adminKeypair,
			uuid,
		});

		const groupId = adminClient.messaging.derive.groupId({ uuid });
		const encryptionHistoryId = adminClient.messaging.derive.encryptionHistoryId({ uuid });

		// Fund a new member — they use their own client
		const memberKeypair = await fundNewKeypair(faucetUrl);
		const memberAddress = memberKeypair.getPublicKey().toSuiAddress();
		const memberClient = createTestClient(clientConfig);
		const memberSessionKey = createSessionKey(memberKeypair, messagingPackageId);

		// Before granting: member's own client has cold cache → goes through seal_approve → denied
		await expect(
			memberClient.messaging.encryption.encrypt({
				groupId,
				encryptionHistoryId,
				keyVersion: 0n,
				sessionKey: memberSessionKey,
				data: new TextEncoder().encode('before grant'),
			}),
		).rejects.toThrow(/seal_approve/);

		// Grant all messaging permissions (includes MessagingReader)
		await adminClient.messaging.grantAllMessagingPermissions({
			signer: adminKeypair,
			groupId,
			member: memberAddress,
		});

		// After granting: admin encrypts a message
		const adminSessionKey = createSessionKey(adminKeypair, messagingPackageId);
		const envelope = await adminClient.messaging.encryption.encrypt({
			groupId,
			encryptionHistoryId,
			keyVersion: 0n,
			sessionKey: adminSessionKey,
			data: new TextEncoder().encode('hello member'),
		});

		// Member can now decrypt (fresh client, cold cache → seal_approve → allowed)
		const plaintext = await memberClient.messaging.encryption.decrypt({
			groupId,
			encryptionHistoryId,
			keyVersion: 0n,
			sessionKey: memberSessionKey,
			envelope,
		});
		expect(new TextDecoder().decode(plaintext)).toBe('hello member');
	});

	// ── Test 4: DEK encrypt/decrypt round-trip ───────────────────────────

	it('should round-trip encrypt and decrypt data via EnvelopeEncryption', async () => {
		const uuid = crypto.randomUUID();

		await adminClient.messaging.createAndShareGroup({
			signer: adminKeypair,
			uuid,
		});

		const groupId = adminClient.messaging.derive.groupId({ uuid });
		const encryptionHistoryId = adminClient.messaging.derive.encryptionHistoryId({ uuid });
		const sessionKey = createSessionKey(adminKeypair, messagingPackageId);

		const message = 'End-to-end encryption works.';
		const data = new TextEncoder().encode(message);

		const envelope = await adminClient.messaging.encryption.encrypt({
			groupId,
			encryptionHistoryId,
			keyVersion: 0n,
			sessionKey,
			data,
		});

		expect(envelope.ciphertext).toBeInstanceOf(Uint8Array);
		expect(envelope.nonce).toBeInstanceOf(Uint8Array);
		expect(envelope.nonce.length).toBe(12);
		expect(envelope.keyVersion).toBe(0n);
		// Ciphertext should differ from plaintext
		expect(envelope.ciphertext).not.toEqual(data);

		const decrypted = await adminClient.messaging.encryption.decrypt({
			groupId,
			encryptionHistoryId,
			keyVersion: 0n,
			sessionKey,
			envelope,
		});

		expect(new TextDecoder().decode(decrypted)).toBe(message);
	});

	// ── Test 5: Key rotation + multi-version decrypt ─────────────────────

	it('should rotate encryption key and decrypt both versions', async () => {
		const uuid = crypto.randomUUID();

		await adminClient.messaging.createAndShareGroup({
			signer: adminKeypair,
			uuid,
		});

		const groupId = adminClient.messaging.derive.groupId({ uuid });
		const encryptionHistoryId = adminClient.messaging.derive.encryptionHistoryId({ uuid });
		const sessionKey = createSessionKey(adminKeypair, messagingPackageId);

		// Encrypt with v0
		const v0Message = 'version zero';
		const v0Envelope = await adminClient.messaging.encryption.encrypt({
			groupId,
			encryptionHistoryId,
			keyVersion: 0n,
			sessionKey,
			data: new TextEncoder().encode(v0Message),
		});
		expect(v0Envelope.keyVersion).toBe(0n);

		// Rotate key → v1
		await adminClient.messaging.rotateEncryptionKey({
			signer: adminKeypair,
			uuid,
		});

		// Verify key version incremented
		const currentVersion = await adminClient.messaging.view.getCurrentKeyVersion({ uuid });
		expect(currentVersion).toBe(1n);

		// Encrypt with v1
		const v1Message = 'version one';
		const v1Envelope = await adminClient.messaging.encryption.encrypt({
			groupId,
			encryptionHistoryId,
			keyVersion: 1n,
			sessionKey,
			data: new TextEncoder().encode(v1Message),
		});
		expect(v1Envelope.keyVersion).toBe(1n);

		// Decrypt both versions
		const v0Decrypted = await adminClient.messaging.encryption.decrypt({
			groupId,
			encryptionHistoryId,
			keyVersion: 0n,
			sessionKey,
			envelope: v0Envelope,
		});
		expect(new TextDecoder().decode(v0Decrypted)).toBe(v0Message);

		const v1Decrypted = await adminClient.messaging.encryption.decrypt({
			groupId,
			encryptionHistoryId,
			keyVersion: 1n,
			sessionKey,
			envelope: v1Envelope,
		});
		expect(new TextDecoder().decode(v1Decrypted)).toBe(v1Message);

		// v0 and v1 encrypted DEKs should be distinct EncryptedObjects
		const v0Key = await adminClient.messaging.view.encryptedKey({ uuid, version: 0 });
		const v1Key = await adminClient.messaging.view.encryptedKey({ uuid, version: 1 });
		expect(Array.from(v0Key)).not.toEqual(Array.from(v1Key));

		// v1 identity should have keyVersion=1
		const v1Parsed = EncryptedObject.parse(v1Key);
		const v1Identity = decodeIdentity(fromHex(v1Parsed.id));
		expect(v1Identity.groupId).toBe(groupId);
		expect(v1Identity.keyVersion).toBe(1n);
	});

	// ── Test 6: Remove member triggers auto key rotation ─────────────────

	it('should auto-rotate key on member removal and deny removed member', async () => {
		const uuid = crypto.randomUUID();

		await adminClient.messaging.createAndShareGroup({
			signer: adminKeypair,
			uuid,
		});

		const groupId = adminClient.messaging.derive.groupId({ uuid });
		const encryptionHistoryId = adminClient.messaging.derive.encryptionHistoryId({ uuid });

		// Add a member — they use their own client
		const memberKeypair = await fundNewKeypair(faucetUrl);
		const memberAddress = memberKeypair.getPublicKey().toSuiAddress();
		const memberClient = createTestClient(clientConfig);

		await adminClient.messaging.grantAllMessagingPermissions({
			signer: adminKeypair,
			groupId,
			member: memberAddress,
		});

		// Verify member can access v0 (via their own client)
		const memberSessionKey = createSessionKey(memberKeypair, messagingPackageId);
		const preRemovalEnvelope = await memberClient.messaging.encryption.encrypt({
			groupId,
			encryptionHistoryId,
			keyVersion: 0n,
			sessionKey: memberSessionKey,
			data: new TextEncoder().encode('before removal'),
		});
		expect(preRemovalEnvelope.keyVersion).toBe(0n);

		// Verify current version is 0 before removal
		const versionBefore = await adminClient.messaging.view.getCurrentKeyVersion({ uuid });
		expect(versionBefore).toBe(0n);

		// Remove member (auto-rotates to v1)
		await adminClient.messaging.removeMember({
			signer: adminKeypair,
			uuid,
			member: memberAddress,
		});

		// Verify key version incremented
		const versionAfter = await adminClient.messaging.view.getCurrentKeyVersion({ uuid });
		expect(versionAfter).toBe(1n);

		// Removed member should fail seal_approve on the new key version.
		// Create a fresh client so the member has no cached DEK for v1.
		const removedMemberClient = createTestClient(clientConfig);

		await expect(
			removedMemberClient.messaging.encryption.encrypt({
				groupId,
				encryptionHistoryId,
				keyVersion: 1n,
				sessionKey: memberSessionKey,
				data: new TextEncoder().encode('should fail'),
			}),
		).rejects.toThrow(/seal_approve/);

		// Admin should still succeed on v1
		const adminSessionKey = createSessionKey(adminKeypair, messagingPackageId);

		const postRemovalEnvelope = await adminClient.messaging.encryption.encrypt({
			groupId,
			encryptionHistoryId,
			keyVersion: 1n,
			sessionKey: adminSessionKey,
			data: new TextEncoder().encode('after removal'),
		});

		const decrypted = await adminClient.messaging.encryption.decrypt({
			groupId,
			encryptionHistoryId,
			keyVersion: 1n,
			sessionKey: adminSessionKey,
			envelope: postRemovalEnvelope,
		});
		expect(new TextDecoder().decode(decrypted)).toBe('after removal');
	});

	// ── Test 7: Identity bytes encoding consistency ──────────────────────

	it('should produce consistent identity bytes across derive, store, and parse', async () => {
		const uuid = crypto.randomUUID();

		await adminClient.messaging.createAndShareGroup({
			signer: adminKeypair,
			uuid,
		});

		const groupId = adminClient.messaging.derive.groupId({ uuid });

		// Fetch DEK from chain and parse identity
		const encryptedKeyBytes = await adminClient.messaging.view.currentEncryptedKey({ uuid });
		const parsed = EncryptedObject.parse(encryptedKeyBytes);
		const identity = decodeIdentity(fromHex(parsed.id));

		// groupId from identity must match derived groupId
		expect(identity.groupId).toBe(groupId);
		// Initial key version is 0
		expect(identity.keyVersion).toBe(0n);

		// The raw identity bytes should be exactly 40 bytes (32 address + 8 u64 LE)
		const identityBytes = fromHex(parsed.id);
		expect(identityBytes.length).toBe(40);

		// First 32 bytes = groupId address bytes
		const addressHex = '0x' + Buffer.from(identityBytes.slice(0, 32)).toString('hex');
		expect(addressHex).toBe(groupId);

		// Last 8 bytes = keyVersion=0 as little-endian u64
		const versionBytes = identityBytes.slice(32, 40);
		expect(Array.from(versionBytes)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
	});
});
