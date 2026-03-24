// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, inject, beforeAll } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { messagingPermissionTypes } from '@mysten/sui-stack-messaging';

import {
	createSuiStackMessagingClient,
	createFundedAccount,
	type SuiStackMessagingTestClient,
} from '../../helpers/index.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('metadata', () => {
	let adminClient: SuiStackMessagingTestClient;
	let adminKeypair: Ed25519Keypair;
	let messagingPackageId: string;
	let faucetUrl: string;

	let clientConfig: {
		suiClientUrl: string;
		permissionedGroupsPackageId: string;
		messagingPackageId: string;
		namespaceId: string;
		versionId: string;
	};

	beforeAll(() => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const namespaceId = inject('messagingNamespaceId');
		const versionId = inject('messagingVersionId');
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
			versionId: versionId!,
		};

		adminClient = createSuiStackMessagingClient({
			url: suiClientUrl,
			network: 'localnet',
			...clientConfig,
			keypair: adminKeypair,
		});
	});

	describe('setGroupName', () => {
		it('should set the group name (MetadataAdmin)', async () => {
			const uuid = crypto.randomUUID();

			await adminClient.messaging.createAndShareGroup({
				signer: adminKeypair,
				uuid,
				name: 'Original Name',
			});

			const groupId = adminClient.messaging.derive.groupId({ uuid });

			const { digest } = await adminClient.messaging.setGroupName({
				signer: adminKeypair,
				groupId,
				name: 'Updated Name',
			});

			expect(digest).toBeDefined();
			expect(digest).toMatch(/^[A-Za-z0-9+/=]+$/);
		});

		it('should deny setGroupName without MetadataAdmin', async () => {
			const uuid = crypto.randomUUID();

			await adminClient.messaging.createAndShareGroup({
				signer: adminKeypair,
				uuid,
				name: 'Perm Test Group',
			});

			const groupId = adminClient.messaging.derive.groupId({ uuid });

			// Fund a member with only MessagingReader
			const member = await createFundedAccount({ faucetUrl });
			const memberClient = createSuiStackMessagingClient({
				...clientConfig,
				url: clientConfig.suiClientUrl,
				network: 'localnet',
				keypair: member.keypair,
			});

			await adminClient.groups.grantPermission({
				signer: adminKeypair,
				groupId,
				member: member.address,
				permissionType: messagingPermissionTypes(messagingPackageId).MessagingReader,
			});

			await expect(
				memberClient.messaging.setGroupName({
					signer: member.keypair,
					groupId,
					name: 'Unauthorized Name',
				}),
			).rejects.toThrow();
		});
	});

	describe('groupMetadata', () => {
		it('should fetch metadata for a newly created group', async () => {
			const uuid = crypto.randomUUID();
			const name = 'Metadata View Test';

			await adminClient.messaging.createAndShareGroup({
				signer: adminKeypair,
				uuid,
				name,
			});

			const groupId = adminClient.messaging.derive.groupId({ uuid });
			const metadata = await adminClient.messaging.view.groupMetadata({ groupId });

			expect(metadata.name).toBe(name);
			expect(metadata.uuid).toBe(uuid);
			expect(metadata.creator).toBe(adminKeypair.getPublicKey().toSuiAddress());
		});

		it('should return cached value until refresh is used', async () => {
			const uuid = crypto.randomUUID();

			await adminClient.messaging.createAndShareGroup({
				signer: adminKeypair,
				uuid,
				name: 'Before',
			});

			const groupId = adminClient.messaging.derive.groupId({ uuid });

			// Populate the cache with 'Before'
			const initial = await adminClient.messaging.view.groupMetadata({ groupId });
			expect(initial.name).toBe('Before');

			// Mutate on-chain
			await adminClient.messaging.setGroupName({
				signer: adminKeypair,
				groupId,
				name: 'After',
			});

			// Cached value should still be 'Before'
			const cached = await adminClient.messaging.view.groupMetadata({ groupId });
			expect(cached.name).toBe('Before');

			// Refresh should return 'After'
			const refreshed = await adminClient.messaging.view.groupMetadata({
				groupId,
				refresh: true,
			});
			expect(refreshed.name).toBe('After');
		});
	});

	describe('insertGroupData / removeGroupData', () => {
		it('should insert and remove key-value data (MetadataAdmin)', async () => {
			const uuid = crypto.randomUUID();

			await adminClient.messaging.createAndShareGroup({
				signer: adminKeypair,
				uuid,
				name: 'Data Test Group',
			});

			const groupId = adminClient.messaging.derive.groupId({ uuid });

			// Insert a key-value pair
			const { digest: insertDigest } = await adminClient.messaging.insertGroupData({
				signer: adminKeypair,
				groupId,
				key: 'topic',
				value: 'engineering',
			});
			expect(insertDigest).toBeDefined();

			// Remove the key-value pair
			const { digest: removeDigest } = await adminClient.messaging.removeGroupData({
				signer: adminKeypair,
				groupId,
				key: 'topic',
			});
			expect(removeDigest).toBeDefined();
		});

		it('should deny insertGroupData without MetadataAdmin', async () => {
			const uuid = crypto.randomUUID();

			await adminClient.messaging.createAndShareGroup({
				signer: adminKeypair,
				uuid,
				name: 'Data Perm Test',
			});

			const groupId = adminClient.messaging.derive.groupId({ uuid });

			const member = await createFundedAccount({ faucetUrl });
			const memberClient = createSuiStackMessagingClient({
				...clientConfig,
				url: clientConfig.suiClientUrl,
				network: 'localnet',
				keypair: member.keypair,
			});

			await adminClient.groups.grantPermission({
				signer: adminKeypair,
				groupId,
				member: member.address,
				permissionType: messagingPermissionTypes(messagingPackageId).MessagingReader,
			});

			await expect(
				memberClient.messaging.insertGroupData({
					signer: member.keypair,
					groupId,
					key: 'topic',
					value: 'unauthorized',
				}),
			).rejects.toThrow();
		});
	});
});
