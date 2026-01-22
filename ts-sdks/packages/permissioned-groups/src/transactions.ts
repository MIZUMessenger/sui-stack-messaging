// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { BcsType } from '@mysten/sui/bcs';
import type { TransactionResult } from '@mysten/sui/transactions';
import { Transaction } from '@mysten/sui/transactions';

import type { PermissionedGroupsBCS } from './bcs.js';
import type { PermissionedGroupsCall } from './call.js';
import type {
	GrantPermissionCallOptions,
	NewDerivedGroupCallOptions,
	ObjectGrantPermissionCallOptions,
	ObjectRemoveMemberCallOptions,
	ObjectRevokePermissionCallOptions,
	RemoveMemberCallOptions,
	RevokePermissionCallOptions,
	TransferDerivedGroupCallOptions,
	TransferGroupCallOptions,
} from './types.js';

export interface PermissionedGroupsTransactionsOptions {
	witnessType: string;
	call: PermissionedGroupsCall;
	bcs: PermissionedGroupsBCS;
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
 * const tx = client.groups.tx.createAndShareGroup();
 * signAndExecuteTransaction({ transaction: tx });
 *
 * // Or transfer to a specific address
 * const tx2 = client.groups.tx.createAndTransferGroup({ recipient: myAddress });
 * signAndExecuteTransaction({ transaction: tx2 });
 *
 * // For custom object handling, use call methods
 * const tx3 = new Transaction();
 * const group = tx3.add(client.groups.call.createGroup());
 * // handle group as needed...
 * ```
 */
export class PermissionedGroupsTransactions {
	#witnessType: string;
	#call: PermissionedGroupsCall;
	#bcs: PermissionedGroupsBCS;

	constructor(options: PermissionedGroupsTransactionsOptions) {
		this.#witnessType = options.witnessType;
		this.#call = options.call;
		this.#bcs = options.bcs;
	}

	/**
	 * Shares a PermissionedGroup object publicly.
	 */
	#shareGroup(tx: Transaction, group: TransactionResult): void {
		const groupTypeName = `${this.#bcs.PermissionedGroup.name}<${this.#witnessType}>`;
		tx.moveCall({
			target: '0x2::transfer::public_share_object',
			typeArguments: [groupTypeName],
			arguments: [group],
		});
	}

	// === Creation Functions ===

	/**
	 * Creates a Transaction that creates a new PermissionedGroup.
	 * The group is returned as a TransactionResult for custom handling.
	 *
	 * @see createAndShareGroup - to share the group
	 * @see createAndTransferGroup - to transfer to an address
	 */
	createGroup(): Transaction {
		const tx = new Transaction();
		tx.add(this.#call.createGroup());
		return tx;
	}

	/**
	 * Creates a Transaction that creates and shares a new PermissionedGroup.
	 * Shared objects are accessible to all parties.
	 */
	createAndShareGroup(): Transaction {
		const tx = new Transaction();
		const group = tx.add(this.#call.createGroup());
		this.#shareGroup(tx, group);
		return tx;
	}

	/**
	 * Creates a Transaction that creates a new PermissionedGroup
	 * and transfers it to the specified recipient.
	 */
	createAndTransferGroup(options: TransferGroupCallOptions): Transaction {
		const tx = new Transaction();
		const group = tx.add(this.#call.createGroup());
		tx.transferObjects([group], options.recipient);
		return tx;
	}

	/**
	 * Creates a Transaction that creates a derived PermissionedGroup.
	 * The group is returned as a TransactionResult for custom handling.
	 *
	 * @see deriveAndShareGroup - to share the group
	 * @see deriveAndTransferGroup - to transfer to an address
	 */
	deriveGroup<DerivationKey extends BcsType<unknown>>(
		options: NewDerivedGroupCallOptions<DerivationKey>,
	): Transaction {
		const tx = new Transaction();
		tx.add(this.#call.deriveGroup(options));
		return tx;
	}

	/**
	 * Creates a Transaction that creates and shares a derived PermissionedGroup.
	 * Shared objects are accessible to all parties.
	 */
	deriveAndShareGroup<DerivationKey extends BcsType<unknown>>(
		options: NewDerivedGroupCallOptions<DerivationKey>,
	): Transaction {
		const tx = new Transaction();
		const group = tx.add(this.#call.deriveGroup(options));
		this.#shareGroup(tx, group);
		return tx;
	}

	/**
	 * Creates a Transaction that creates a derived PermissionedGroup
	 * and transfers it to the specified recipient.
	 */
	deriveAndTransferGroup<DerivationKey extends BcsType<unknown>>(
		options: TransferDerivedGroupCallOptions<DerivationKey>,
	): Transaction {
		const tx = new Transaction();
		const group = tx.add(this.#call.deriveGroup(options));
		tx.transferObjects([group], options.recipient);
		return tx;
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
