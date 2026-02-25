// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Transaction, TransactionResult } from '@mysten/sui/transactions';

import * as permissionedGroup from './contracts/permissioned_groups/permissioned_group.js';
import { permissionTypes } from './constants.js';
import type {
	GrantAllPermissionsCallOptions,
	GrantPermissionCallOptions,
	GrantPermissionsCallOptions,
	ObjectGrantPermissionCallOptions,
	ObjectRemoveMemberCallOptions,
	ObjectRevokePermissionCallOptions,
	PermissionedGroupsPackageConfig,
	RemoveMemberCallOptions,
	RevokePermissionCallOptions,
	RevokePermissionsCallOptions,
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
	 * - To grant PermissionsAdmin: caller must have PermissionsAdmin
	 * - To grant any other permission: caller must have PermissionsAdmin OR ExtensionPermissionsAdmin
	 */
	grantPermission(options: GrantPermissionCallOptions): (tx: Transaction) => TransactionResult {
		return permissionedGroup.grantPermission({
			package: this.#packageConfig.latestPackageId,
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
	 * - To grant PermissionsAdmin: actor must have PermissionsAdmin
	 * - To grant any other permission: actor must have PermissionsAdmin OR ExtensionPermissionsAdmin
	 */
	objectGrantPermission(
		options: ObjectGrantPermissionCallOptions,
	): (tx: Transaction) => TransactionResult {
		return permissionedGroup.objectGrantPermission({
			package: this.#packageConfig.latestPackageId,
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
	 * - To revoke PermissionsAdmin: caller must have PermissionsAdmin
	 * - To revoke any other permission: caller must have PermissionsAdmin OR ExtensionPermissionsAdmin
	 */
	revokePermission(options: RevokePermissionCallOptions): (tx: Transaction) => TransactionResult {
		return permissionedGroup.revokePermission({
			package: this.#packageConfig.latestPackageId,
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
			package: this.#packageConfig.latestPackageId,
			arguments: {
				self: options.groupId,
				actorObject: options.actorObjectUid,
				member: options.member,
			},
			typeArguments: [this.#witnessType, options.permissionType],
		});
	}

	// === Batch/Convenience Functions ===

	/**
	 * Grants multiple permissions to a member in a single transaction.
	 * If the member doesn't exist, they are automatically added on the first grant.
	 */
	grantPermissions(options: GrantPermissionsCallOptions): (tx: Transaction) => void {
		return (tx: Transaction) => {
			for (const permType of options.permissionTypes) {
				tx.add(
					this.grantPermission({
						groupId: options.groupId,
						member: options.member,
						permissionType: permType,
					}),
				);
			}
		};
	}

	/**
	 * Revokes multiple permissions from a member in a single transaction.
	 * If the last permission is revoked, the member is automatically removed.
	 */
	revokePermissions(options: RevokePermissionsCallOptions): (tx: Transaction) => void {
		return (tx: Transaction) => {
			for (const permType of options.permissionTypes) {
				tx.add(
					this.revokePermission({
						groupId: options.groupId,
						member: options.member,
						permissionType: permType,
					}),
				);
			}
		};
	}

	/**
	 * Grants all 3 core permissions to a member:
	 * PermissionsAdmin, ExtensionPermissionsAdmin, ObjectAdmin.
	 */
	grantAllPermissions(options: GrantAllPermissionsCallOptions): (tx: Transaction) => void {
		const types = permissionTypes(this.#packageConfig.originalPackageId);
		return this.grantPermissions({
			groupId: options.groupId,
			member: options.member,
			permissionTypes: Object.values(types),
		});
	}

	// === Member Management Functions ===

	/**
	 * Removes a member from the PermissionedGroup.
	 * Requires PermissionsAdmin permission.
	 */
	removeMember(options: RemoveMemberCallOptions): (tx: Transaction) => TransactionResult {
		return permissionedGroup.removeMember({
			package: this.#packageConfig.latestPackageId,
			arguments: {
				self: options.groupId,
				member: options.member,
			},
			typeArguments: [this.#witnessType],
		});
	}

	/**
	 * Removes a member from the group via an actor object.
	 * The actor object must have PermissionsAdmin permission.
	 */
	objectRemoveMember(
		options: ObjectRemoveMemberCallOptions,
	): (tx: Transaction) => TransactionResult {
		return permissionedGroup.objectRemoveMember({
			package: this.#packageConfig.latestPackageId,
			arguments: {
				self: options.groupId,
				actorObject: options.actorObjectUid,
				member: options.member,
			},
			typeArguments: [this.#witnessType],
		});
	}
}
