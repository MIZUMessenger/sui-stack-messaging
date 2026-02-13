// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Transaction } from '@mysten/sui/transactions';

import type { EnvelopeEncryption } from './encryption/envelope-encryption.js';
import * as messaging from './contracts/messaging/messaging.js';
import type {
	CreateGroupCallOptions,
	MessagingGroupsPackageConfig,
	RotateEncryptionKeyCallOptions,
	ShareGroupCallOptions,
} from './types.js';

export interface MessagingGroupsCallOptions {
	packageConfig: MessagingGroupsPackageConfig;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Call only uses context-independent methods (generateGroupDEK, generateRotationDEK)
	encryption: EnvelopeEncryption<any>;
	/** Full Move type name for PermissionedGroup<Messaging> (resolved from groups BCS). */
	permissionedGroupTypeName: string;
	/** Full Move type name for EncryptionHistory (resolved from messaging BCS). */
	encryptionHistoryTypeName: string;
}

/**
 * Transaction building methods for messaging groups.
 *
 * Methods that involve encryption (group creation, key rotation)
 * return async thunks that are resolved at transaction `build()` time.
 *
 * @example
 * ```ts
 * const tx = new Transaction();
 * tx.add(client.messaging.call.createAndShareGroup({
 *   initialMembers: ['0x...', '0x...'],
 * }));
 * ```
 */
export class MessagingGroupsCall {
	#packageConfig: MessagingGroupsPackageConfig;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Call only uses context-independent methods (generateGroupDEK, generateRotationDEK)
	#encryption: EnvelopeEncryption<any>;
	#permissionedGroupTypeName: string;
	#encryptionHistoryTypeName: string;

	constructor(options: MessagingGroupsCallOptions) {
		this.#packageConfig = options.packageConfig;
		this.#encryption = options.encryption;
		this.#permissionedGroupTypeName = options.permissionedGroupTypeName;
		this.#encryptionHistoryTypeName = options.encryptionHistoryTypeName;
	}

	// === Group Creation Functions ===

	/**
	 * Creates a new messaging group with encryption.
	 * The transaction sender automatically becomes the creator with all permissions.
	 *
	 * Internally generates a UUID (if not provided), derives the group ID,
	 * and generates a Seal-encrypted DEK for the group's initial encryption key.
	 *
	 * Returns a tuple of `(PermissionedGroup<Messaging>, EncryptionHistory)`.
	 */
	createGroup(options?: CreateGroupCallOptions) {
		return async (tx: Transaction) => {
			const { uuid, encryptedDek } = await this.#encryption.generateGroupDEK(options?.uuid);
			const initialMembers = this.#buildAddressVecSet(tx, options?.initialMembers ?? []);

			return tx.add(
				messaging.createGroup({
					package: this.#packageConfig.packageId,
					arguments: {
						namespace: this.#packageConfig.namespaceId,
						uuid,
						initialEncryptedDek: Array.from(encryptedDek),
						initialMembers,
					},
				}),
			);
		};
	}

	/**
	 * Creates a new messaging group and shares both objects.
	 * The transaction sender automatically becomes the creator with all permissions.
	 *
	 * Internally generates a UUID (if not provided), derives the group ID,
	 * and generates a Seal-encrypted DEK for the group's initial encryption key.
	 */
	createAndShareGroup(options?: CreateGroupCallOptions) {
		return async (tx: Transaction) => {
			const { uuid, encryptedDek } = await this.#encryption.generateGroupDEK(options?.uuid);

			return tx.add(
				messaging.createAndShareGroup({
					package: this.#packageConfig.packageId,
					arguments: {
						namespace: this.#packageConfig.namespaceId,
						uuid,
						initialEncryptedDek: Array.from(encryptedDek),
						initialMembers: options?.initialMembers ?? [],
					},
				}),
			);
		};
	}

	/**
	 * Shares a PermissionedGroup<Messaging> and its EncryptionHistory.
	 * Meant to be composed with `createGroup` in the same transaction.
	 *
	 * @example
	 * ```ts
	 * const tx = new Transaction();
	 * const [group, encryptionHistory] = tx.add(client.messaging.call.createGroup());
	 * tx.add(client.messaging.call.shareGroup({ group, encryptionHistory }));
	 * ```
	 */
	shareGroup(options: ShareGroupCallOptions) {
		return (tx: Transaction) => {
			tx.moveCall({
				package: '0x2',
				module: 'transfer',
				function: 'public_share_object',
				typeArguments: [this.#permissionedGroupTypeName],
				arguments: [options.group],
			});
			tx.moveCall({
				package: '0x2',
				module: 'transfer',
				function: 'public_share_object',
				typeArguments: [this.#encryptionHistoryTypeName],
				arguments: [options.encryptionHistory],
			});
		};
	}

	// === Encryption Functions ===

	/**
	 * Rotates the encryption key for a group.
	 * Requires EncryptionKeyRotator permission.
	 *
	 * Internally fetches the current key version, generates a new DEK
	 * for the next version, and Seal-encrypts it.
	 *
	 * Accepts either explicit `groupId` + `encryptionHistoryId`, or a `uuid`
	 * (which derives both IDs internally).
	 */
	rotateEncryptionKey(options: RotateEncryptionKeyCallOptions) {
		return async (tx: Transaction) => {
			const { encryptedDek, groupId, encryptionHistoryId } =
				await this.#encryption.generateRotationDEK(options);

			return tx.add(
				messaging.rotateEncryptionKey({
					package: this.#packageConfig.packageId,
					arguments: {
						encryptionHistory: encryptionHistoryId,
						group: groupId,
						newEncryptedDek: Array.from(encryptedDek),
					},
				}),
			);
		};
	}

	// === Private Helpers ===

	/**
	 * Build a VecSet<address> from an array of address strings.
	 * Used by createGroup which still takes VecSet<address>.
	 */
	#buildAddressVecSet(tx: Transaction, members: string[]) {
		if (members.length === 0) {
			return tx.moveCall({
				package: '0x2',
				module: 'vec_set',
				function: 'empty',
				arguments: [],
				typeArguments: ['address'],
			});
		}

		const addressVec = tx.makeMoveVec({
			type: 'address',
			elements: members.map((member) => tx.pure.address(member)),
		});

		return tx.moveCall({
			package: '0x2',
			module: 'vec_set',
			function: 'from_keys',
			arguments: [addressVec],
			typeArguments: ['address'],
		});
	}
}
