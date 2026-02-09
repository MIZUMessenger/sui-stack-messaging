// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SessionKey } from '@mysten/seal';
import type { SealCompatibleClient } from '@mysten/seal';
import { ClientCache, type ClientWithCoreApi } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { describe, expect, it } from 'vitest';

import type { MessagingGroupsView } from '../../src/view.js';
import { EnvelopeEncryption } from '../../src/encryption/envelope-encryption.js';
import { DEK_LENGTH, NONCE_LENGTH } from '../../src/encryption/dek-manager.js';
import { createMockSealClient } from './helpers/mock-seal-client.js';

const MOCK_PACKAGE_ID = '0x' + 'ab'.repeat(32);
const MOCK_GROUP_ID = '0x' + 'cd'.repeat(32);
const MOCK_ENCRYPTION_HISTORY_ID = '0x' + 'ef'.repeat(32);

const mockSealSuiClient = {} as SealCompatibleClient;

function createTestSessionKey(): SessionKey {
	const keypair = Ed25519Keypair.generate();
	return SessionKey.import(
		{
			address: keypair.getPublicKey().toSuiAddress(),
			packageId: '0x' + '00'.repeat(32),
			creationTimeMs: Date.now(),
			ttlMin: 30,
			sessionKey: keypair.getSecretKey(),
		},
		mockSealSuiClient,
	);
}

function createMockSuiClient(): ClientWithCoreApi {
	return {
		cache: new ClientCache(),
	} as unknown as ClientWithCoreApi;
}

function createMockView(): MessagingGroupsView {
	return {} as MessagingGroupsView;
}

function createEnvelopeEncryption() {
	return new EnvelopeEncryption({
		sealClient: createMockSealClient(),
		suiClient: createMockSuiClient(),
		view: createMockView(),
		packageId: MOCK_PACKAGE_ID,
	});
}

describe('EnvelopeEncryption', () => {
	describe('generateDEK', () => {
		it('should generate a 32-byte DEK with encrypted counterpart', async () => {
			const ee = createEnvelopeEncryption();

			const result = await ee.generateDEK({ groupId: MOCK_GROUP_ID });

			expect(result.dek.length).toBe(DEK_LENGTH);
			expect(result.encryptedDek.length).toBeGreaterThan(0);
			expect(result.identity.groupId).toBe(MOCK_GROUP_ID);
			expect(result.identity.keyVersion).toBe(0n);
		});

		it('should use provided keyVersion', async () => {
			const ee = createEnvelopeEncryption();

			const result = await ee.generateDEK({ groupId: MOCK_GROUP_ID, keyVersion: 3n });

			expect(result.identity.keyVersion).toBe(3n);
		});
	});

	describe('encrypt / decrypt roundtrip', () => {
		it('should roundtrip encrypt and decrypt data', async () => {
			const ee = createEnvelopeEncryption();
			const sessionKey = createTestSessionKey();
			const plaintext = new TextEncoder().encode('hello world');

			// Generate DEK first — this warms the cache
			await ee.generateDEK({ groupId: MOCK_GROUP_ID, keyVersion: 0n });

			const envelope = await ee.encrypt({
				groupId: MOCK_GROUP_ID,
				encryptionHistoryId: MOCK_ENCRYPTION_HISTORY_ID,
				keyVersion: 0n,
				sessionKey,
				data: plaintext,
			});

			expect(envelope.ciphertext.length).toBeGreaterThan(plaintext.length);
			expect(envelope.nonce.length).toBe(NONCE_LENGTH);
			expect(envelope.keyVersion).toBe(0n);

			const decrypted = await ee.decrypt({
				groupId: MOCK_GROUP_ID,
				encryptionHistoryId: MOCK_ENCRYPTION_HISTORY_ID,
				keyVersion: 0n,
				sessionKey,
				envelope,
			});

			expect(new TextDecoder().decode(decrypted)).toBe('hello world');
		});

		it('should roundtrip with additional authenticated data', async () => {
			const ee = createEnvelopeEncryption();
			const sessionKey = createTestSessionKey();
			const plaintext = new TextEncoder().encode('secret message');
			const aad = new TextEncoder().encode('metadata');

			await ee.generateDEK({ groupId: MOCK_GROUP_ID, keyVersion: 0n });

			const envelope = await ee.encrypt({
				groupId: MOCK_GROUP_ID,
				encryptionHistoryId: MOCK_ENCRYPTION_HISTORY_ID,
				keyVersion: 0n,
				sessionKey,
				data: plaintext,
				aad,
			});

			expect(envelope.aad).toEqual(aad);

			const decrypted = await ee.decrypt({
				groupId: MOCK_GROUP_ID,
				encryptionHistoryId: MOCK_ENCRYPTION_HISTORY_ID,
				keyVersion: 0n,
				sessionKey,
				envelope,
			});

			expect(new TextDecoder().decode(decrypted)).toBe('secret message');
		});

		it('should fail decryption with wrong AAD', async () => {
			const ee = createEnvelopeEncryption();
			const sessionKey = createTestSessionKey();
			const plaintext = new TextEncoder().encode('secret');

			await ee.generateDEK({ groupId: MOCK_GROUP_ID, keyVersion: 0n });

			const envelope = await ee.encrypt({
				groupId: MOCK_GROUP_ID,
				encryptionHistoryId: MOCK_ENCRYPTION_HISTORY_ID,
				keyVersion: 0n,
				sessionKey,
				data: plaintext,
				aad: new TextEncoder().encode('correct aad'),
			});

			// Tamper with AAD
			envelope.aad = new TextEncoder().encode('wrong aad');

			await expect(
				ee.decrypt({
					groupId: MOCK_GROUP_ID,
					encryptionHistoryId: MOCK_ENCRYPTION_HISTORY_ID,
					keyVersion: 0n,
					sessionKey,
					envelope,
				}),
			).rejects.toThrow();
		});
	});

	describe('cache management', () => {
		it('should use cached DEK for subsequent encryptions', async () => {
			const ee = createEnvelopeEncryption();
			const sessionKey = createTestSessionKey();
			const data1 = new TextEncoder().encode('message 1');
			const data2 = new TextEncoder().encode('message 2');

			await ee.generateDEK({ groupId: MOCK_GROUP_ID, keyVersion: 0n });

			const env1 = await ee.encrypt({
				groupId: MOCK_GROUP_ID,
				encryptionHistoryId: MOCK_ENCRYPTION_HISTORY_ID,
				keyVersion: 0n,
				sessionKey,
				data: data1,
			});

			const env2 = await ee.encrypt({
				groupId: MOCK_GROUP_ID,
				encryptionHistoryId: MOCK_ENCRYPTION_HISTORY_ID,
				keyVersion: 0n,
				sessionKey,
				data: data2,
			});

			// Both should decrypt correctly (same DEK)
			const dec1 = await ee.decrypt({
				groupId: MOCK_GROUP_ID,
				encryptionHistoryId: MOCK_ENCRYPTION_HISTORY_ID,
				keyVersion: 0n,
				sessionKey,
				envelope: env1,
			});
			const dec2 = await ee.decrypt({
				groupId: MOCK_GROUP_ID,
				encryptionHistoryId: MOCK_ENCRYPTION_HISTORY_ID,
				keyVersion: 0n,
				sessionKey,
				envelope: env2,
			});

			expect(new TextDecoder().decode(dec1)).toBe('message 1');
			expect(new TextDecoder().decode(dec2)).toBe('message 2');
		});

		it('should support different key versions for the same group', async () => {
			const ee = createEnvelopeEncryption();
			const sessionKey = createTestSessionKey();
			const data = new TextEncoder().encode('test data');

			// Generate DEKs for two key versions
			await ee.generateDEK({ groupId: MOCK_GROUP_ID, keyVersion: 0n });
			await ee.generateDEK({ groupId: MOCK_GROUP_ID, keyVersion: 1n });

			// Encrypt with version 0
			const env0 = await ee.encrypt({
				groupId: MOCK_GROUP_ID,
				encryptionHistoryId: MOCK_ENCRYPTION_HISTORY_ID,
				keyVersion: 0n,
				sessionKey,
				data,
			});

			// Encrypt with version 1
			const env1 = await ee.encrypt({
				groupId: MOCK_GROUP_ID,
				encryptionHistoryId: MOCK_ENCRYPTION_HISTORY_ID,
				keyVersion: 1n,
				sessionKey,
				data,
			});

			// Both should decrypt correctly with their respective versions
			const dec0 = await ee.decrypt({
				groupId: MOCK_GROUP_ID,
				encryptionHistoryId: MOCK_ENCRYPTION_HISTORY_ID,
				keyVersion: 0n,
				sessionKey,
				envelope: env0,
			});
			const dec1 = await ee.decrypt({
				groupId: MOCK_GROUP_ID,
				encryptionHistoryId: MOCK_ENCRYPTION_HISTORY_ID,
				keyVersion: 1n,
				sessionKey,
				envelope: env1,
			});

			expect(new TextDecoder().decode(dec0)).toBe('test data');
			expect(new TextDecoder().decode(dec1)).toBe('test data');

			// Ciphertexts should differ (different DEKs and nonces)
			expect(Array.from(env0.ciphertext)).not.toEqual(Array.from(env1.ciphertext));
		});
	});
});
