// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Transaction, TransactionResult } from '@mysten/sui/transactions';

import * as messaging from './contracts/messaging/messaging.js';
import type {
	CreateGroupCallOptions,
	GrantAllMessagingPermissionsCallOptions,
	GrantAllPermissionsCallOptions,
	MessagingGroupsPackageConfig,
	RotateEncryptionKeyCallOptions,
} from './types.js';

export interface MessagingGroupsCallOptions {
	packageConfig: MessagingGroupsPackageConfig;
}

/**
 * Low-level transaction building methods for messaging groups.
 *
 * Each method returns a thunk `(tx: Transaction) => TransactionResult`
 * that can be composed with other transaction operations.
 *
 * @example
 * ```ts
 * const tx = new Transaction();
 * tx.add(client.messaging.call.createAndShareGroup({
 *   initialEncryptedDek: encryptedDekBytes,
 *   initialMembers: ['0x...', '0x...'],
 * }));
 * ```
 */
export class MessagingGroupsCall {
	#packageConfig: MessagingGroupsPackageConfig;

	constructor(options: MessagingGroupsCallOptions) {
		this.#packageConfig = options.packageConfig;
	}

	// === Group Creation Functions ===

	/**
	 * Creates a new messaging group with encryption.
	 * The transaction sender automatically becomes the creator with all permissions.
	 *
	 * Returns a tuple of `(PermissionedGroup<Messaging>, EncryptionHistory)`.
	 *
	 * @param options.initialEncryptedDek - Seal-encrypted DEK bytes containing identity bytes
	 * @param options.initialMembers - Addresses to grant MessagingReader permission
	 */
	createGroup(options: CreateGroupCallOptions): (tx: Transaction) => TransactionResult {
		return messaging.createGroup({
			package: this.#packageConfig.packageId,
			arguments: {
				namespace: this.#packageConfig.namespaceId,
				initialEncryptedDek: Array.from(options.initialEncryptedDek),
				initialMembers: this.#buildVecSetArg(options.initialMembers ?? []),
			},
		});
	}

	/**
	 * Creates a new messaging group and shares both objects.
	 * The transaction sender automatically becomes the creator with all permissions.
	 *
	 * @param options.initialEncryptedDek - Seal-encrypted DEK bytes containing identity bytes
	 * @param options.initialMembers - Addresses to grant MessagingReader permission
	 */
	createAndShareGroup(options: CreateGroupCallOptions): (tx: Transaction) => TransactionResult {
		return messaging.createAndShareGroup({
			package: this.#packageConfig.packageId,
			arguments: {
				namespace: this.#packageConfig.namespaceId,
				initialEncryptedDek: Array.from(options.initialEncryptedDek),
				initialMembers: this.#buildVecSetArg(options.initialMembers ?? []),
			},
		});
	}

	// === Encryption Functions ===

	/**
	 * Rotates the encryption key for a group.
	 * Requires EncryptionKeyRotator permission.
	 *
	 * @param options.encryptionHistoryId - The EncryptionHistory object ID
	 * @param options.groupId - The PermissionedGroup<Messaging> object ID
	 * @param options.newEncryptedDek - New Seal-encrypted DEK bytes
	 */
	rotateEncryptionKey(
		options: RotateEncryptionKeyCallOptions,
	): (tx: Transaction) => TransactionResult {
		return messaging.rotateEncryptionKey({
			package: this.#packageConfig.packageId,
			arguments: {
				encryptionHistory: options.encryptionHistoryId,
				group: options.groupId,
				newEncryptedDek: Array.from(options.newEncryptedDek),
			},
		});
	}

	// === Permission Functions ===

	/**
	 * Grants all messaging permissions to a member.
	 * Includes: MessagingSender, MessagingReader, MessagingEditor, MessagingDeleter, EncryptionKeyRotator.
	 *
	 * Requires ExtensionPermissionsManager permission.
	 */
	grantAllMessagingPermissions(
		options: GrantAllMessagingPermissionsCallOptions,
	): (tx: Transaction) => TransactionResult {
		return messaging.grantAllMessagingPermissions({
			package: this.#packageConfig.packageId,
			arguments: {
				group: options.groupId,
				member: options.member,
			},
		});
	}

	/**
	 * Grants all permissions (Administrator, ExtensionPermissionsManager + messaging) to a member.
	 * Makes them a full admin.
	 *
	 * Requires Administrator permission.
	 */
	grantAllPermissions(
		options: GrantAllPermissionsCallOptions,
	): (tx: Transaction) => TransactionResult {
		return messaging.grantAllPermissions({
			package: this.#packageConfig.packageId,
			arguments: {
				group: options.groupId,
				member: options.member,
			},
		});
	}

	// === Private Helpers ===

	/**
	 * Builds a VecSet argument for initial members.
	 * The generated code expects a string representation that gets normalized.
	 */
	#buildVecSetArg(members: string[]): string {
		// The codegen normalizes this to VecSet<address>
		// For now, we pass the members array serialized
		// This may need adjustment based on how the codegen handles VecSet
		return JSON.stringify(members);
	}
}
