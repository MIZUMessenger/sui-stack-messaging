// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { BcsType } from '@mysten/sui/bcs';
import type { Transaction, TransactionResult } from '@mysten/sui/transactions';

import * as permissionedGroup from './contracts/permissioned_groups/permissioned_group.js';
import type {
	GrantPermissionCallOptions,
	NewDerivedGroupCallOptions,
	ObjectGrantPermissionCallOptions,
	ObjectRemoveMemberCallOptions,
	ObjectRevokePermissionCallOptions,
	PermissionedGroupsPackageConfig,
	RemoveMemberCallOptions,
	RevokePermissionCallOptions,
} from './types.js';

export interface PermissionedGroupsCallOptions {
	packageConfig: PermissionedGroupsPackageConfig;
	witnessType: string;
}

/**
 * Low-level transaction building methods for permissioned groups.
 *
 * Each method returns a thunk `(tx: Transaction) => TransactionResult`
 * that can be composed with other transaction operations.
 *
 * @example
 * ```ts
 * const tx = new Transaction();
 * const groupResult = tx.add(client.groups.call.createGroup());
 * tx.transferObjects([groupResult], tx.pure.address(myAddress));
 * ```
 */
export class PermissionedGroupsCall {
	#packageConfig: PermissionedGroupsPackageConfig;
	#witnessType: string;

	constructor(options: PermissionedGroupsCallOptions) {
		this.#packageConfig = options.packageConfig;
		this.#witnessType = options.witnessType;
	}

	// === Creation Functions ===

	/**
	 * Creates a new PermissionedGroup with the sender as initial admin.
	 * Grants Administrator and ExtensionPermissionsManager to creator.
	 *
	 * @returns Thunk that returns the created PermissionedGroup
	 */
	createGroup(): (tx: Transaction) => TransactionResult {
		return permissionedGroup._new({
			package: this.#packageConfig.packageId,
			typeArguments: [this.#witnessType],
		});
	}

	/**
	 * Creates a new derived PermissionedGroup with deterministic address.
	 * Grants Administrator and ExtensionPermissionsManager to creator.
	 *
	 * @example
	 * ```ts
	 * // Define your derivation key BCS type matching your Move struct
	 * // e.g., for `public struct GroupTag(u64) has copy, drop, store;`
	 * const GroupTag = bcs.tuple([bcs.u64()]);
	 *
	 * const tx = new Transaction();
	 * const group = tx.add(client.groups.call.deriveGroup({
	 *   derivationKeyType: '0xabc::my_app::GroupTag',
	 *   derivationUid: parentObjectId,
	 *   derivationKey: GroupTag.serialize([groupIndex]).toBytes(),
	 * }));
	 * ```
	 *
	 * @returns Thunk that returns the created PermissionedGroup
	 */
	deriveGroup<DerivationKey extends BcsType<unknown>>(
		options: NewDerivedGroupCallOptions<DerivationKey>,
	): (tx: Transaction) => TransactionResult {
		return permissionedGroup.newDerived({
			package: this.#packageConfig.packageId,
			arguments: {
				derivationUid: options.derivationUid,
				derivationKey: options.derivationKey,
			},
			typeArguments: [this.#witnessType, options.derivationKeyType],
		});
	}

	// === Permission Management Functions ===

	/**
	 * Grants a permission to a member.
	 * If the member doesn't exist, they are automatically added to the group.
	 *
	 * Permission requirements:
	 * - To grant Administrator: caller must have Administrator
	 * - To grant any other permission: caller must have Administrator OR ExtensionPermissionsManager
	 */
	grantPermission(options: GrantPermissionCallOptions): (tx: Transaction) => TransactionResult {
		return permissionedGroup.grantPermission({
			package: this.#packageConfig.packageId,
			arguments: {
				self: options.groupId,
				member: options.member,
			},
			typeArguments: [this.#witnessType, options.permissionType],
		});
	}

	/**
	 * Grants a permission to the transaction sender via an actor object.
	 * Enables third-party contracts to grant permissions with custom logic.
	 *
	 * Permission requirements:
	 * - To grant Administrator: actor must have Administrator
	 * - To grant any other permission: actor must have Administrator OR ExtensionPermissionsManager
	 */
	objectGrantPermission(
		options: ObjectGrantPermissionCallOptions,
	): (tx: Transaction) => TransactionResult {
		return permissionedGroup.objectGrantPermission({
			package: this.#packageConfig.packageId,
			arguments: {
				self: options.groupId,
				actorObject: options.actorObjectUid,
			},
			typeArguments: [this.#witnessType, options.permissionType],
		});
	}

	/**
	 * Revokes a permission from a member.
	 * If this is the member's last permission, they are automatically removed.
	 *
	 * Permission requirements:
	 * - To revoke Administrator: caller must have Administrator
	 * - To revoke any other permission: caller must have Administrator OR ExtensionPermissionsManager
	 */
	revokePermission(options: RevokePermissionCallOptions): (tx: Transaction) => TransactionResult {
		return permissionedGroup.revokePermission({
			package: this.#packageConfig.packageId,
			arguments: {
				self: options.groupId,
				member: options.member,
			},
			typeArguments: [this.#witnessType, options.permissionType],
		});
	}

	/**
	 * Revokes a permission from the transaction sender via an actor object.
	 * If this is the sender's last permission, they are automatically removed.
	 */
	objectRevokePermission(
		options: ObjectRevokePermissionCallOptions,
	): (tx: Transaction) => TransactionResult {
		return permissionedGroup.objectRevokePermission({
			package: this.#packageConfig.packageId,
			arguments: {
				self: options.groupId,
				actorObject: options.actorObjectUid,
			},
			typeArguments: [this.#witnessType, options.permissionType],
		});
	}

	// === Member Management Functions ===

	/**
	 * Removes a member from the PermissionedGroup.
	 * Requires Administrator permission.
	 */
	removeMember(options: RemoveMemberCallOptions): (tx: Transaction) => TransactionResult {
		return permissionedGroup.removeMember({
			package: this.#packageConfig.packageId,
			arguments: {
				self: options.groupId,
				member: options.member,
			},
			typeArguments: [this.#witnessType],
		});
	}

	/**
	 * Removes the transaction sender from the group via an actor object.
	 * The actor object must have Administrator permission.
	 */
	objectRemoveMember(
		options: ObjectRemoveMemberCallOptions,
	): (tx: Transaction) => TransactionResult {
		return permissionedGroup.objectRemoveMember({
			package: this.#packageConfig.packageId,
			arguments: {
				self: options.groupId,
				actorObject: options.actorObjectUid,
			},
			typeArguments: [this.#witnessType],
		});
	}
}
