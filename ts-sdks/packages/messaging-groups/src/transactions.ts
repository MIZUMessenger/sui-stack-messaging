// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Transaction } from '@mysten/sui/transactions';

import type { MessagingGroupsCall } from './call.js';
import type {
	CreateGroupCallOptions,
	GrantAllMessagingPermissionsCallOptions,
	GrantAllPermissionsCallOptions,
	RotateEncryptionKeyCallOptions,
} from './types.js';

export interface MessagingGroupsTransactionsOptions {
	call: MessagingGroupsCall;
}

/**
 * Transaction factory methods for messaging groups.
 *
 * Each method returns a complete Transaction object ready for signing.
 * Async thunks (from group creation, key rotation) are
 * resolved at transaction `build()` time.
 *
 * @example
 * ```ts
 * // For use with dapp-kit's signAndExecuteTransaction
 * const tx = client.messaging.tx.createAndShareGroup({
 *   initialMembers: ['0x...'],
 * });
 * signAndExecuteTransaction({ transaction: tx });
 * ```
 */
export class MessagingGroupsTransactions {
	#call: MessagingGroupsCall;

	constructor(options: MessagingGroupsTransactionsOptions) {
		this.#call = options.call;
	}

	// === Group Creation Functions ===

	/**
	 * Creates a Transaction that creates a new messaging group.
	 * Returns a tuple of (PermissionedGroup<Messaging>, EncryptionHistory).
	 */
	createGroup(options?: CreateGroupCallOptions): Transaction {
		const tx = new Transaction();
		tx.add(this.#call.createGroup(options));
		return tx;
	}

	/**
	 * Creates a Transaction that creates a new messaging group and shares both objects.
	 */
	createAndShareGroup(options?: CreateGroupCallOptions): Transaction {
		const tx = new Transaction();
		tx.add(this.#call.createAndShareGroup(options));
		return tx;
	}

	// === Encryption Functions ===

	/**
	 * Creates a Transaction that rotates the encryption key for a group.
	 */
	rotateEncryptionKey(options: RotateEncryptionKeyCallOptions): Transaction {
		const tx = new Transaction();
		tx.add(this.#call.rotateEncryptionKey(options));
		return tx;
	}

	// === Permission Functions ===

	/**
	 * Creates a Transaction that grants all messaging permissions to a member.
	 */
	grantAllMessagingPermissions(options: GrantAllMessagingPermissionsCallOptions): Transaction {
		const tx = new Transaction();
		tx.add(this.#call.grantAllMessagingPermissions(options));
		return tx;
	}

	/**
	 * Creates a Transaction that grants all permissions (admin + messaging) to a member.
	 */
	grantAllPermissions(options: GrantAllPermissionsCallOptions): Transaction {
		const tx = new Transaction();
		tx.add(this.#call.grantAllPermissions(options));
		return tx;
	}
}
