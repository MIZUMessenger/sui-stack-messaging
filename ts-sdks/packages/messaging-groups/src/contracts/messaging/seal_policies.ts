// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Module: seal_policies
 *
 * Default `seal_approve` functions for Seal encryption access control. Called by
 * Seal key servers (via dry-run) to authorize decryption.
 *
 * ## Identity Bytes Format
 *
 * Identity bytes: `[creator_address (32 bytes)][nonce (32 bytes)]` Each key
 * version has its own identity bytes stored in EncryptionHistory.
 *
 * ## Custom Policies
 *
 * Apps can implement custom `seal_approve` with different logic:
 *
 * - Subscription-based, time-limited, NFT-gated access, etc.
 * - Must be in the same package used during `seal.encrypt`.
 */

import type { Transaction } from '@mysten/sui/transactions';
import { normalizeMoveArguments } from '../utils/index.js';
import type { RawTransactionArgument } from '../utils/index.js';
export interface SealApproveReaderArguments {
	id: RawTransactionArgument<number[]>;
	encryptionHistory: RawTransactionArgument<string>;
	group: RawTransactionArgument<string>;
}
export interface SealApproveReaderOptions {
	package?: string;
	arguments:
		| SealApproveReaderArguments
		| [
				id: RawTransactionArgument<number[]>,
				encryptionHistory: RawTransactionArgument<string>,
				group: RawTransactionArgument<string>,
		  ];
}
/**
 * Seal approve for the current (latest) key version.
 *
 * Validates that the identity bytes match the stored identity bytes for the
 * current key version, then checks the caller has `MessagingReader` permission.
 *
 * # Parameters
 *
 * - `id`: Seal identity bytes `[creator_address (32 bytes)][nonce (32 bytes)]`
 * - `encryption_history`: Reference to the group's EncryptionHistory
 * - `group`: Reference to the PermissionedGroup<Messaging>
 * - `ctx`: Transaction context
 *
 * # Aborts
 *
 * - `EGroupMismatch`: if encryption_history doesn't belong to this group
 * - `EInvalidIdentityBytes`: if `id` doesn't match the current key version's
 *   identity bytes
 * - `ENotPermitted`: if caller doesn't have `MessagingReader` permission
 */
export function sealApproveReader(options: SealApproveReaderOptions) {
	const packageAddress = options.package ?? '@local-pkg/messaging';
	const argumentsTypes = [
		'vector<u8>',
		`${packageAddress}::encryption_history::EncryptionHistory`,
		`@local-pkg/permissioned-groups::permissioned_group::PermissionedGroup<${packageAddress}::messaging::Messaging>`,
	] satisfies string[];
	const parameterNames = ['id', 'encryptionHistory', 'group'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'seal_policies',
			function: 'seal_approve_reader',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface SealApproveReaderForVersionArguments {
	id: RawTransactionArgument<number[]>;
	keyVersion: RawTransactionArgument<number | bigint>;
	encryptionHistory: RawTransactionArgument<string>;
	group: RawTransactionArgument<string>;
}
export interface SealApproveReaderForVersionOptions {
	package?: string;
	arguments:
		| SealApproveReaderForVersionArguments
		| [
				id: RawTransactionArgument<number[]>,
				keyVersion: RawTransactionArgument<number | bigint>,
				encryptionHistory: RawTransactionArgument<string>,
				group: RawTransactionArgument<string>,
		  ];
}
/**
 * Seal approve for a specific key version.
 *
 * Use this to decrypt messages that were encrypted with an older key version after
 * key rotation.
 *
 * # Parameters
 *
 * - `id`: Seal identity bytes `[creator_address (32 bytes)][nonce (32 bytes)]`
 * - `key_version`: The encryption key version to validate against
 * - `encryption_history`: Reference to the group's EncryptionHistory
 * - `group`: Reference to the PermissionedGroup<Messaging>
 * - `ctx`: Transaction context
 *
 * # Aborts
 *
 * - `EGroupMismatch`: if encryption_history doesn't belong to this group
 * - `EInvalidIdentityBytes`: if `id` doesn't match the stored identity bytes for
 *   key_version
 * - `ENotPermitted`: if caller doesn't have `MessagingReader` permission
 */
export function sealApproveReaderForVersion(options: SealApproveReaderForVersionOptions) {
	const packageAddress = options.package ?? '@local-pkg/messaging';
	const argumentsTypes = [
		'vector<u8>',
		'u64',
		`${packageAddress}::encryption_history::EncryptionHistory`,
		`@local-pkg/permissioned-groups::permissioned_group::PermissionedGroup<${packageAddress}::messaging::Messaging>`,
	] satisfies string[];
	const parameterNames = ['id', 'keyVersion', 'encryptionHistory', 'group'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'seal_policies',
			function: 'seal_approve_reader_for_version',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
