// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Module: permissioned_group
 *
 * Generic permission system for group management.
 *
 * ## Permissions
 *
 * - `Administrator`: Super-admin role that can grant/revoke all permissions and
 *   remove members
 * - `ExtensionPermissionsManager`: Can grant/revoke extension permissions
 *   (permissions defined in third-party packages)
 *
 * ## Key Concepts
 *
 * - **Membership is defined by permissions**: A member exists if and only if they
 *   have at least one permission
 * - **Granting implicitly adds**: `grant_permission()` will automatically add a
 *   member if they don't exist
 * - **Revoking may remove**: Revoking the last permission automatically removes
 *   the member from the group
 * - **Permission hierarchy**: Only `Administrator` can grant/revoke
 *   `Administrator`; all other permissions can be managed by either
 *   `Administrator` or `ExtensionPermissionsManager`
 *
 * ## Invariants
 *
 * - At least one `Administrator` must always exist
 * - Members always have at least one permission (empty permission sets are not
 *   allowed)
 */

import { MoveTuple, MoveStruct, normalizeMoveArguments } from '../utils/index.js';
import type { RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import type { BcsType } from '@mysten/sui/bcs';
import type { Transaction } from '@mysten/sui/transactions';
import * as object from './deps/sui/object.js';
import * as table from './deps/sui/table.js';
import * as type_name from './deps/std/type_name.js';
const $moduleName = '@local-pkg/permissioned-groups::permissioned_group';
export const Administrator = new MoveTuple({
	name: `${$moduleName}::Administrator`,
	fields: [bcs.bool()],
});
export const ExtensionPermissionsManager = new MoveTuple({
	name: `${$moduleName}::ExtensionPermissionsManager`,
	fields: [bcs.bool()],
});
export const PermissionedGroup = new MoveStruct({
	name: `${$moduleName}::PermissionedGroup`,
	fields: {
		id: object.UID,
		/**
		 * Maps member addresses (user or object) to their permission set. Object addresses
		 * enable `object_*` functions for third-party "actor" contracts.
		 */
		permissions: table.Table,
		/** Tracks `Administrator` count to enforce at-least-one invariant. */
		administrators_count: bcs.u64(),
		/** Original creator's address */
		creator: bcs.Address,
	},
});
export const GroupCreated = new MoveStruct({
	name: `${$moduleName}::GroupCreated`,
	fields: {
		/** ID of the created group. */
		group_id: bcs.Address,
		/** Address of the group creator. */
		creator: bcs.Address,
	},
});
export const GroupDerived = new MoveStruct({
	name: `${$moduleName}::GroupDerived`,
	fields: {
		/** ID of the created group. */
		group_id: bcs.Address,
		/** Address of the group creator. */
		creator: bcs.Address,
		/** ID of the parent object from which the group was derived. */
		parent_id: bcs.Address,
		/** Type name of the derivation key used. */
		derivation_key_type: type_name.TypeName,
	},
});
export const MemberAdded = new MoveStruct({
	name: `${$moduleName}::MemberAdded`,
	fields: {
		/** ID of the group. */
		group_id: bcs.Address,
		/** Address of the new member. */
		member: bcs.Address,
	},
});
export const MemberRemoved = new MoveStruct({
	name: `${$moduleName}::MemberRemoved`,
	fields: {
		/** ID of the group. */
		group_id: bcs.Address,
		/** Address of the removed member. */
		member: bcs.Address,
	},
});
export const PermissionsGranted = new MoveStruct({
	name: `${$moduleName}::PermissionsGranted`,
	fields: {
		/** ID of the group. */
		group_id: bcs.Address,
		/** Address of the member receiving the permissions. */
		member: bcs.Address,
		/** Type names of the granted permissions. */
		permissions: bcs.vector(type_name.TypeName),
	},
});
export const PermissionsRevoked = new MoveStruct({
	name: `${$moduleName}::PermissionsRevoked`,
	fields: {
		/** ID of the group. */
		group_id: bcs.Address,
		/** Address of the member losing the permissions. */
		member: bcs.Address,
		/** Type names of the revoked permissions. */
		permissions: bcs.vector(type_name.TypeName),
	},
});
export interface NewOptions {
	package?: string;
	arguments?: [];
	typeArguments: [string];
}
/**
 * Creates a new PermissionedGroup with the sender as initial admin. Grants
 * `Administrator` and `ExtensionPermissionsManager` to creator.
 *
 * # Type Parameters
 *
 * - `T`: Package witness type to scope permissions
 *
 * # Parameters
 *
 * - `ctx`: Transaction context
 *
 * # Returns
 *
 * A new `PermissionedGroup<T>` with sender having `Administrator` and
 * `ExtensionPermissionsManager`.
 */
export function _new(options: NewOptions) {
	const packageAddress = options.package ?? '@local-pkg/permissioned-groups';
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'permissioned_group',
			function: 'new',
			typeArguments: options.typeArguments,
		});
}
export interface NewDerivedArguments<DerivationKey extends BcsType<any>> {
	derivationUid: RawTransactionArgument<string>;
	derivationKey: RawTransactionArgument<DerivationKey>;
}
export interface NewDerivedOptions<DerivationKey extends BcsType<any>> {
	package?: string;
	arguments:
		| NewDerivedArguments<DerivationKey>
		| [
				derivationUid: RawTransactionArgument<string>,
				derivationKey: RawTransactionArgument<DerivationKey>,
		  ];
	typeArguments: [string, string];
}
/**
 * Creates a new derived PermissionedGroup with deterministic address. Grants
 * `Administrator` and `ExtensionPermissionsManager` to creator.
 *
 * # Type Parameters
 *
 * - `T`: Package witness type to scope permissions
 * - `DerivationKey`: Key type for address derivation
 *
 * # Parameters
 *
 * - `derivation_uid`: Mutable reference to the parent UID for derivation
 * - `derivation_key`: Key used for deterministic address derivation
 * - `ctx`: Transaction context
 *
 * # Returns
 *
 * A new `PermissionedGroup<T>` with derived address.
 *
 * # Aborts
 *
 * - `EPermissionedGroupAlreadyExists`: if derived address is already claimed
 */
export function newDerived<DerivationKey extends BcsType<any>>(
	options: NewDerivedOptions<DerivationKey>,
) {
	const packageAddress = options.package ?? '@local-pkg/permissioned-groups';
	const argumentsTypes = [
		'0x0000000000000000000000000000000000000000000000000000000000000002::object::UID',
		`${options.typeArguments[1]}`,
	] satisfies string[];
	const parameterNames = ['derivationUid', 'derivationKey'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'permissioned_group',
			function: 'new_derived',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
			typeArguments: options.typeArguments,
		});
}
export interface GrantPermissionArguments {
	self: RawTransactionArgument<string>;
	member: RawTransactionArgument<string>;
}
export interface GrantPermissionOptions {
	package?: string;
	arguments:
		| GrantPermissionArguments
		| [self: RawTransactionArgument<string>, member: RawTransactionArgument<string>];
	typeArguments: [string, string];
}
/**
 * Grants a permission to a member. If the member doesn't exist, they are
 * automatically added to the group. Emits both `MemberAdded` (if new) and
 * `PermissionsGranted` events.
 *
 * Permission requirements:
 *
 * - To grant `Administrator`: caller must have `Administrator`
 * - To grant any other permission: caller must have `Administrator` OR
 *   `ExtensionPermissionsManager`
 *
 * # Type Parameters
 *
 * - `T`: Package witness type
 * - `NewPermission`: Permission type to grant
 *
 * # Parameters
 *
 * - `self`: Mutable reference to the PermissionedGroup
 * - `member`: Address of the member to grant permission to
 * - `ctx`: Transaction context
 *
 * # Aborts
 *
 * - `ENotPermitted`: if caller doesn't have appropriate manager permission
 */
export function grantPermission(options: GrantPermissionOptions) {
	const packageAddress = options.package ?? '@local-pkg/permissioned-groups';
	const argumentsTypes = [
		`${packageAddress}::permissioned_group::PermissionedGroup<${options.typeArguments[0]}>`,
		'address',
	] satisfies string[];
	const parameterNames = ['self', 'member'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'permissioned_group',
			function: 'grant_permission',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
			typeArguments: options.typeArguments,
		});
}
export interface ObjectGrantPermissionArguments {
	self: RawTransactionArgument<string>;
	actorObject: RawTransactionArgument<string>;
}
export interface ObjectGrantPermissionOptions {
	package?: string;
	arguments:
		| ObjectGrantPermissionArguments
		| [self: RawTransactionArgument<string>, actorObject: RawTransactionArgument<string>];
	typeArguments: [string, string];
}
/**
 * Grants a permission to the transaction sender via an actor object. Enables
 * third-party contracts to grant permissions with custom logic. If the sender is
 * not already a member, they are automatically added.
 *
 * Permission requirements:
 *
 * - To grant `Administrator`: actor must have `Administrator`
 * - To grant any other permission: actor must have `Administrator` OR
 *   `ExtensionPermissionsManager`
 *
 * # Type Parameters
 *
 * - `T`: Package witness type
 * - `NewPermission`: Permission type to grant
 *
 * # Parameters
 *
 * - `self`: Mutable reference to the PermissionedGroup
 * - `actor_object`: UID of the actor object with appropriate manager permission
 * - `ctx`: Transaction context (sender will receive the permission)
 *
 * # Aborts
 *
 * - `ENotPermitted`: if actor_object doesn't have appropriate manager permission
 */
export function objectGrantPermission(options: ObjectGrantPermissionOptions) {
	const packageAddress = options.package ?? '@local-pkg/permissioned-groups';
	const argumentsTypes = [
		`${packageAddress}::permissioned_group::PermissionedGroup<${options.typeArguments[0]}>`,
		'0x0000000000000000000000000000000000000000000000000000000000000002::object::UID',
	] satisfies string[];
	const parameterNames = ['self', 'actorObject'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'permissioned_group',
			function: 'object_grant_permission',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
			typeArguments: options.typeArguments,
		});
}
export interface RemoveMemberArguments {
	self: RawTransactionArgument<string>;
	member: RawTransactionArgument<string>;
}
export interface RemoveMemberOptions {
	package?: string;
	arguments:
		| RemoveMemberArguments
		| [self: RawTransactionArgument<string>, member: RawTransactionArgument<string>];
	typeArguments: [string];
}
/**
 * Removes a member from the PermissionedGroup. Requires `Administrator` permission
 * as this is a powerful admin operation.
 *
 * # Parameters
 *
 * - `self`: Mutable reference to the PermissionedGroup
 * - `member`: Address of the member to remove
 * - `ctx`: Transaction context
 *
 * # Aborts
 *
 * - `ENotPermitted`: if caller doesn't have `Administrator` permission
 * - `EMemberNotFound`: if member doesn't exist
 * - `ELastAdministrator`: if removing would leave no Administrators
 */
export function removeMember(options: RemoveMemberOptions) {
	const packageAddress = options.package ?? '@local-pkg/permissioned-groups';
	const argumentsTypes = [
		`${packageAddress}::permissioned_group::PermissionedGroup<${options.typeArguments[0]}>`,
		'address',
	] satisfies string[];
	const parameterNames = ['self', 'member'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'permissioned_group',
			function: 'remove_member',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
			typeArguments: options.typeArguments,
		});
}
export interface ObjectRemoveMemberArguments {
	self: RawTransactionArgument<string>;
	actorObject: RawTransactionArgument<string>;
}
export interface ObjectRemoveMemberOptions {
	package?: string;
	arguments:
		| ObjectRemoveMemberArguments
		| [self: RawTransactionArgument<string>, actorObject: RawTransactionArgument<string>];
	typeArguments: [string];
}
/**
 * Removes the transaction sender from the group via an actor object. Enables
 * third-party contracts to implement custom leave logic. The actor object must
 * have `Administrator` permission on the group.
 *
 * # Parameters
 *
 * - `self`: Mutable reference to the PermissionedGroup
 * - `actor_object`: UID of the actor object with `Administrator` permission
 * - `ctx`: Transaction context (sender will be removed)
 *
 * # Aborts
 *
 * - `ENotPermitted`: if actor_object doesn't have `Administrator` permission
 * - `EMemberNotFound`: if sender is not a member
 * - `ELastAdministrator`: if removing would leave no Administrators
 */
export function objectRemoveMember(options: ObjectRemoveMemberOptions) {
	const packageAddress = options.package ?? '@local-pkg/permissioned-groups';
	const argumentsTypes = [
		`${packageAddress}::permissioned_group::PermissionedGroup<${options.typeArguments[0]}>`,
		'0x0000000000000000000000000000000000000000000000000000000000000002::object::UID',
	] satisfies string[];
	const parameterNames = ['self', 'actorObject'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'permissioned_group',
			function: 'object_remove_member',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
			typeArguments: options.typeArguments,
		});
}
export interface RevokePermissionArguments {
	self: RawTransactionArgument<string>;
	member: RawTransactionArgument<string>;
}
export interface RevokePermissionOptions {
	package?: string;
	arguments:
		| RevokePermissionArguments
		| [self: RawTransactionArgument<string>, member: RawTransactionArgument<string>];
	typeArguments: [string, string];
}
/**
 * Revokes a permission from a member. If this is the member's last permission,
 * they are automatically removed from the group. Emits `PermissionsRevoked` and
 * potentially `MemberRemoved` events.
 *
 * Permission requirements:
 *
 * - To revoke `Administrator`: caller must have `Administrator`
 * - To revoke any other permission: caller must have `Administrator` OR
 *   `ExtensionPermissionsManager`
 *
 * # Type Parameters
 *
 * - `T`: Package witness type
 * - `ExistingPermission`: Permission type to revoke
 *
 * # Parameters
 *
 * - `self`: Mutable reference to the PermissionedGroup
 * - `member`: Address of the member to revoke permission from
 * - `ctx`: Transaction context
 *
 * # Aborts
 *
 * - `ENotPermitted`: if caller doesn't have appropriate manager permission
 * - `EMemberNotFound`: if member doesn't exist
 * - `ELastAdministrator`: if revoking `Administrator` would leave no
 *   administrators
 */
export function revokePermission(options: RevokePermissionOptions) {
	const packageAddress = options.package ?? '@local-pkg/permissioned-groups';
	const argumentsTypes = [
		`${packageAddress}::permissioned_group::PermissionedGroup<${options.typeArguments[0]}>`,
		'address',
	] satisfies string[];
	const parameterNames = ['self', 'member'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'permissioned_group',
			function: 'revoke_permission',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
			typeArguments: options.typeArguments,
		});
}
export interface ObjectRevokePermissionArguments {
	self: RawTransactionArgument<string>;
	actorObject: RawTransactionArgument<string>;
}
export interface ObjectRevokePermissionOptions {
	package?: string;
	arguments:
		| ObjectRevokePermissionArguments
		| [self: RawTransactionArgument<string>, actorObject: RawTransactionArgument<string>];
	typeArguments: [string, string];
}
/**
 * Revokes a permission from the transaction sender via an actor object. Enables
 * third-party contracts to revoke permissions with custom logic. If this is the
 * sender's last permission, they are automatically removed from the group.
 *
 * Permission requirements:
 *
 * - To revoke `Administrator`: actor must have `Administrator`
 * - To revoke any other permission: actor must have `Administrator` OR
 *   `ExtensionPermissionsManager`
 *
 * # Type Parameters
 *
 * - `T`: Package witness type
 * - `ExistingPermission`: Permission type to revoke
 *
 * # Parameters
 *
 * - `self`: Mutable reference to the PermissionedGroup
 * - `actor_object`: UID of the actor object with appropriate manager permission
 * - `ctx`: Transaction context (sender will have the permission revoked)
 *
 * # Aborts
 *
 * - `ENotPermitted`: if actor_object doesn't have appropriate manager permission
 * - `EMemberNotFound`: if sender is not a member
 * - `ELastAdministrator`: if revoking `Administrator` would leave no
 *   administrators
 */
export function objectRevokePermission(options: ObjectRevokePermissionOptions) {
	const packageAddress = options.package ?? '@local-pkg/permissioned-groups';
	const argumentsTypes = [
		`${packageAddress}::permissioned_group::PermissionedGroup<${options.typeArguments[0]}>`,
		'0x0000000000000000000000000000000000000000000000000000000000000002::object::UID',
	] satisfies string[];
	const parameterNames = ['self', 'actorObject'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'permissioned_group',
			function: 'object_revoke_permission',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
			typeArguments: options.typeArguments,
		});
}
export interface HasPermissionArguments {
	self: RawTransactionArgument<string>;
	member: RawTransactionArgument<string>;
}
export interface HasPermissionOptions {
	package?: string;
	arguments:
		| HasPermissionArguments
		| [self: RawTransactionArgument<string>, member: RawTransactionArgument<string>];
	typeArguments: [string, string];
}
/**
 * Checks if the given address has the specified permission.
 *
 * # Type Parameters
 *
 * - `T`: Package witness type
 * - `Permission`: Permission type to check
 *
 * # Parameters
 *
 * - `self`: Reference to the PermissionedGroup
 * - `member`: Address to check
 *
 * # Returns
 *
 * `true` if the address has the permission, `false` otherwise.
 */
export function hasPermission(options: HasPermissionOptions) {
	const packageAddress = options.package ?? '@local-pkg/permissioned-groups';
	const argumentsTypes = [
		`${packageAddress}::permissioned_group::PermissionedGroup<${options.typeArguments[0]}>`,
		'address',
	] satisfies string[];
	const parameterNames = ['self', 'member'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'permissioned_group',
			function: 'has_permission',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
			typeArguments: options.typeArguments,
		});
}
export interface IsMemberArguments {
	self: RawTransactionArgument<string>;
	member: RawTransactionArgument<string>;
}
export interface IsMemberOptions {
	package?: string;
	arguments:
		| IsMemberArguments
		| [self: RawTransactionArgument<string>, member: RawTransactionArgument<string>];
	typeArguments: [string];
}
/**
 * Checks if the given address is a member of the group.
 *
 * # Parameters
 *
 * - `self`: Reference to the PermissionedGroup
 * - `member`: Address to check
 *
 * # Returns
 *
 * `true` if the address is a member, `false` otherwise.
 */
export function isMember(options: IsMemberOptions) {
	const packageAddress = options.package ?? '@local-pkg/permissioned-groups';
	const argumentsTypes = [
		`${packageAddress}::permissioned_group::PermissionedGroup<${options.typeArguments[0]}>`,
		'address',
	] satisfies string[];
	const parameterNames = ['self', 'member'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'permissioned_group',
			function: 'is_member',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
			typeArguments: options.typeArguments,
		});
}
export interface CreatorArguments {
	self: RawTransactionArgument<string>;
}
export interface CreatorOptions {
	package?: string;
	arguments: CreatorArguments | [self: RawTransactionArgument<string>];
	typeArguments: [string];
}
/**
 * Returns the creator's address of the PermissionedGroup.
 *
 * # Parameters
 *
 * - `self`: Reference to the PermissionedGroup
 *
 * # Returns
 *
 * The address of the creator.
 */
export function creator(options: CreatorOptions) {
	const packageAddress = options.package ?? '@local-pkg/permissioned-groups';
	const argumentsTypes = [
		`${packageAddress}::permissioned_group::PermissionedGroup<${options.typeArguments[0]}>`,
	] satisfies string[];
	const parameterNames = ['self'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'permissioned_group',
			function: 'creator',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
			typeArguments: options.typeArguments,
		});
}
export interface AdministratorsCountArguments {
	self: RawTransactionArgument<string>;
}
export interface AdministratorsCountOptions {
	package?: string;
	arguments: AdministratorsCountArguments | [self: RawTransactionArgument<string>];
	typeArguments: [string];
}
/**
 * Returns the number of `Administrator`s in the PermissionedGroup.
 *
 * # Parameters
 *
 * - `self`: Reference to the PermissionedGroup
 *
 * # Returns
 *
 * The count of `Administrator`s.
 */
export function administratorsCount(options: AdministratorsCountOptions) {
	const packageAddress = options.package ?? '@local-pkg/permissioned-groups';
	const argumentsTypes = [
		`${packageAddress}::permissioned_group::PermissionedGroup<${options.typeArguments[0]}>`,
	] satisfies string[];
	const parameterNames = ['self'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'permissioned_group',
			function: 'administrators_count',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
			typeArguments: options.typeArguments,
		});
}
