/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

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
 * - `PermissionsAdmin`: Manages core permissions (from permissioned_groups
 *   package)
 * - `ExtensionPermissionsAdmin`: Manages extension permissions (from other
 *   packages)
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

import {
	MoveTuple,
	MoveStruct,
	normalizeMoveArguments,
	type RawTransactionArgument,
} from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
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
		id: bcs.Address,
	},
});
export interface CreateGroupArguments {
	version: RawTransactionArgument<string>;
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
				version: RawTransactionArgument<string>,
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
 * - `EInvalidVersion` (from `version`): if package version doesn't match
 * - If the UUID has already been used (duplicate derivation)
 */
export function createGroup(options: CreateGroupOptions) {
	const packageAddress = options.package ?? '@local-pkg/messaging';
	const argumentsTypes = [null, null, '0x1::string::String', 'vector<u8>', null] satisfies (
		| string
		| null
	)[];
	const parameterNames = ['version', 'namespace', 'uuid', 'initialEncryptedDek', 'initialMembers'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'messaging',
			function: 'create_group',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface CreateAndShareGroupArguments {
	version: RawTransactionArgument<string>;
	namespace: RawTransactionArgument<string>;
	uuid: RawTransactionArgument<string>;
	initialEncryptedDek: RawTransactionArgument<number[]>;
	initialMembers: RawTransactionArgument<string[]>;
}
export interface CreateAndShareGroupOptions {
	package?: string;
	arguments:
		| CreateAndShareGroupArguments
		| [
				version: RawTransactionArgument<string>,
				namespace: RawTransactionArgument<string>,
				uuid: RawTransactionArgument<string>,
				initialEncryptedDek: RawTransactionArgument<number[]>,
				initialMembers: RawTransactionArgument<string[]>,
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
		null,
		null,
		'0x1::string::String',
		'vector<u8>',
		'vector<address>',
	] satisfies (string | null)[];
	const parameterNames = ['version', 'namespace', 'uuid', 'initialEncryptedDek', 'initialMembers'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'messaging',
			function: 'create_and_share_group',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface RotateEncryptionKeyArguments {
	version: RawTransactionArgument<string>;
	encryptionHistory: RawTransactionArgument<string>;
	group: RawTransactionArgument<string>;
	newEncryptedDek: RawTransactionArgument<number[]>;
}
export interface RotateEncryptionKeyOptions {
	package?: string;
	arguments:
		| RotateEncryptionKeyArguments
		| [
				version: RawTransactionArgument<string>,
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
 * - `EInvalidVersion` (from `version`): if package version doesn't match
 * - `ENotPermitted`: if caller doesn't have `EncryptionKeyRotator` permission
 */
export function rotateEncryptionKey(options: RotateEncryptionKeyOptions) {
	const packageAddress = options.package ?? '@local-pkg/messaging';
	const argumentsTypes = [null, null, null, 'vector<u8>'] satisfies (string | null)[];
	const parameterNames = ['version', 'encryptionHistory', 'group', 'newEncryptedDek'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'messaging',
			function: 'rotate_encryption_key',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface LeaveArguments {
	groupLeaver: RawTransactionArgument<string>;
	group: RawTransactionArgument<string>;
}
export interface LeaveOptions {
	package?: string;
	arguments:
		| LeaveArguments
		| [groupLeaver: RawTransactionArgument<string>, group: RawTransactionArgument<string>];
}
/**
 * Removes the caller from a messaging group. The `GroupLeaver` actor holds
 * `PermissionsAdmin` on all groups and calls `object_remove_member` on behalf of
 * the caller.
 *
 * # Parameters
 *
 * - `group_leaver`: Reference to the shared `GroupLeaver` object
 * - `group`: Mutable reference to the `PermissionedGroup<Messaging>`
 * - `ctx`: Transaction context
 *
 * # Aborts
 *
 * - `EMemberNotFound` (from `permissioned_group`): if the caller is not a member
 * - `ELastPermissionsAdmin` (from `permissioned_group`): if the caller is the last
 *   `PermissionsAdmin` holder (including actor objects)
 *
 * NOTE: Because `GroupLeaver` itself holds `PermissionsAdmin` on every group, a
 * human admin can always leave — leaving `GroupLeaver` as the sole remaining
 * admin. A group in that state has no human admins. To promote a new human admin
 * from that state, a dedicated actor-object wrapper over `object_grant_permission`
 * would be needed.
 */
export function leave(options: LeaveOptions) {
	const packageAddress = options.package ?? '@local-pkg/messaging';
	const argumentsTypes = [null, null] satisfies (string | null)[];
	const parameterNames = ['groupLeaver', 'group'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'messaging',
			function: 'leave',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface SetSuinsReverseLookupArguments {
	suinsManager: RawTransactionArgument<string>;
	group: RawTransactionArgument<string>;
	suins: RawTransactionArgument<string>;
	domainName: RawTransactionArgument<string>;
}
export interface SetSuinsReverseLookupOptions {
	package?: string;
	arguments:
		| SetSuinsReverseLookupArguments
		| [
				suinsManager: RawTransactionArgument<string>,
				group: RawTransactionArgument<string>,
				suins: RawTransactionArgument<string>,
				domainName: RawTransactionArgument<string>,
		  ];
}
/**
 * Sets a SuiNS reverse lookup on a messaging group. The caller must have
 * `ExtensionPermissionsAdmin` permission on the group. The `SuinsManager` actor
 * internally holds `ObjectAdmin` to access the group UID.
 *
 * NOTE: Currently gates on `ExtensionPermissionsAdmin`. If finer-grained control
 * is needed, a dedicated `SuinsAdmin` permission type could be introduced so that
 * SuiNS management can be granted independently of extension permission
 * management.
 *
 * # Parameters
 *
 * - `suins_manager`: Reference to the shared `SuinsManager` actor
 * - `group`: Mutable reference to the `PermissionedGroup<Messaging>`
 * - `suins`: Mutable reference to the SuiNS shared object
 * - `domain_name`: The domain name to set as reverse lookup
 * - `ctx`: Transaction context
 *
 * # Aborts
 *
 * - `ENotPermitted`: if caller doesn't have `ExtensionPermissionsAdmin`
 */
export function setSuinsReverseLookup(options: SetSuinsReverseLookupOptions) {
	const packageAddress = options.package ?? '@local-pkg/messaging';
	const argumentsTypes = [null, null, null, '0x1::string::String'] satisfies (string | null)[];
	const parameterNames = ['suinsManager', 'group', 'suins', 'domainName'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'messaging',
			function: 'set_suins_reverse_lookup',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface UnsetSuinsReverseLookupArguments {
	suinsManager: RawTransactionArgument<string>;
	group: RawTransactionArgument<string>;
	suins: RawTransactionArgument<string>;
}
export interface UnsetSuinsReverseLookupOptions {
	package?: string;
	arguments:
		| UnsetSuinsReverseLookupArguments
		| [
				suinsManager: RawTransactionArgument<string>,
				group: RawTransactionArgument<string>,
				suins: RawTransactionArgument<string>,
		  ];
}
/**
 * Unsets a SuiNS reverse lookup on a messaging group. The caller must have
 * `ExtensionPermissionsAdmin` permission on the group. The `SuinsManager` actor
 * internally holds `ObjectAdmin` to access the group UID.
 *
 * NOTE: See `set_suins_reverse_lookup` for permission gating rationale.
 *
 * # Parameters
 *
 * - `suins_manager`: Reference to the shared `SuinsManager` actor
 * - `group`: Mutable reference to the `PermissionedGroup<Messaging>`
 * - `suins`: Mutable reference to the SuiNS shared object
 * - `ctx`: Transaction context
 *
 * # Aborts
 *
 * - `ENotPermitted`: if caller doesn't have `ExtensionPermissionsAdmin`
 */
export function unsetSuinsReverseLookup(options: UnsetSuinsReverseLookupOptions) {
	const packageAddress = options.package ?? '@local-pkg/messaging';
	const argumentsTypes = [null, null, null] satisfies (string | null)[];
	const parameterNames = ['suinsManager', 'group', 'suins'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'messaging',
			function: 'unset_suins_reverse_lookup',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
