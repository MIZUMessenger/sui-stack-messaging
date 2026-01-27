// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Module: utils
 *
 * Utility functions for identity bytes parsing and validation. Identity bytes
 * format: [creator_address (32 bytes)][nonce (32 bytes)]
 */

import type { Transaction } from '@mysten/sui/transactions';
import { normalizeMoveArguments } from '../utils/index.js';
import type { RawTransactionArgument } from '../utils/index.js';
export interface IsPrefixArguments {
	prefix: RawTransactionArgument<number[]>;
	data: RawTransactionArgument<number[]>;
}
export interface IsPrefixOptions {
	package?: string;
	arguments:
		| IsPrefixArguments
		| [prefix: RawTransactionArgument<number[]>, data: RawTransactionArgument<number[]>];
}
/**
 * Checks if `prefix` is a prefix of `data`.
 *
 * # Parameters
 *
 * - `prefix`: The prefix to check
 * - `data`: The data to check against
 *
 * # Returns
 *
 * `true` if `prefix` is a prefix of `data`, `false` otherwise.
 */
export function isPrefix(options: IsPrefixOptions) {
	const packageAddress = options.package ?? '@local-pkg/messaging';
	const argumentsTypes = ['vector<u8>', 'vector<u8>'] satisfies string[];
	const parameterNames = ['prefix', 'data'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'utils',
			function: 'is_prefix',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface ParseIdentityBytesArguments {
	encryptedDek: RawTransactionArgument<number[]>;
}
export interface ParseIdentityBytesOptions {
	package?: string;
	arguments: ParseIdentityBytesArguments | [encryptedDek: RawTransactionArgument<number[]>];
}
/**
 * Parses the identity bytes from a Seal EncryptedObject.
 *
 * EncryptedObject BCS layout:
 *
 * - version: u8
 * - packageId: address (32 bytes)
 * - id: vector<u8> (ULEB128 length + bytes) <- this is identity_bytes
 * - ... (remaining fields ignored)
 *
 * # Parameters
 *
 * - `encrypted_dek`: The BCS-serialized Seal EncryptedObject bytes
 *
 * # Returns
 *
 * The identity bytes extracted from the EncryptedObject.
 *
 * # Aborts
 *
 * - `EInvalidIdentityBytesLength`: if identity bytes are not exactly 64 bytes
 */
export function parseIdentityBytes(options: ParseIdentityBytesOptions) {
	const packageAddress = options.package ?? '@local-pkg/messaging';
	const argumentsTypes = ['vector<u8>'] satisfies string[];
	const parameterNames = ['encryptedDek'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'utils',
			function: 'parse_identity_bytes',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface UnpackIdentityBytesArguments {
	identityBytes: RawTransactionArgument<number[]>;
}
export interface UnpackIdentityBytesOptions {
	package?: string;
	arguments: UnpackIdentityBytesArguments | [identityBytes: RawTransactionArgument<number[]>];
}
/**
 * Unpacks identity bytes into creator address and nonce.
 *
 * Uses Sui's BCS module for efficient sequential parsing without intermediate
 * vector allocations.
 *
 * # Parameters
 *
 * - `identity_bytes`: 64-byte vector in format [creator_address][nonce]
 *
 * # Returns
 *
 * Tuple of (creator_address, nonce_as_u256).
 *
 * # Aborts
 *
 * - `EInvalidIdentityBytesLength`: if identity_bytes is not exactly 64 bytes
 */
export function unpackIdentityBytes(options: UnpackIdentityBytesOptions) {
	const packageAddress = options.package ?? '@local-pkg/messaging';
	const argumentsTypes = ['vector<u8>'] satisfies string[];
	const parameterNames = ['identityBytes'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'utils',
			function: 'unpack_identity_bytes',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
