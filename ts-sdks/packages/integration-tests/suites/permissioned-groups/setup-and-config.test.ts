// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, inject } from 'vitest';
import { permissionTypes } from '@mysten/permissioned-groups';

import { createSuiClient, createPermissionedGroupsClient } from '../../src/helpers/index.js';

describe('permissioned-groups: Setup & Configuration', () => {
	it('should have published the packages', () => {
		const publishedPackages = inject('publishedPackages');
		expect(publishedPackages['permissioned-groups']).toBeDefined();
		expect(publishedPackages['permissioned-groups'].packageId).toBeDefined();
		expect(publishedPackages['dummy-test-witness']).toBeDefined();
		expect(publishedPackages['dummy-test-witness'].packageId).toBeDefined();
	});

	it('should have a working sui client', async () => {
		const suiClientUrl = inject('suiClientUrl');
		const adminAccount = inject('adminAccount');

		const suiClient = createSuiClient({ url: suiClientUrl, network: 'localnet' });
		const { balance } = await suiClient.core.getBalance({
			owner: adminAccount.address,
		});

		expect(BigInt(balance.balance)).toBeGreaterThan(0n);
	});

	it('should extend SuiClient with PermissionedGroupsClient and dummyTestWitness', () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const packageId = publishedPackages['permissioned-groups'].packageId;
		const dummyTestWitnessPackageId = publishedPackages['dummy-test-witness'].packageId;
		const witnessType = `${dummyTestWitnessPackageId}::dummy_test_witness::DummyTestWitness`;

		const client = createPermissionedGroupsClient({
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

		expect(client.groups).toBeDefined();
		expect(client.groups.call).toBeDefined();
		expect(client.groups.tx).toBeDefined();
		expect(client.groups.bcs).toBeDefined();
		expect(client.dummyTestWitness).toBeDefined();
		expect(client.dummyTestWitness.createAndShareGroupTx).toBeTypeOf('function');
	});

	it('should have BCS types with correct package-scoped names', () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const packageId = publishedPackages['permissioned-groups'].packageId;
		const dummyTestWitnessPackageId = publishedPackages['dummy-test-witness'].packageId;
		const witnessType = `${dummyTestWitnessPackageId}::dummy_test_witness::DummyTestWitness`;

		const client = createPermissionedGroupsClient({
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

		expect(client.groups.bcs.PermissionedGroup.name).toBe(
			`${packageId}::permissioned_group::PermissionedGroup<${witnessType}>`,
		);
		expect(client.groups.bcs.PermissionsAdmin.name).toBe(
			permissionTypes(packageId).PermissionsAdmin,
		);
		expect(client.groups.bcs.MemberAdded.name).toBe(
			`${packageId}::permissioned_group::MemberAdded<${witnessType}>`,
		);
	});
});
