// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, inject } from 'vitest';
import { SuiClient } from '@mysten/sui/client';

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
});
