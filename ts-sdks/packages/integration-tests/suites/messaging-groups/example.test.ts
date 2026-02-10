// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, inject } from 'vitest';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromHex } from '@mysten/sui/utils';
import { EncryptedObject } from '@mysten/seal';
import { permissionedGroups } from '@mysten/permissioned-groups';
import { messagingGroups, decodeIdentity } from '@mysten/messaging-groups';

import { createMockSealClient } from '../../src/seal-mock/index.js';
import { ClientWithCoreApi } from '@mysten/sui/client';

/**
 * Creates a test client with PermissionedGroups, mock Seal, and MessagingGroups extensions.
 */
function createTestClient(options: {
	suiClientUrl: string;
	permissionedGroupsPackageId: string;
	messagingPackageId: string;
	namespaceId: string;
}) {
	const { suiClientUrl, permissionedGroupsPackageId, messagingPackageId, namespaceId } = options;
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

describe('messaging-groups', () => {
	it('should have published both packages', () => {
		const publishedPackages = inject('publishedPackages');
		expect(publishedPackages['permissioned-groups']).toBeDefined();
		expect(publishedPackages['permissioned-groups'].packageId).toBeDefined();
		expect(publishedPackages['messaging']).toBeDefined();
		expect(publishedPackages['messaging'].packageId).toBeDefined();
	});

	it('should have found the MessagingNamespace', () => {
		const namespaceId = inject('messagingNamespaceId');
		expect(namespaceId).toBeDefined();
		expect(namespaceId).toMatch(/^0x[a-f0-9]+$/);
	});

	it('should have a working sui client', async () => {
		const suiClientUrl = inject('suiClientUrl');
		const adminAccount = inject('adminAccount');

		const suiClient = new SuiJsonRpcClient({ url: suiClientUrl, network: 'localnet' });
		const balance = await suiClient.getBalance({
			owner: adminAccount.address,
		});

		expect(BigInt(balance.totalBalance)).toBeGreaterThan(0n);
	});

	it('should extend SuiClient with PermissionedGroups, Seal, and MessagingGroups', () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const namespaceId = inject('messagingNamespaceId');

		const client = createTestClient({
			suiClientUrl,
			permissionedGroupsPackageId: publishedPackages['permissioned-groups'].packageId,
			messagingPackageId: publishedPackages['messaging'].packageId,
			namespaceId: namespaceId!,
		});

		expect(client.groups).toBeDefined();
		expect(client.groups.call).toBeDefined();
		expect(client.groups.tx).toBeDefined();
		expect(client.groups.bcs).toBeDefined();

		expect(client.seal).toBeDefined();

		expect(client.messaging).toBeDefined();
		expect(client.messaging.call).toBeDefined();
		expect(client.messaging.tx).toBeDefined();
		expect(client.messaging.view).toBeDefined();
		expect(client.messaging.bcs).toBeDefined();
	});

	it('should have BCS types with correct package-scoped names', () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const namespaceId = inject('messagingNamespaceId');
		const messagingPackageId = publishedPackages['messaging'].packageId;

		const client = createTestClient({
			suiClientUrl,
			permissionedGroupsPackageId: publishedPackages['permissioned-groups'].packageId,
			messagingPackageId,
			namespaceId: namespaceId!,
		});

		expect(client.messaging.bcs.Messaging.name).toBe(`${messagingPackageId}::messaging::Messaging`);
		expect(client.messaging.bcs.MessagingNamespace.name).toBe(
			`${messagingPackageId}::messaging::MessagingNamespace`,
		);
		expect(client.messaging.bcs.MessagingSender.name).toBe(
			`${messagingPackageId}::messaging::MessagingSender`,
		);
		expect(client.messaging.bcs.MessagingReader.name).toBe(
			`${messagingPackageId}::messaging::MessagingReader`,
		);
		expect(client.messaging.bcs.EncryptionHistory.name).toBe(
			`${messagingPackageId}::encryption_history::EncryptionHistory`,
		);
		expect(client.messaging.bcs.EncryptionKeyRotator.name).toBe(
			`${messagingPackageId}::encryption_history::EncryptionKeyRotator`,
		);
	});

	it('should create a messaging group transaction', () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const namespaceId = inject('messagingNamespaceId');

		const client = createTestClient({
			suiClientUrl,
			permissionedGroupsPackageId: publishedPackages['permissioned-groups'].packageId,
			messagingPackageId: publishedPackages['messaging'].packageId,
			namespaceId: namespaceId!,
		});

		// createAndShareGroup now handles DEK generation internally via async thunk
		const tx = client.messaging.tx.createAndShareGroup();

		expect(tx).toBeDefined();
		expect(tx.getData).toBeDefined();
	});

	it('should create and share a messaging group on-chain', async () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const namespaceId = inject('messagingNamespaceId');
		const adminAccount = inject('adminAccount');

		const client = createTestClient({
			suiClientUrl,
			permissionedGroupsPackageId: publishedPackages['permissioned-groups'].packageId,
			messagingPackageId: publishedPackages['messaging'].packageId,
			namespaceId: namespaceId!,
		});

		const keypair = Ed25519Keypair.fromSecretKey(adminAccount.secretKey);

		const result = await client.messaging.createAndShareGroup({
			signer: keypair,
		});

		expect(result.digest).toBeDefined();
		expect(result.digest).toMatch(/^[A-Za-z0-9+/=]+$/);
	});

	it('should derive correct object IDs from UUID', async () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const namespaceId = inject('messagingNamespaceId');
		const adminAccount = inject('adminAccount');

		const client = createTestClient({
			suiClientUrl,
			permissionedGroupsPackageId: publishedPackages['permissioned-groups'].packageId,
			messagingPackageId: publishedPackages['messaging'].packageId,
			namespaceId: namespaceId!,
		});

		const suiClient = new SuiJsonRpcClient({ url: suiClientUrl, network: 'localnet' });
		const keypair = Ed25519Keypair.fromSecretKey(adminAccount.secretKey);

		const uuid = crypto.randomUUID();

		// Derive expected IDs before creation
		const expectedGroupId = client.messaging.derive.groupId({ uuid });
		const expectedEncryptionHistoryId = client.messaging.derive.encryptionHistoryId({ uuid });

		// Create the group on-chain (pass uuid for deterministic derivation)
		const result = await client.messaging.createAndShareGroup({
			signer: keypair,
			uuid,
		});

		expect(result.digest).toBeDefined();

		// Verify derived IDs match actual on-chain objects
		const groupObj = await suiClient.getObject({ id: expectedGroupId });
		expect(groupObj.data).toBeDefined();
		expect(groupObj.data?.objectId).toBe(expectedGroupId);

		const historyObj = await suiClient.getObject({ id: expectedEncryptionHistoryId });
		expect(historyObj.data).toBeDefined();
		expect(historyObj.data?.objectId).toBe(expectedEncryptionHistoryId);
	});

	it('should read back encrypted key via view (by UUID)', async () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const namespaceId = inject('messagingNamespaceId');
		const adminAccount = inject('adminAccount');

		const client = createTestClient({
			suiClientUrl,
			permissionedGroupsPackageId: publishedPackages['permissioned-groups'].packageId,
			messagingPackageId: publishedPackages['messaging'].packageId,
			namespaceId: namespaceId!,
		});

		const keypair = Ed25519Keypair.fromSecretKey(adminAccount.secretKey);
		const uuid = crypto.randomUUID();

		await client.messaging.createAndShareGroup({
			signer: keypair,
			uuid,
		});

		// Read back using UUID
		const currentKey = await client.messaging.view.currentEncryptedKey({ uuid });
		expect(currentKey).toBeInstanceOf(Uint8Array);
		expect(currentKey.length).toBeGreaterThan(0);

		// Parse as EncryptedObject — valid BCS from mock SealClient
		const parsed = EncryptedObject.parse(currentKey);
		expect(parsed.version).toBe(0);
		expect(parsed.threshold).toBe(2);

		// Verify identity bytes encode the correct group ID and key version 0
		const identity = decodeIdentity(fromHex(parsed.id));
		const expectedGroupId = client.messaging.derive.groupId({ uuid });
		expect(identity.groupId).toBe(expectedGroupId);
		expect(identity.keyVersion).toBe(0n);

		// Also verify encryptedKey with explicit version
		const keyV0 = await client.messaging.view.encryptedKey({ uuid, version: 0 });
		expect(Array.from(keyV0)).toEqual(Array.from(currentKey));
	});

	it('should read back encrypted key via view (by encryptionHistoryId)', async () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const namespaceId = inject('messagingNamespaceId');
		const adminAccount = inject('adminAccount');

		const client = createTestClient({
			suiClientUrl,
			permissionedGroupsPackageId: publishedPackages['permissioned-groups'].packageId,
			messagingPackageId: publishedPackages['messaging'].packageId,
			namespaceId: namespaceId!,
		});

		const keypair = Ed25519Keypair.fromSecretKey(adminAccount.secretKey);
		const uuid = crypto.randomUUID();

		await client.messaging.createAndShareGroup({
			signer: keypair,
			uuid,
		});

		const encryptionHistoryId = client.messaging.derive.encryptionHistoryId({ uuid });

		const currentKey = await client.messaging.view.currentEncryptedKey({ encryptionHistoryId });
		expect(currentKey).toBeInstanceOf(Uint8Array);

		// Verify it's a valid EncryptedObject
		const parsed = EncryptedObject.parse(currentKey);
		expect(parsed.version).toBe(0);
	});
});
