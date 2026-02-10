// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Enhanced mock SealClient for integration tests.
 *
 * Extends the unit-test mock pattern (storing plaintext DEK inside the
 * EncryptedObject BCS ciphertext field) with **seal_approve dry-run validation**
 * on decrypt. This validates:
 *
 * - On-chain access control (`seal_approve_reader` checks MessagingReader permission)
 * - Identity bytes encoding correctness
 * - Key version existence in EncryptionHistory
 *
 * **Accepted tradeoff:** We trust `@mysten/seal` for BLS12381/Shamir/ElGamal
 * crypto correctness (covered by their own tests). Integration with real Seal
 * key servers is validated via testnet tests separately.
 */

import type { SealClient } from '@mysten/seal';
import { EncryptedObject } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';

import type { MockSealClientOptions } from './types.js';

/**
 * Creates an enhanced mock SealClient that:
 * - `encrypt()`: Stores plaintext DEK in a valid EncryptedObject BCS structure
 * - `decrypt()`: Dry-runs the seal_approve transaction on localnet to validate
 *   access control, then returns the plaintext DEK from BCS
 */
export function createMockSealClient(options: MockSealClientOptions): SealClient {
	return {
		encrypt: async ({ packageId, id, data, threshold }) => {
			const encryptedObject = EncryptedObject.serialize({
				version: 0,
				packageId,
				id,
				services: [],
				threshold: threshold ?? 2,
				encryptedShares: {
					BonehFranklinBLS12381: {
						nonce: new Uint8Array(96),
						encryptedShares: [],
						encryptedRandomness: new Uint8Array(32),
					},
				},
				ciphertext: {
					Aes256Gcm: {
						blob: Array.from(data),
						aad: null,
					},
				},
			}).toBytes();

			return {
				encryptedObject,
				key: new Uint8Array(32),
			};
		},

		decrypt: async ({ data, sessionKey, txBytes }) => {
			// 1. Parse the EncryptedObject to extract plaintext
			const parsed = EncryptedObject.parse(data);

			if (!('Aes256Gcm' in parsed.ciphertext)) {
				throw new Error('Mock SealClient only supports Aes256Gcm ciphertext');
			}

			// 2. Dry-run the seal_approve transaction to validate access control.
			//    txBytes are TransactionKind bytes (built with onlyTransactionKind: true).
			//    We reconstruct a full transaction for simulation.
			const tx = Transaction.fromKind(txBytes);
			const senderAddress = sessionKey.getAddress();
			tx.setSender(senderAddress);

			const result = await options.suiClient.core.simulateTransaction({
				transaction: tx,
			});

			// Check if simulation succeeded
			if (result.$kind === 'FailedTransaction') {
				const error = result.FailedTransaction?.status?.error;
				const message = error?.message ?? JSON.stringify(error) ?? 'unknown error';
				throw new Error(`seal_approve dry-run failed: ${message}`);
			}

			// 3. Access granted — return the plaintext DEK
			return new Uint8Array(parsed.ciphertext.Aes256Gcm!.blob);
		},
	} as SealClient;
}
