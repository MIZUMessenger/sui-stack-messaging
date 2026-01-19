// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, inject } from 'vitest';

describe('messaging', () => {
	it('should have published both packages', () => {
		const publishedPackages = inject('publishedPackages');
		expect(publishedPackages['permissioned-groups']).toBeDefined();
		expect(publishedPackages['messaging']).toBeDefined();
	});

	it('should have a working sui client', async () => {
		const suiClient = inject('suiClient');
		const adminAccount = inject('adminAccount');

		const balance = await suiClient.getBalance({
			owner: adminAccount.address,
		});

		expect(BigInt(balance.totalBalance)).toBeGreaterThan(0n);
	});
});
