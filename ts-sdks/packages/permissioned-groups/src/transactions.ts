// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Transaction } from '@mysten/sui/transactions';

import type { PermissionedGroupsCall } from './call.js';
import type {
	GrantAllPermissionsCallOptions,
	GrantPermissionCallOptions,
	GrantPermissionsCallOptions,
	ObjectGrantPermissionCallOptions,
	ObjectRemoveMemberCallOptions,
	ObjectRevokePermissionCallOptions,
	RemoveMemberCallOptions,
	RevokePermissionCallOptions,
	RevokePermissionsCallOptions,
} from './types.js';

export interface PermissionedGroupsTransactionsOptions {
	call: PermissionedGroupsCall;
}

/**
 * Transaction factory methods for permissioned groups.
 *
 * Each method returns a complete Transaction object ready for signing.
 * Useful for dapp-kit integration where you need Transaction objects.
 *
 * @example
 * ```ts
 * // For use with dapp-kit's signAndExecuteTransaction
 * const tx = client.groups.tx.grantPermission({
 *   groupId: '0x...',
 *   member: '0x...',
 *   permissionType: '0xabc::my_app::Editor',
 * });
 * signAndExecuteTransaction({ transaction: tx });
 * ```
 */
export class PermissionedGroupsTransactions {
	#call: PermissionedGroupsCall;

	constructor(options: PermissionedGroupsTransactionsOptions) {
		this.#call = options.call;
	}

	// === Permission Management Functions ===

	/**
	 * Creates a Transaction that grants a permission to a member.
	 */
	grantPermission(options: GrantPermissionCallOptions): Transaction {
		const tx = new Transaction();
		tx.add(this.#call.grantPermission(options));
		return tx;
	}

	/**
	 * Creates a Transaction that grants a permission via an actor object.
	 */
	objectGrantPermission(options: ObjectGrantPermissionCallOptions): Transaction {
		const tx = new Transaction();
		tx.add(this.#call.objectGrantPermission(options));
		return tx;
	}

	/**
	 * Creates a Transaction that revokes a permission from a member.
	 */
	revokePermission(options: RevokePermissionCallOptions): Transaction {
		const tx = new Transaction();
		tx.add(this.#call.revokePermission(options));
		return tx;
	}

	/**
	 * Creates a Transaction that revokes a permission via an actor object.
	 */
	objectRevokePermission(options: ObjectRevokePermissionCallOptions): Transaction {
		const tx = new Transaction();
		tx.add(this.#call.objectRevokePermission(options));
		return tx;
	}

	// === Batch/Convenience Functions ===

	/**
	 * Creates a Transaction that grants multiple permissions to a member.
	 */
	grantPermissions(options: GrantPermissionsCallOptions): Transaction {
		const tx = new Transaction();
		tx.add(this.#call.grantPermissions(options));
		return tx;
	}

	/**
	 * Creates a Transaction that revokes multiple permissions from a member.
	 */
	revokePermissions(options: RevokePermissionsCallOptions): Transaction {
		const tx = new Transaction();
		tx.add(this.#call.revokePermissions(options));
		return tx;
	}

	/**
	 * Creates a Transaction that grants all 3 core permissions to a member.
	 */
	grantAllPermissions(options: GrantAllPermissionsCallOptions): Transaction {
		const tx = new Transaction();
		tx.add(this.#call.grantAllPermissions(options));
		return tx;
	}

	// === Member Management Functions ===

	/**
	 * Creates a Transaction that removes a member from the group.
	 */
	removeMember(options: RemoveMemberCallOptions): Transaction {
		const tx = new Transaction();
		tx.add(this.#call.removeMember(options));
		return tx;
	}

	/**
	 * Creates a Transaction that removes a member via an actor object.
	 */
	objectRemoveMember(options: ObjectRemoveMemberCallOptions): Transaction {
		const tx = new Transaction();
		tx.add(this.#call.objectRemoveMember(options));
		return tx;
	}
}
