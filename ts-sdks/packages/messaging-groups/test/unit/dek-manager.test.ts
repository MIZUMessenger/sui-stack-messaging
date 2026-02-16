// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { DEKManager, DEK_LENGTH } from '../../src/encryption/dek-manager.js';
import { DefaultSealPolicy } from '../../src/encryption/seal-policy.js';
import { createMockSealClient } from './helpers/mock-seal-client.js';

const MOCK_PACKAGE_ID = '0x' + 'ab'.repeat(32);
const MOCK_VERSION_ID = '0x' + '11'.repeat(32);
const MOCK_GROUP_ID = '0x' + 'cd'.repeat(32);

describe('DEKManager', () => {
	const sealPolicy = new DefaultSealPolicy(MOCK_PACKAGE_ID, MOCK_PACKAGE_ID, MOCK_VERSION_ID);

	describe('generateDEK', () => {
		it('should generate a 32-byte DEK', async () => {
			const manager = new DEKManager({
				sealClient: createMockSealClient(),
				sealPolicy,
			});

			const result = await manager.generateDEK({ groupId: MOCK_GROUP_ID });

			expect(result.dek.length).toBe(DEK_LENGTH);
			expect(result.encryptedDek.length).toBeGreaterThan(0);
			expect(result.identityBytes.length).toBe(40);
		});

		it('should use provided keyVersion', async () => {
			const manager = new DEKManager({
				sealClient: createMockSealClient(),
				sealPolicy,
			});

			const result = await manager.generateDEK({ groupId: MOCK_GROUP_ID, keyVersion: 5n });
			const decoded = DefaultSealPolicy.decodeIdentity(result.identityBytes);

			expect(decoded.keyVersion).toBe(5n);
		});

		it('should default keyVersion to 0 when not provided', async () => {
			const manager = new DEKManager({
				sealClient: createMockSealClient(),
				sealPolicy,
			});

			const result = await manager.generateDEK({ groupId: MOCK_GROUP_ID });
			const decoded = DefaultSealPolicy.decodeIdentity(result.identityBytes);

			expect(decoded.keyVersion).toBe(0n);
		});
	});

	describe('decryptDEK', () => {
		it('should roundtrip generate + decrypt', async () => {
			const mockSealClient = createMockSealClient();
			const manager = new DEKManager({
				sealClient: mockSealClient,
				sealPolicy,
			});

			const { dek, encryptedDek } = await manager.generateDEK({ groupId: MOCK_GROUP_ID });

			// Decrypt should return the original DEK.
			// sessionKey and txBytes are unused by the mock — pass dummy values.
			const decrypted = await manager.decryptDEK({
				encryptedDek,
				sessionKey: {} as any,
				txBytes: new Uint8Array(0),
			});

			expect(Array.from(decrypted)).toEqual(Array.from(dek));
		});
	});

	describe('unhappy paths', () => {
		it('should propagate SealClient.encrypt errors', async () => {
			const failingSealClient = {
				...createMockSealClient(),
				encrypt: async () => {
					throw new Error('Seal encryption failed');
				},
			};
			const manager = new DEKManager({
				sealClient: failingSealClient as any,
				sealPolicy,
			});

			await expect(manager.generateDEK({ groupId: MOCK_GROUP_ID })).rejects.toThrow(
				'Seal encryption failed',
			);
		});

		it('should propagate SealClient.decrypt errors', async () => {
			const mockSealClient = createMockSealClient();
			const manager = new DEKManager({
				sealClient: {
					...mockSealClient,
					decrypt: async () => {
						throw new Error('Seal decryption failed');
					},
				} as any,
				sealPolicy,
			});

			const { encryptedDek } = await manager.generateDEK({ groupId: MOCK_GROUP_ID });

			await expect(
				manager.decryptDEK({
					encryptedDek,
					sessionKey: {} as any,
					txBytes: new Uint8Array(0),
				}),
			).rejects.toThrow('Seal decryption failed');
		});
	});
});
