// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, inject } from 'vitest';
import { createSuiClient } from '../../src/helpers/create-sui-client.js';

describe('Setup & Configuration', () => {
	it('should have published all packages', () => {
		const publishedPackages = inject('publishedPackages');
		expect(publishedPackages['permissioned-groups']).toBeDefined();
		expect(publishedPackages['messaging']).toBeDefined();
		expect(publishedPackages['example-app']).toBeDefined();
	});

	it('should have found the MessagingNamespace', () => {
		const namespaceId = inject('messagingNamespaceId');
		expect(namespaceId).toBeDefined();
		expect(namespaceId).toMatch(/^0x[0-9a-f]+$/);
	});

	it('should have found the Version shared object', () => {
		const versionId = inject('messagingVersionId');
		expect(versionId).toBeDefined();
		expect(versionId).toMatch(/^0x[0-9a-f]+$/);
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
});
