// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, inject } from 'vitest';
import { SuiClient } from '@mysten/sui/client';
import { permissionedGroups } from '@mysten/permissioned-groups';

describe('permissioned-groups', () => {
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

		const suiClient = new SuiClient({ url: suiClientUrl });
		const balance = await suiClient.getBalance({
			owner: adminAccount.address,
		});

		expect(BigInt(balance.totalBalance)).toBeGreaterThan(0n);
	});

	it('should extend SuiClient with PermissionedGroupsClient', () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const packageId = publishedPackages['permissioned-groups'].packageId;
		const dummyTestWitnessPackageId = publishedPackages['dummy-test-witness'].packageId;
		const witnessType = `${dummyTestWitnessPackageId}::dummy_test_witness::DUMMY_TEST_WITNESS`;

		// Create SuiClient with MVR override for localnet
		const suiClient = new SuiClient({
			url: suiClientUrl,
			mvr: {
				overrides: {
					packages: {
						'@local-pkg/permissioned-groups': packageId,
					},
				},
			},
		});

		// Extend with PermissionedGroupsClient using the factory function
		const client = suiClient.$extend(
			permissionedGroups({
				packageConfig: { packageId },
				witnessType,
			}),
		);

		// Verify the extension is available
		expect(client.groups).toBeDefined();
		expect(client.groups.call).toBeDefined();
		expect(client.groups.tx).toBeDefined();
		expect(client.groups.bcs).toBeDefined();
	});

	it('should have BCS types with correct package-scoped names', () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const packageId = publishedPackages['permissioned-groups'].packageId;
		const dummyTestWitnessPackageId = publishedPackages['dummy-test-witness'].packageId;
		const witnessType = `${dummyTestWitnessPackageId}::dummy_test_witness::DUMMY_TEST_WITNESS`;

		const suiClient = new SuiClient({
			url: suiClientUrl,
			mvr: {
				overrides: {
					packages: {
						'@local-pkg/permissioned-groups': packageId,
					},
				},
			},
		});

		const client = suiClient.$extend(
			permissionedGroups({
				packageConfig: { packageId },
				witnessType,
			}),
		);

		// Verify BCS types are defined with correct package-scoped names
		expect(client.groups.bcs.PermissionedGroup.name).toBe(
			`${packageId}::permissioned_group::PermissionedGroup`,
		);
		expect(client.groups.bcs.Administrator.name).toBe(
			`${packageId}::permissioned_group::Administrator`,
		);
		expect(client.groups.bcs.MemberAdded.name).toBe(
			`${packageId}::permissioned_group::MemberAdded`,
		);
	});
});
