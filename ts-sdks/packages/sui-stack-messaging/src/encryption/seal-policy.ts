// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs } from '@mysten/sui/bcs';
import type { Transaction, TransactionResult } from '@mysten/sui/transactions';
import { isValidSuiAddress } from '@mysten/sui/utils';

import { sealApproveReader } from '../contracts/sui_stack_messaging/seal_policies.js';

/**
 * Defines how Seal decryption access control works for a messaging group.
 *
 * Bundles two concerns:
 * 1. Which package ID to use for Seal encryption namespace
 * 2. How to build a `seal_approve` transaction thunk for `seal.decrypt()`
 *
 * Identity bytes are always `[groupId (32 bytes)][keyVersion (8 bytes LE u64)]` —
 * this is enforced by the SDK and not customizable. Custom `seal_approve` functions
 * receive these standard identity bytes and validate them alongside their own checks.
 *
 * The default implementation ({@link DefaultSealPolicy}) targets
 * `messaging::seal_policies::seal_approve_reader`.
 *
 * The optional `TApproveContext` generic allows custom policies to require
 * additional runtime context (e.g., subscription ID, service ID) that is
 * passed through at encrypt/decrypt time. When `TApproveContext` is `void`
 * (the default), no extra parameter is required — keeping the API transparent.
 *
 * @example
 * ```ts
 * // Custom subscription-gated policy
 * interface SubContext { serviceId: string; subscriptionId: string }
 *
 * const policy: SealPolicy<SubContext> = {
 *   packageId: myPackageId,
 *   sealApproveThunk(identityBytes, groupId, encHistId, context) {
 *     return (tx) => tx.moveCall({
 *       target: `${myPackageId}::custom_seal_policy::seal_approve`,
 *       typeArguments: ['0x2::sui::SUI'],
 *       arguments: [
 *         tx.pure.vector('u8', Array.from(identityBytes)),
 *         tx.object(context.subscriptionId),
 *         tx.object(context.serviceId),
 *         tx.object(groupId),
 *         tx.object(encHistId),
 *         tx.object('0x6'),
 *       ],
 *     });
 *   },
 * };
 * ```
 */
export interface SealPolicy<TApproveContext = void> {
	/** Original (V1) package ID passed to `seal.encrypt()` as the encryption namespace. */
	readonly packageId: string;

	/**
	 * Build a `seal_approve` transaction thunk for Seal decryption.
	 * The returned thunk is later added to a transaction and built into
	 * the `txBytes` that Seal key servers dry-run for access control.
	 *
	 * This is called lazily at decrypt time — implement dynamic routing here
	 * for multiple access paths (e.g., check if user has subscription, else
	 * build payment tx).
	 *
	 * @param identityBytes - The identity bytes extracted from the EncryptedObject
	 * @param groupId - The PermissionedGroup object ID
	 * @param encryptionHistoryId - The EncryptionHistory object ID
	 * @param context - Additional runtime context (only when TApproveContext is not void)
	 * @returns Transaction thunk compatible with `tx.add()`
	 */
	sealApproveThunk(
		identityBytes: Uint8Array,
		groupId: string,
		encryptionHistoryId: string,
		...context: TApproveContext extends void ? [] : [context: TApproveContext]
	): (tx: Transaction) => TransactionResult;
}

// === Default Identity Encoding ===

/** Length of the default Seal identity bytes: 32 (groupId) + 8 (keyVersion LE u64). */
const DEFAULT_IDENTITY_BYTES_LENGTH = 40;

/** BCS layout for the default identity bytes: `[Address (32 bytes)][u64 LE (8 bytes)]`. */
const DefaultIdentityBcs = bcs.struct('DefaultSealIdentity', {
	groupId: bcs.Address,
	keyVersion: bcs.u64(),
});

/**
 * Default seal policy using the messaging package's `seal_approve_reader`.
 *
 * Identity format: `[groupId (32 bytes)][keyVersion (8 bytes LE u64)]`
 *
 * This is used automatically when no custom `sealPolicy` is provided
 * in {@link SuiStackMessagingEncryptionOptions}.
 */
export class DefaultSealPolicy implements SealPolicy<void> {
	readonly packageId: string;
	readonly #latestPackageId: string;
	readonly #versionId: string;

	constructor(originalPackageId: string, latestPackageId: string, versionId: string) {
		this.packageId = originalPackageId;
		this.#latestPackageId = latestPackageId;
		this.#versionId = versionId;
	}

	/**
	 * Encode groupId + keyVersion into the 40-byte identity format.
	 *
	 * Layout: `[group_id (32 bytes)][key_version (8 bytes LE u64)]`
	 *
	 * @param groupId - 0x-prefixed hex Sui address (validated)
	 * @param keyVersion - Encryption key version (0-indexed)
	 * @throws if `groupId` is not a valid Sui address
	 */
	static encodeIdentity(groupId: string, keyVersion: bigint): Uint8Array {
		if (!isValidSuiAddress(groupId)) {
			throw new Error(`Invalid groupId: expected a valid Sui address, got "${groupId}"`);
		}
		return DefaultIdentityBcs.serialize({ groupId, keyVersion }).toBytes();
	}

	/**
	 * Decode 40 identity bytes back into groupId and keyVersion.
	 *
	 * @throws if `bytes.length !== 40`
	 */
	static decodeIdentity(bytes: Uint8Array): { groupId: string; keyVersion: bigint } {
		if (bytes.length !== DEFAULT_IDENTITY_BYTES_LENGTH) {
			throw new Error(
				`Invalid identity bytes length: expected ${DEFAULT_IDENTITY_BYTES_LENGTH}, got ${bytes.length}`,
			);
		}
		const parsed = DefaultIdentityBcs.parse(bytes);
		return { groupId: parsed.groupId, keyVersion: BigInt(parsed.keyVersion) };
	}

	sealApproveThunk(
		identityBytes: Uint8Array,
		groupId: string,
		encryptionHistoryId: string,
	): (tx: Transaction) => TransactionResult {
		return sealApproveReader({
			package: this.#latestPackageId,
			arguments: {
				id: Array.from(identityBytes),
				version: this.#versionId,
				group: groupId,
				encryptionHistory: encryptionHistoryId,
			},
		});
	}
}
