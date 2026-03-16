// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, inject, beforeAll } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromHex } from '@mysten/sui/utils';
import { EncryptedObject } from '@mysten/seal';
import { DefaultSealPolicy } from '@mysten/messaging-groups';

import {
	createSuiClient,
	createMessagingGroupsClient,
	type MessagingGroupsTestClient,
} from '../../helpers/index.js';

describe('MessagingGroupsView', () => {
	let client: MessagingGroupsTestClient;
	let adminKeypair: Ed25519Keypair;

	beforeAll(() => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const namespaceId = inject('messagingNamespaceId');
		const versionId = inject('messagingVersionId');
		const adminAccount = inject('adminAccount');

		adminKeypair = Ed25519Keypair.fromSecretKey(adminAccount.secretKey);

		client = createMessagingGroupsClient({
			url: suiClientUrl,
			network: 'localnet',
			permissionedGroupsPackageId: publishedPackages['permissioned-groups'].packageId,
			messagingPackageId: publishedPackages['messaging'].packageId,
			namespaceId: namespaceId!,
			versionId: versionId!,
			keypair: adminKeypair,
		});
	});

	describe('derive', () => {
		it('should derive correct object IDs from UUID', async () => {
			const uuid = crypto.randomUUID();

			const expectedGroupId = client.messaging.derive.groupId({ uuid });
			const expectedEncryptionHistoryId = client.messaging.derive.encryptionHistoryId({
				uuid,
			});

			await client.messaging.createAndShareGroup({
				signer: adminKeypair,
				uuid,
				name: 'Test Group',
			});

			// Verify derived IDs match actual on-chain objects
			const suiClientUrl = inject('suiClientUrl');
			const verifyClient = createSuiClient({ url: suiClientUrl, network: 'localnet' });

			const { object: groupObj } = await verifyClient.core.getObject({
				objectId: expectedGroupId,
			});
			expect(groupObj.objectId).toBe(expectedGroupId);

			const { object: historyObj } = await verifyClient.core.getObject({
				objectId: expectedEncryptionHistoryId,
			});
			expect(historyObj.objectId).toBe(expectedEncryptionHistoryId);
		});
	});

	describe('encryptedKey', () => {
		it('should read back encrypted key via view (by UUID)', async () => {
			const uuid = crypto.randomUUID();

			await client.messaging.createAndShareGroup({
				signer: adminKeypair,
				uuid,
				name: 'Test Group',
			});

			const currentKey = await client.messaging.view.currentEncryptedKey({ uuid });
			expect(currentKey).toBeInstanceOf(Uint8Array);
			expect(currentKey.length).toBeGreaterThan(0);

			// Parse as EncryptedObject — valid BCS from mock SealClient
			const parsed = EncryptedObject.parse(currentKey);
			expect(parsed.version).toBe(0);
			expect(parsed.threshold).toBe(2);

			// Verify identity bytes encode the correct group ID and key version 0
			const identity = DefaultSealPolicy.decodeIdentity(fromHex(parsed.id));
			const expectedGroupId = client.messaging.derive.groupId({ uuid });
			expect(identity.groupId).toBe(expectedGroupId);
			expect(identity.keyVersion).toBe(0n);

			// Also verify encryptedKey with explicit version
			const keyV0 = await client.messaging.view.encryptedKey({ uuid, version: 0 });
			expect(Array.from(keyV0)).toEqual(Array.from(currentKey));
		});

		it('should read back encrypted key via view (by encryptionHistoryId)', async () => {
			const uuid = crypto.randomUUID();

			await client.messaging.createAndShareGroup({
				signer: adminKeypair,
				uuid,
				name: 'Test Group',
			});

			const encryptionHistoryId = client.messaging.derive.encryptionHistoryId({ uuid });

			const currentKey = await client.messaging.view.currentEncryptedKey({
				encryptionHistoryId,
			});
			expect(currentKey).toBeInstanceOf(Uint8Array);

			const parsed = EncryptedObject.parse(currentKey);
			expect(parsed.version).toBe(0);
		});
	});
});
