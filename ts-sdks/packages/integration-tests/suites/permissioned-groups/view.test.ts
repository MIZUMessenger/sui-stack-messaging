// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, inject, beforeAll } from 'vitest';
import { SuiClient } from '@mysten/sui/client';
import type { ClientWithExtensions } from '@mysten/sui/experimental';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import { permissionedGroups, PermissionedGroupsClient } from '@mysten/permissioned-groups';

describe('PermissionedGroupsView', () => {
	let suiClient: ClientWithExtensions<{ groups: PermissionedGroupsClient }, SuiClient>;
	let adminKeypair: Ed25519Keypair;
	let adminAddress: string;
	let packageId: string;
	let dummyTestWitnessPackageId: string;
	let witnessType: string;
	let groupId: string;

	beforeAll(async () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const adminAccount = inject('adminAccount');

		packageId = publishedPackages['permissioned-groups'].packageId;
		dummyTestWitnessPackageId = publishedPackages['dummy-test-witness'].packageId;
		witnessType = `${dummyTestWitnessPackageId}::dummy_test_witness::DummyTestWitness`;

		// Reconstruct keypair from secret key
		adminKeypair = Ed25519Keypair.fromSecretKey(adminAccount.secretKey);
		adminAddress = adminAccount.address;

		// Create SuiClient with MVR override and extend with PermissionedGroupsClient
		const baseClient = new SuiClient({
			url: suiClientUrl,
			mvr: {
				overrides: {
					packages: {
						'@local-pkg/permissioned-groups': packageId,
					},
				},
			},
		});

		suiClient = baseClient.$extend(
			permissionedGroups({
				packageConfig: { packageId },
				witnessType,
			}),
		);

		// Create a group using dummy_test_witness::create_group
		const tx = new Transaction();
		tx.setSender(adminAddress);
		const group = tx.moveCall({
			package: dummyTestWitnessPackageId,
			module: 'dummy_test_witness',
			function: 'create_group',
		});
		tx.transferObjects([group], adminAddress);

		const result = await adminKeypair.signAndExecuteTransaction({
			transaction: tx,
			client: suiClient,
		});

		await suiClient.waitForTransaction({ digest: result.digest });

		// Extract the created group ID from the transaction effects
		const txDetails = await suiClient.getTransactionBlock({
			digest: result.digest,
			options: { showObjectChanges: true },
		});

		const createdGroup = txDetails.objectChanges?.find(
			(change) => change.type === 'created' && change.objectType.includes('PermissionedGroup'),
		);

		if (!createdGroup || createdGroup.type !== 'created') {
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
		it('should return true for Administrator permission on creator', async () => {
			const administratorType = `${packageId}::permissioned_group::Administrator`;

			const result = await suiClient.groups.view.hasPermission({
				groupId,
				member: adminAddress,
				permissionType: administratorType,
			});

			expect(result).toBe(true);
		});

		it('should return true for ExtensionPermissionsManager permission on creator', async () => {
			const extensionPermissionsManagerType = `${packageId}::permissioned_group::ExtensionPermissionsManager`;

			const result = await suiClient.groups.view.hasPermission({
				groupId,
				member: adminAddress,
				permissionType: extensionPermissionsManagerType,
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
			const administratorType = `${packageId}::permissioned_group::Administrator`;

			const result = await suiClient.groups.view.hasPermission({
				groupId,
				member: randomAddress,
				permissionType: administratorType,
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

			// Grant Administrator permission to the new member using the client
			await suiClient.groups.grantPermission({
				groupId,
				member: newMemberAddress,
				permissionType: `${packageId}::permissioned_group::Administrator`,
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
			const administratorType = `${packageId}::permissioned_group::Administrator`;

			const result = await suiClient.groups.view.hasPermission({
				groupId,
				member: newMemberAddress,
				permissionType: administratorType,
			});

			expect(result).toBe(true);
		});

		it('should return false for hasPermission on non-granted permission', async () => {
			// The new member has Administrator but not ExtensionPermissionsManager
			const extensionPermissionsManagerType = `${packageId}::permissioned_group::ExtensionPermissionsManager`;

			const result = await suiClient.groups.view.hasPermission({
				groupId,
				member: newMemberAddress,
				permissionType: extensionPermissionsManagerType,
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
