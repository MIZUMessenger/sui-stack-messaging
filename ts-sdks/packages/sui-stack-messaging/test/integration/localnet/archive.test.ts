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

describe('archive', () => {
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

	it('should archive a group successfully (PermissionsAdmin)', async () => {
		const uuid = crypto.randomUUID();

		await adminClient.messaging.createAndShareGroup({
			signer: adminKeypair,
			uuid,
			name: 'Archive Test Group',
		});

		const groupId = adminClient.messaging.derive.groupId({ uuid });

		const { digest } = await adminClient.messaging.archiveGroup({
			signer: adminKeypair,
			groupId,
		});

		expect(digest).toBeDefined();
		expect(digest).toMatch(/^[A-Za-z0-9+/=]+$/);
	});

	it('should still allow members to decrypt historical messages after archive', async () => {
		const uuid = crypto.randomUUID();

		await adminClient.messaging.createAndShareGroup({
			signer: adminKeypair,
			uuid,
			name: 'Archive Decrypt Test',
		});

		const groupId = adminClient.messaging.derive.groupId({ uuid });
		const encryptionHistoryId = adminClient.messaging.derive.encryptionHistoryId({ uuid });

		// Encrypt a message before archiving
		const message = 'historical message';
		const envelope = await adminClient.messaging.encryption.encrypt({
			groupId,
			encryptionHistoryId,
			keyVersion: 0n,
			data: new TextEncoder().encode(message),
		});

		// Archive the group
		await adminClient.messaging.archiveGroup({
			signer: adminKeypair,
			groupId,
		});

		// Members should still be able to decrypt historical messages
		const decrypted = await adminClient.messaging.encryption.decrypt({
			groupId,
			encryptionHistoryId,
			envelope,
		});
		expect(new TextDecoder().decode(decrypted)).toBe(message);
	});

	it('should deny key rotation after archive (group is paused)', async () => {
		const uuid = crypto.randomUUID();

		await adminClient.messaging.createAndShareGroup({
			signer: adminKeypair,
			uuid,
			name: 'Archive Rotate Test',
		});

		const groupId = adminClient.messaging.derive.groupId({ uuid });

		await adminClient.messaging.archiveGroup({
			signer: adminKeypair,
			groupId,
		});

		await expect(
			adminClient.messaging.rotateEncryptionKey({
				signer: adminKeypair,
				uuid,
			}),
		).rejects.toThrow();
	});

	it('should deny archive without PermissionsAdmin', async () => {
		const uuid = crypto.randomUUID();

		await adminClient.messaging.createAndShareGroup({
			signer: adminKeypair,
			uuid,
			name: 'Archive Perm Test',
		});

		const groupId = adminClient.messaging.derive.groupId({ uuid });

		// Fund a member and grant only MessagingReader (not PermissionsAdmin)
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
			memberClient.messaging.archiveGroup({
				signer: member.keypair,
				groupId,
			}),
		).rejects.toThrow();
	});
});
