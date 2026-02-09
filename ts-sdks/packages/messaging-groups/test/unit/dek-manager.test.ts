// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import {
	DEKManager,
	DEK_LENGTH,
	IDENTITY_BYTES_LENGTH,
	encodeIdentity,
	decodeIdentity,
} from '../../src/encryption/dek-manager.js';
import { createMockSealClient } from './helpers/mock-seal-client.js';

const MOCK_PACKAGE_ID = '0x' + 'ab'.repeat(32);
const MOCK_GROUP_ID = '0x' + 'cd'.repeat(32);

describe('encodeIdentity / decodeIdentity', () => {
	it('should produce exactly 40 bytes', () => {
		const bytes = encodeIdentity({ groupId: MOCK_GROUP_ID, keyVersion: 0n });
		expect(bytes.length).toBe(IDENTITY_BYTES_LENGTH);
	});

	it('should roundtrip identity encode/decode', () => {
		const identity = { groupId: MOCK_GROUP_ID, keyVersion: 42n };
		const bytes = encodeIdentity(identity);
		const decoded = decodeIdentity(bytes);

		expect(decoded.groupId).toBe(MOCK_GROUP_ID);
		expect(decoded.keyVersion).toBe(42n);
	});

	it('should encode keyVersion as little-endian u64', () => {
		const bytes = encodeIdentity({ groupId: MOCK_GROUP_ID, keyVersion: 1n });

		// keyVersion is the last 8 bytes
		const keyVersionBytes = bytes.slice(32);
		expect(keyVersionBytes[0]).toBe(1); // LE: least significant byte first
		expect(keyVersionBytes[7]).toBe(0);
	});

	it('should throw on invalid identity bytes length', () => {
		expect(() => decodeIdentity(new Uint8Array(39))).toThrow('Invalid identity bytes length');
		expect(() => decodeIdentity(new Uint8Array(41))).toThrow('Invalid identity bytes length');
	});
});

describe('DEKManager', () => {
	it('should generate a 32-byte DEK', async () => {
		const manager = new DEKManager({
			sealClient: createMockSealClient(),
			packageId: MOCK_PACKAGE_ID,
		});

		const result = await manager.generateDEK({ groupId: MOCK_GROUP_ID });

		expect(result.dek.length).toBe(DEK_LENGTH);
		expect(result.encryptedDek.length).toBeGreaterThan(0);
		expect(result.identity.groupId).toBe(MOCK_GROUP_ID);
		expect(result.identity.keyVersion).toBe(0n);
	});

	it('should use provided keyVersion', async () => {
		const manager = new DEKManager({
			sealClient: createMockSealClient(),
			packageId: MOCK_PACKAGE_ID,
		});

		const result = await manager.generateDEK({ groupId: MOCK_GROUP_ID, keyVersion: 5n });

		expect(result.identity.keyVersion).toBe(5n);
	});

	it('should roundtrip generate + decrypt', async () => {
		const mockSealClient = createMockSealClient();
		const manager = new DEKManager({
			sealClient: mockSealClient,
			packageId: MOCK_PACKAGE_ID,
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
