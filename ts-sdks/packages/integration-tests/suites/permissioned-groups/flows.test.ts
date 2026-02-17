// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, inject, beforeAll } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import { permissionTypes } from '@mysten/permissioned-groups';

import { createPermissionedGroupsClient } from '../../src/helpers/index.js';

describe('Full Flows', () => {
	let client: ReturnType<typeof createPermissionedGroupsClient>;
	let adminKeypair: Ed25519Keypair;
	let faucetUrl: string;

	/**
	 * Executes the `dummyTestWitness.createAndShareGroupTx` extension
	 * and returns the shared group's object ID.
	 */
	async function createAndShareGroup(): Promise<string> {
		const tx = client.dummyTestWitness.createAndShareGroupTx(
			adminKeypair.getPublicKey().toSuiAddress(),
		);

		const result = await client.core.signAndExecuteTransaction({
			transaction: tx,
			signer: adminKeypair,
			include: { effects: true, objectTypes: true },
		});

		const txResult = result.Transaction ?? result.FailedTransaction;
		if (!txResult || !txResult.status.success) {
			throw new Error('Failed to create group');
		}

		await client.core.waitForTransaction({ result });

		// Find the created PermissionedGroup from effects + objectTypes
		const created = txResult.effects!.changedObjects.find((obj) => {
			const objType = txResult.objectTypes?.[obj.objectId];
			return obj.idOperation === 'Created' && objType?.includes('PermissionedGroup');
		});

		if (!created) {
			throw new Error('Failed to find created PermissionedGroup in effects');
		}

		return created.objectId;
	}

	beforeAll(() => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const adminAccount = inject('adminAccount');
		const faucetPort = inject('faucetPort');

		const packageId = publishedPackages['permissioned-groups'].packageId;
		const dummyTestWitnessPackageId = publishedPackages['dummy-test-witness'].packageId;
		const witnessType = `${dummyTestWitnessPackageId}::dummy_test_witness::DummyTestWitness`;
		faucetUrl = `http://localhost:${faucetPort}`;

		adminKeypair = Ed25519Keypair.fromSecretKey(adminAccount.secretKey);

		client = createPermissionedGroupsClient({
			url: suiClientUrl,
			network: 'localnet',
			packageId,
			witnessType,
			dummyTestWitnessPackageId,
			mvr: {
				overrides: {
					packages: { '@local-pkg/permissioned-groups': packageId },
				},
			},
		});
	});

	describe('grant -> verify -> revoke -> verify', () => {
		it('should grant permission, verify it exists, revoke it, verify it is gone', async () => {
			const groupId = await createAndShareGroup();

			const memberKeypair = new Ed25519Keypair();
			const memberAddress = memberKeypair.getPublicKey().toSuiAddress();
			await requestSuiFromFaucetV2({ host: faucetUrl, recipient: memberAddress });

			const packageId = inject('publishedPackages')['permissioned-groups'].packageId;
			const permissionType = permissionTypes(packageId).PermissionsAdmin;

			// Grant PermissionsAdmin to the new member
			await client.groups.grantPermission({
				groupId,
				member: memberAddress,
				permissionType,
				signer: adminKeypair,
			});

			expect(
				await client.groups.view.hasPermission({
					groupId,
					member: memberAddress,
					permissionType,
				}),
			).toBe(true);

			// Revoke it
			await client.groups.revokePermission({
				groupId,
				member: memberAddress,
				permissionType,
				signer: adminKeypair,
			});

			expect(
				await client.groups.view.hasPermission({
					groupId,
					member: memberAddress,
					permissionType,
				}),
			).toBe(false);
		});

		it('should auto-remove member when last permission is revoked', async () => {
			const groupId = await createAndShareGroup();

			const memberKeypair = new Ed25519Keypair();
			const memberAddress = memberKeypair.getPublicKey().toSuiAddress();
			await requestSuiFromFaucetV2({ host: faucetUrl, recipient: memberAddress });

			const packageId = inject('publishedPackages')['permissioned-groups'].packageId;
			const permissionType = permissionTypes(packageId).PermissionsAdmin;

			await client.groups.grantPermission({
				groupId,
				member: memberAddress,
				permissionType,
				signer: adminKeypair,
			});

			expect(await client.groups.view.isMember({ groupId, member: memberAddress })).toBe(true);

			// Revoke the only permission — member should be auto-removed
			await client.groups.revokePermission({
				groupId,
				member: memberAddress,
				permissionType,
				signer: adminKeypair,
			});

			expect(await client.groups.view.isMember({ groupId, member: memberAddress })).toBe(false);
		});
	});

	describe('remove member', () => {
		it('should remove a member and verify they are no longer a member', async () => {
			const groupId = await createAndShareGroup();

			const memberKeypair = new Ed25519Keypair();
			const memberAddress = memberKeypair.getPublicKey().toSuiAddress();
			await requestSuiFromFaucetV2({ host: faucetUrl, recipient: memberAddress });

			const packageId = inject('publishedPackages')['permissioned-groups'].packageId;
			await client.groups.grantPermission({
				groupId,
				member: memberAddress,
				permissionType: permissionTypes(packageId).PermissionsAdmin,
				signer: adminKeypair,
			});

			expect(await client.groups.view.isMember({ groupId, member: memberAddress })).toBe(true);

			await client.groups.removeMember({
				groupId,
				member: memberAddress,
				signer: adminKeypair,
			});

			expect(await client.groups.view.isMember({ groupId, member: memberAddress })).toBe(false);
		});
	});
});
