// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, inject } from 'vitest';
import { SuiClient } from '@mysten/sui/client';
import { permissionedGroups } from '@mysten/permissioned-groups';

describe('permissioned-groups', () => {
	it('should have published the package', () => {
		const publishedPackages = inject('publishedPackages');
		expect(publishedPackages['permissioned-groups']).toBeDefined();
		expect(publishedPackages['permissioned-groups'].packageId).toBeDefined();
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
			}),
		);

		// Verify the extension is available
		expect(client.groups).toBeDefined();
		expect(client.groups.calls).toBeDefined();
		expect(client.groups.tx).toBeDefined();
		expect(client.groups.bcs).toBeDefined();
	});
});
