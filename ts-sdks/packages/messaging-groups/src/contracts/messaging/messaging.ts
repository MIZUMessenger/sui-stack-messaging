// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Module: messaging
 *
 * Public-facing module for the messaging package. All external interactions should
 * go through this module.
 *
 * Wraps `permissions_group` to provide messaging-specific permission management
 * and `encryption_history` for key rotation.
 *
 * ## Permissions
 *
 * From groups (auto-granted to creator):
 *
 * - `Administrator`: Super-admin role that can grant/revoke all permissions
 * - `ExtensionPermissionsManager`: Can grant/revoke extension permissions
 *
 * Messaging-specific:
 *
 * - `MessagingSender`: Send messages
 * - `MessagingReader`: Read/decrypt messages
 * - `MessagingEditor`: Edit messages
 * - `MessagingDeleter`: Delete messages
 * - `EncryptionKeyRotator`: Rotate encryption keys
 *
 * ## Security
 *
 * - Membership is defined by having at least one permission
 * - Granting a permission implicitly adds the member if they don't exist
 * - Revoking the last permission automatically removes the member
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments } from '../utils/index.js';
import type { RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import type { Transaction } from '@mysten/sui/transactions';
import * as object from './deps/sui/object.js';
const $moduleName = '@local-pkg/messaging::messaging';
export const MESSAGING = new MoveTuple({ name: `${$moduleName}::MESSAGING`, fields: [bcs.bool()] });
export const Messaging = new MoveTuple({ name: `${$moduleName}::Messaging`, fields: [bcs.bool()] });
export const MessagingSender = new MoveTuple({
	name: `${$moduleName}::MessagingSender`,
	fields: [bcs.bool()],
});
export const MessagingReader = new MoveTuple({
	name: `${$moduleName}::MessagingReader`,
	fields: [bcs.bool()],
});
export const MessagingDeleter = new MoveTuple({
	name: `${$moduleName}::MessagingDeleter`,
	fields: [bcs.bool()],
});
export const MessagingEditor = new MoveTuple({
	name: `${$moduleName}::MessagingEditor`,
	fields: [bcs.bool()],
});
export const MessagingNamespace = new MoveStruct({
	name: `${$moduleName}::MessagingNamespace`,
	fields: {
		id: object.UID,
	},
});
export interface CreateGroupArguments {
	namespace: RawTransactionArgument<string>;
	uuid: RawTransactionArgument<string>;
	initialEncryptedDek: RawTransactionArgument<number[]>;
	initialMembers: RawTransactionArgument<string>;
}
export interface CreateGroupOptions {
	package?: string;
	arguments:
		| CreateGroupArguments
		| [
				namespace: RawTransactionArgument<string>,
				uuid: RawTransactionArgument<string>,
				initialEncryptedDek: RawTransactionArgument<number[]>,
				initialMembers: RawTransactionArgument<string>,
		  ];
}
/**
 * Creates a new messaging group with encryption. The transaction sender
 * (`ctx.sender()`) automatically becomes the creator with all permissions.
 *
 * # Parameters
 *
 * - `namespace`: Mutable reference to the MessagingNamespace
 * - `uuid`: Client-provided UUID for deterministic address derivation
 * - `initial_encrypted_dek`: Initial Seal-encrypted DEK bytes
 * - `initial_members`: Addresses to grant `MessagingReader` permission (should not
 *   include creator)
 * - `ctx`: Transaction context
 *
 * # Returns
 *
 * Tuple of `(PermissionedGroup<Messaging>, EncryptionHistory)`.
 *
 * # Note
 *
 * If `initial_members` contains the creator's address, it is silently skipped (no
 * abort). This handles the common case where the creator might be mistakenly
 * included in the initial members list.
 *
 * # Aborts
 *
 * - If the UUID has already been used (duplicate derivation)
 */
export function createGroup(options: CreateGroupOptions) {
	const packageAddress = options.package ?? '@local-pkg/messaging';
	const argumentsTypes = [
		`${packageAddress}::messaging::MessagingNamespace`,
		'0x0000000000000000000000000000000000000000000000000000000000000001::string::String',
		'vector<u8>',
		'0x0000000000000000000000000000000000000000000000000000000000000002::vec_set::VecSet<address>',
	] satisfies string[];
	const parameterNames = ['namespace', 'uuid', 'initialEncryptedDek', 'initialMembers'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'messaging',
			function: 'create_group',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface CreateAndShareGroupArguments {
	namespace: RawTransactionArgument<string>;
	uuid: RawTransactionArgument<string>;
	initialEncryptedDek: RawTransactionArgument<number[]>;
	initialMembers: RawTransactionArgument<string>;
}
export interface CreateAndShareGroupOptions {
	package?: string;
	arguments:
		| CreateAndShareGroupArguments
		| [
				namespace: RawTransactionArgument<string>,
				uuid: RawTransactionArgument<string>,
				initialEncryptedDek: RawTransactionArgument<number[]>,
				initialMembers: RawTransactionArgument<string>,
		  ];
}
/**
 * Creates a new messaging group and shares both objects.
 *
 * # Parameters
 *
 * - `namespace`: Mutable reference to the MessagingNamespace
 * - `uuid`: Client-provided UUID for deterministic address derivation
 * - `initial_encrypted_dek`: Initial Seal-encrypted DEK bytes
 * - `initial_members`: Set of addresses to grant `MessagingReader` permission
 * - `ctx`: Transaction context
 *
 * # Note
 *
 * See `create_group` for details on creator permissions and initial member
 * handling.
 */
export function createAndShareGroup(options: CreateAndShareGroupOptions) {
	const packageAddress = options.package ?? '@local-pkg/messaging';
	const argumentsTypes = [
		`${packageAddress}::messaging::MessagingNamespace`,
		'0x0000000000000000000000000000000000000000000000000000000000000001::string::String',
		'vector<u8>',
		'0x0000000000000000000000000000000000000000000000000000000000000002::vec_set::VecSet<address>',
	] satisfies string[];
	const parameterNames = ['namespace', 'uuid', 'initialEncryptedDek', 'initialMembers'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'messaging',
			function: 'create_and_share_group',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface RotateEncryptionKeyArguments {
	encryptionHistory: RawTransactionArgument<string>;
	group: RawTransactionArgument<string>;
	newEncryptedDek: RawTransactionArgument<number[]>;
}
export interface RotateEncryptionKeyOptions {
	package?: string;
	arguments:
		| RotateEncryptionKeyArguments
		| [
				encryptionHistory: RawTransactionArgument<string>,
				group: RawTransactionArgument<string>,
				newEncryptedDek: RawTransactionArgument<number[]>,
		  ];
}
/**
 * Rotates the encryption key for a group.
 *
 * # Parameters
 *
 * - `encryption_history`: Mutable reference to the group's EncryptionHistory
 * - `group`: Reference to the PermissionedGroup<Messaging>
 * - `new_encrypted_dek`: New Seal-encrypted DEK bytes
 * - `ctx`: Transaction context
 *
 * # Aborts
 *
 * - `ENotPermitted`: if caller doesn't have `EncryptionKeyRotator` permission
 */
export function rotateEncryptionKey(options: RotateEncryptionKeyOptions) {
	const packageAddress = options.package ?? '@local-pkg/messaging';
	const argumentsTypes = [
		`${packageAddress}::encryption_history::EncryptionHistory`,
		`@local-pkg/permissioned-groups::permissioned_group::PermissionedGroup<${packageAddress}::messaging::Messaging>`,
		'vector<u8>',
	] satisfies string[];
	const parameterNames = ['encryptionHistory', 'group', 'newEncryptedDek'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'messaging',
			function: 'rotate_encryption_key',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface GrantAllMessagingPermissionsArguments {
	group: RawTransactionArgument<string>;
	member: RawTransactionArgument<string>;
}
export interface GrantAllMessagingPermissionsOptions {
	package?: string;
	arguments:
		| GrantAllMessagingPermissionsArguments
		| [group: RawTransactionArgument<string>, member: RawTransactionArgument<string>];
}
/**
 * Grants all messaging permissions to a member. Includes: `MessagingSender`,
 * `MessagingReader`, `MessagingEditor`, `MessagingDeleter`,
 * `EncryptionKeyRotator`.
 *
 * # Parameters
 *
 * - `group`: Mutable reference to the PermissionedGroup<Messaging>
 * - `member`: Address to grant permissions to
 * - `ctx`: Transaction context
 *
 * # Aborts
 *
 * - `ENotPermitted` (from `permissions_group`): if caller doesn't have
 *   `CorePermissionsManager` or `ExtensionPermissionsManager` permission
 */
export function grantAllMessagingPermissions(options: GrantAllMessagingPermissionsOptions) {
	const packageAddress = options.package ?? '@local-pkg/messaging';
	const argumentsTypes = [
		`@local-pkg/permissioned-groups::permissioned_group::PermissionedGroup<${packageAddress}::messaging::Messaging>`,
		'address',
	] satisfies string[];
	const parameterNames = ['group', 'member'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'messaging',
			function: 'grant_all_messaging_permissions',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface GrantAllPermissionsArguments {
	group: RawTransactionArgument<string>;
	member: RawTransactionArgument<string>;
}
export interface GrantAllPermissionsOptions {
	package?: string;
	arguments:
		| GrantAllPermissionsArguments
		| [group: RawTransactionArgument<string>, member: RawTransactionArgument<string>];
}
/**
 * Grants all permissions (Administrator, ExtensionPermissionsManager + messaging)
 * to a member, making them an admin.
 *
 * # Parameters
 *
 * - `group`: Mutable reference to the PermissionedGroup<Messaging>
 * - `member`: Address to grant permissions to
 * - `ctx`: Transaction context
 *
 * # Aborts
 *
 * - `ENotPermitted` (from `permissions_group`): if caller doesn't have
 *   `Administrator` permission
 */
export function grantAllPermissions(options: GrantAllPermissionsOptions) {
	const packageAddress = options.package ?? '@local-pkg/messaging';
	const argumentsTypes = [
		`@local-pkg/permissioned-groups::permissioned_group::PermissionedGroup<${packageAddress}::messaging::Messaging>`,
		'address',
	] satisfies string[];
	const parameterNames = ['group', 'member'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'messaging',
			function: 'grant_all_permissions',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
