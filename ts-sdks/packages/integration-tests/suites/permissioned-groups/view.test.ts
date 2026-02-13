// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, inject, beforeAll } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import { permissionTypes } from '@mysten/permissioned-groups';

import { createPermissionedGroupsClient } from '../../src/helpers/index.js';

describe('PermissionedGroupsView', () => {
	let suiClient: ReturnType<typeof createPermissionedGroupsClient>;
	let adminKeypair: Ed25519Keypair;
	let adminAddress: string;
	let packageId: string;
	let groupId: string;

	beforeAll(async () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const adminAccount = inject('adminAccount');

		packageId = publishedPackages['permissioned-groups'].packageId;
		const dummyTestWitnessPackageId = publishedPackages['dummy-test-witness'].packageId;
		const witnessType = `${dummyTestWitnessPackageId}::dummy_test_witness::DummyTestWitness`;

		adminKeypair = Ed25519Keypair.fromSecretKey(adminAccount.secretKey);
		adminAddress = adminAccount.address;

		suiClient = createPermissionedGroupsClient({
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

		// Create a shared group using dummyTestWitness extension
		const tx = suiClient.dummyTestWitness.createAndShareGroupTx(adminAddress);

		const result = await suiClient.core.signAndExecuteTransaction({
			transaction: tx,
			signer: adminKeypair,
			include: { effects: true, objectTypes: true },
		});

		const txResult = result.Transaction ?? result.FailedTransaction;
		if (!txResult || !txResult.status.success) {
			throw new Error('Transaction failed');
		}

		await suiClient.core.waitForTransaction({ result });

		const createdGroup = txResult.effects!.changedObjects.find((obj) => {
			const objType = txResult.objectTypes?.[obj.objectId];
			return obj.idOperation === 'Created' && objType?.includes('PermissionedGroup');
		});

		if (!createdGroup) {
			throw new Error('Failed to find created PermissionedGroup');
		}

		groupId = createdGroup.objectId;
	});

	describe('isMember', () => {
		it('should return true for the group creator', async () => {
			const result = await suiClient.groups.view.isMember({
				groupId,
				member: adminAddress,
			});

			expect(result).toBe(true);
		});

		it('should return false for a non-member address', async () => {
			// Generate a random address that's not a member
			const randomKeypair = new Ed25519Keypair();
			const randomAddress = randomKeypair.getPublicKey().toSuiAddress();

			const result = await suiClient.groups.view.isMember({
				groupId,
				member: randomAddress,
			});

			expect(result).toBe(false);
		});
	});

	describe('hasPermission', () => {
		it('should return true for PermissionsAdmin permission on creator', async () => {
			const result = await suiClient.groups.view.hasPermission({
				groupId,
				member: adminAddress,
				permissionType: permissionTypes(packageId).PermissionsAdmin,
			});

			expect(result).toBe(true);
		});

		it('should return true for ExtensionPermissionsAdmin permission on creator', async () => {
			const result = await suiClient.groups.view.hasPermission({
				groupId,
				member: adminAddress,
				permissionType: permissionTypes(packageId).ExtensionPermissionsAdmin,
			});

			expect(result).toBe(true);
		});

		it('should return false for a permission the creator does not have', async () => {
			// Use a made-up permission type that doesn't exist
			const nonExistentPermissionType = `${packageId}::permissioned_group::NonExistentPermission`;

			const result = await suiClient.groups.view.hasPermission({
				groupId,
				member: adminAddress,
				permissionType: nonExistentPermissionType,
			});

			expect(result).toBe(false);
		});

		it('should return false for a non-member address', async () => {
			const randomKeypair = new Ed25519Keypair();
			const randomAddress = randomKeypair.getPublicKey().toSuiAddress();

			const result = await suiClient.groups.view.hasPermission({
				groupId,
				member: randomAddress,
				permissionType: permissionTypes(packageId).PermissionsAdmin,
			});

			expect(result).toBe(false);
		});
	});

	describe('after granting permission to new member', () => {
		let newMemberAddress: string;

		beforeAll(async () => {
			const faucetPort = inject('faucetPort');

			// Create a new member and fund them
			const newMemberKeypair = new Ed25519Keypair();
			newMemberAddress = newMemberKeypair.getPublicKey().toSuiAddress();

			// Fund the new member (needed for any future transactions they might do)
			await requestSuiFromFaucetV2({
				host: `http://localhost:${faucetPort}`,
				recipient: newMemberAddress,
			});

			// Grant PermissionsAdmin permission to the new member using the client
			await suiClient.groups.grantPermission({
				groupId,
				member: newMemberAddress,
				permissionType: permissionTypes(packageId).PermissionsAdmin,
				signer: adminKeypair,
			});
		});

		it('should return true for isMember on new member', async () => {
			const result = await suiClient.groups.view.isMember({
				groupId,
				member: newMemberAddress,
			});

			expect(result).toBe(true);
		});

		it('should return true for hasPermission on granted permission', async () => {
			const result = await suiClient.groups.view.hasPermission({
				groupId,
				member: newMemberAddress,
				permissionType: permissionTypes(packageId).PermissionsAdmin,
			});

			expect(result).toBe(true);
		});

		it('should return false for hasPermission on non-granted permission', async () => {
			// The new member has PermissionsAdmin but not ExtensionPermissionsAdmin
			const result = await suiClient.groups.view.hasPermission({
				groupId,
				member: newMemberAddress,
				permissionType: permissionTypes(packageId).ExtensionPermissionsAdmin,
			});

			expect(result).toBe(false);
		});
	});

	describe('caching behavior', () => {
		it('should use cached permissions table ID for repeated queries', async () => {
			// Make multiple queries to the same group - they should all succeed
			// and the second query should use the cached table ID
			const result1 = await suiClient.groups.view.isMember({
				groupId,
				member: adminAddress,
			});

			const result2 = await suiClient.groups.view.isMember({
				groupId,
				member: adminAddress,
			});

			expect(result1).toBe(true);
			expect(result2).toBe(true);
		});
	});
});
