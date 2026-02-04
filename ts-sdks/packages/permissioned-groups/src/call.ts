// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Transaction, TransactionResult } from '@mysten/sui/transactions';

import * as permissionedGroup from './contracts/permissioned_groups/permissioned_group.js';
import type {
	GrantPermissionCallOptions,
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
 * tx.add(client.groups.call.grantPermission({
 *   groupId: '0x...',
 *   member: '0x...',
 *   permissionType: '0xabc::my_app::Editor',
 * }));
 * ```
 */
export class PermissionedGroupsCall {
	#packageConfig: PermissionedGroupsPackageConfig;
	#witnessType: string;

	constructor(options: PermissionedGroupsCallOptions) {
		this.#packageConfig = options.packageConfig;
		this.#witnessType = options.witnessType;
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
	 * Grants a permission to a recipient via an actor object.
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
				recipient: options.recipient,
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
	 * Revokes a permission from a member via an actor object.
	 * If this is the member's last permission, they are automatically removed.
	 */
	objectRevokePermission(
		options: ObjectRevokePermissionCallOptions,
	): (tx: Transaction) => TransactionResult {
		return permissionedGroup.objectRevokePermission({
			package: this.#packageConfig.packageId,
			arguments: {
				self: options.groupId,
				actorObject: options.actorObjectUid,
				member: options.member,
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
	 * Removes a member from the group via an actor object.
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
				member: options.member,
			},
			typeArguments: [this.#witnessType],
		});
	}
}
