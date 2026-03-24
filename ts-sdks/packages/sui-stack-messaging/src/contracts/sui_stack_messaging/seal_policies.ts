/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

/**
 * Module: seal_policies
 *
 * Default `seal_approve` functions for Seal encryption access control. Called by
 * Seal key servers (via dry-run) to authorize decryption.
 *
 * ## Identity Bytes Format
 *
 * Identity bytes: `[group_id (32 bytes)][key_version (8 bytes LE u64)]` Total: 40
 * bytes
 *
 * - `group_id`: The PermissionedGroup<Messaging> object ID
 * - `key_version`: The encryption key version (supports key rotation)
 *
 * ## Custom Policies
 *
 * Apps can implement custom `seal_approve` with different logic:
 *
 * - Subscription-based, time-limited, NFT-gated access, etc.
 * - Must be in the same package used during `seal.encrypt`.
 */

import { type Transaction } from '@mysten/sui/transactions';
import { normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
export interface ValidateIdentityArguments {
	group: RawTransactionArgument<string>;
	encryptionHistory: RawTransactionArgument<string>;
	id: RawTransactionArgument<number[]>;
}
export interface ValidateIdentityOptions {
	package?: string;
	arguments:
		| ValidateIdentityArguments
		| [
				group: RawTransactionArgument<string>,
				encryptionHistory: RawTransactionArgument<string>,
				id: RawTransactionArgument<number[]>,
		  ];
}
/**
 * Validates identity bytes format and extracts components.
 *
 * Expected format: `[group_id (32 bytes)][key_version (8 bytes LE u64)]`
 *
 * Custom `seal_approve` functions in external packages should call this to reuse
 * the standard identity validation logic instead of duplicating it.
 *
 * # Parameters
 *
 * - `group`: Reference to the PermissionedGroup<Messaging>
 * - `encryption_history`: Reference to the EncryptionHistory
 * - `id`: The Seal identity bytes to validate
 *
 * # Aborts
 *
 * - `EEncryptionHistoryMismatch`: if encryption_history doesn't belong to this
 *   group
 * - `EInvalidIdentity`: if length != 40 or group_id doesn't match
 * - `EInvalidKeyVersion`: if key_version > current_key_version
 */
export function validateIdentity(options: ValidateIdentityOptions) {
	const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
	const argumentsTypes = [null, null, 'vector<u8>'] satisfies (string | null)[];
	const parameterNames = ['group', 'encryptionHistory', 'id'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'seal_policies',
			function: 'validate_identity',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface SealApproveReaderArguments {
	id: RawTransactionArgument<number[]>;
	version: RawTransactionArgument<string>;
	group: RawTransactionArgument<string>;
	encryptionHistory: RawTransactionArgument<string>;
}
export interface SealApproveReaderOptions {
	package?: string;
	arguments:
		| SealApproveReaderArguments
		| [
				id: RawTransactionArgument<number[]>,
				version: RawTransactionArgument<string>,
				group: RawTransactionArgument<string>,
				encryptionHistory: RawTransactionArgument<string>,
		  ];
}
/**
 * Default seal_approve that checks `MessagingReader` permission.
 *
 * # Parameters
 *
 * - `id`: Seal identity bytes
 *   `[group_id (32 bytes)][key_version (8 bytes LE u64)]`
 * - `group`: Reference to the PermissionedGroup<Messaging>
 * - `encryption_history`: Reference to the EncryptionHistory
 * - `ctx`: Transaction context
 *
 * # Aborts
 *
 * - `EEncryptionHistoryMismatch`: if encryption_history doesn't belong to this
 *   group
 * - `EInvalidIdentity`: if identity bytes are malformed or group_id doesn't match
 * - `EInvalidKeyVersion`: if key_version doesn't exist
 * - `ENotPermitted`: if caller doesn't have `MessagingReader` permission
 */
export function sealApproveReader(options: SealApproveReaderOptions) {
	const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
	const argumentsTypes = ['vector<u8>', null, null, null] satisfies (string | null)[];
	const parameterNames = ['id', 'version', 'group', 'encryptionHistory'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'seal_policies',
			function: 'seal_approve_reader',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
