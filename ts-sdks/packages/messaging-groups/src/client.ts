// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Signer } from '@mysten/sui/cryptography';
import type { ClientWithCoreApi } from '@mysten/sui/experimental';
import type { Transaction } from '@mysten/sui/transactions';

import { MessagingGroupsClientError } from './error.js';
import {
	TESTNET_MESSAGING_GROUPS_PACKAGE_CONFIG,
	MAINNET_MESSAGING_GROUPS_PACKAGE_CONFIG,
} from './constants.js';
import type {
	CreateGroupOptions,
	GrantAllMessagingPermissionsOptions,
	GrantAllPermissionsOptions,
	MessagingGroupsClientOptions,
	MessagingGroupsCompatibleClient,
	MessagingGroupsPackageConfig,
	RotateEncryptionKeyOptions,
} from './types.js';
import { MessagingGroupsCall } from './call.js';
import { MessagingGroupsTransactions } from './transactions.js';
import { MessagingGroupsBCS } from './bcs.js';
import { MessagingGroupsDerive } from './derive.js';
import { MessagingGroupsView } from './view.js';

/**
 * Factory function to create a messaging groups client extension.
 *
 * @example
 * ```ts
 * const client = new SuiClient({ url: 'https://...' })
 *   .$extend(permissionedGroups({ witnessType: `${pkg}::messaging::Messaging`, packageConfig }))
 *   .$extend(messagingGroups({ packageConfig }));
 *
 * // Access the messaging client
 * client.messaging.createAndShareGroup({ ... });
 * ```
 */
export function messagingGroups<const Name = 'messaging'>({
	name = 'messaging' as Name,
	packageConfig,
}: {
	name?: Name;
	packageConfig?: MessagingGroupsPackageConfig;
} = {}) {
	return {
		name,
		register: (client: ClientWithCoreApi) => {
			// Validate that permissioned-groups extension is present
			const clientWithGroups = client as MessagingGroupsCompatibleClient;
			if (!clientWithGroups.groups) {
				throw new MessagingGroupsClientError(
					'MessagingGroupsClient requires PermissionedGroupsClient extension. ' +
						'Use client.$extend(permissionedGroups({ witnessType, packageConfig })) first.',
				);
			}
			return new MessagingGroupsClient({ client: clientWithGroups, packageConfig });
		},
	};
}

/**
 * Client for interacting with messaging groups.
 *
 * Provides transaction building (`call`, `tx`), view functions (`view`),
 * BCS parsing (`bcs`), and top-level imperative methods for common operations.
 *
 * Requires a SuiClient that has been extended with PermissionedGroupsClient.
 * Fine-grained permission management (grantPermission, revokePermission, etc.)
 * should be done via the underlying `client.groups` extension.
 *
 * @example
 * ```ts
 * // Create and share a group
 * const { digest } = await client.messaging.createAndShareGroup({
 *   signer,
 *   initialEncryptedDek: encryptedDekBytes,
 *   initialMembers: ['0x...', '0x...'],
 * });
 *
 * // Rotate encryption key
 * await client.messaging.rotateEncryptionKey({
 *   signer,
 *   encryptionHistoryId: '0x...',
 *   groupId: '0x...',
 *   newEncryptedDek: newDekBytes,
 * });
 *
 * // For fine-grained permissions, use the groups extension:
 * await client.groups.grantPermission({
 *   signer,
 *   groupId: '0x...',
 *   member: '0x...',
 *   permissionType: `${messagingPkg}::messaging::MessagingSender`,
 * });
 * ```
 */
export class MessagingGroupsClient {
	#packageConfig: MessagingGroupsPackageConfig;
	#client: MessagingGroupsCompatibleClient;

	call: MessagingGroupsCall;
	tx: MessagingGroupsTransactions;
	view: MessagingGroupsView;
	bcs: MessagingGroupsBCS;
	derive: MessagingGroupsDerive;

	constructor(options: MessagingGroupsClientOptions) {
		if (!options.client) {
			throw new MessagingGroupsClientError('client must be provided');
		}
		this.#client = options.client;

		// Use custom packageConfig if provided, otherwise determine from network
		if (options.packageConfig) {
			this.#packageConfig = options.packageConfig;
		} else {
			const network = options.client.network;
			switch (network) {
				case 'testnet':
					this.#packageConfig = TESTNET_MESSAGING_GROUPS_PACKAGE_CONFIG;
					break;
				case 'mainnet':
					this.#packageConfig = MAINNET_MESSAGING_GROUPS_PACKAGE_CONFIG;
					break;
				default:
					throw new MessagingGroupsClientError(
						`Unsupported network: ${network}. Provide a custom packageConfig for localnet/devnet.`,
					);
			}
		}

		this.call = new MessagingGroupsCall({
			packageConfig: this.#packageConfig,
		});
		this.bcs = new MessagingGroupsBCS({ packageConfig: this.#packageConfig });
		this.tx = new MessagingGroupsTransactions({
			call: this.call,
		});
		this.derive = new MessagingGroupsDerive({ packageConfig: this.#packageConfig });
		this.view = new MessagingGroupsView({
			packageConfig: this.#packageConfig,
			client: this.#client,
			derive: this.derive,
			bcs: this.bcs,
		});
	}

	// === Private Helpers ===

	/**
	 * Executes a transaction with the given signer and waits for confirmation.
	 * @throws {MessagingGroupsClientError} if the transaction fails
	 */
	async #executeTransaction(transaction: Transaction, signer: Signer, action: string) {
		transaction.setSenderIfNotSet(signer.toSuiAddress());

		const { digest, effects } = await signer.signAndExecuteTransaction({
			transaction,
			client: this.#client,
		});

		if (effects?.status.error) {
			throw new MessagingGroupsClientError(
				`Failed to ${action} (${digest}): ${effects?.status.error}`,
			);
		}

		await this.#client.core.waitForTransaction({ digest });

		return { digest, effects };
	}

	// === Top-Level Imperative Methods ===

	/**
	 * Creates a new messaging group.
	 * Returns a tuple of (PermissionedGroup<Messaging>, EncryptionHistory).
	 * The objects are NOT shared - use createAndShareGroup for shared groups.
	 */
	async createGroup(options: CreateGroupOptions) {
		const { signer, ...callOptions } = options;
		const transaction = this.tx.createGroup(callOptions);
		return this.#executeTransaction(transaction, signer, 'create group');
	}

	/**
	 * Creates a new messaging group and shares both objects.
	 * The transaction sender automatically becomes the creator with all permissions.
	 */
	async createAndShareGroup(options: CreateGroupOptions) {
		const { signer, ...callOptions } = options;
		const transaction = this.tx.createAndShareGroup(callOptions);
		return this.#executeTransaction(transaction, signer, 'create and share group');
	}

	/**
	 * Rotates the encryption key for a group.
	 * Requires EncryptionKeyRotator permission.
	 */
	async rotateEncryptionKey(options: RotateEncryptionKeyOptions) {
		const { signer, ...callOptions } = options;
		const transaction = this.tx.rotateEncryptionKey(callOptions);
		return this.#executeTransaction(transaction, signer, 'rotate encryption key');
	}

	/**
	 * Grants all messaging permissions to a member.
	 * Requires ExtensionPermissionsManager permission.
	 */
	async grantAllMessagingPermissions(options: GrantAllMessagingPermissionsOptions) {
		const { signer, ...callOptions } = options;
		const transaction = this.tx.grantAllMessagingPermissions(callOptions);
		return this.#executeTransaction(transaction, signer, 'grant all messaging permissions');
	}

	/**
	 * Grants all permissions (Administrator, ExtensionPermissionsManager + messaging) to a member.
	 * Makes them a full admin.
	 * Requires Administrator permission.
	 */
	async grantAllPermissions(options: GrantAllPermissionsOptions) {
		const { signer, ...callOptions } = options;
		const transaction = this.tx.grantAllPermissions(callOptions);
		return this.#executeTransaction(transaction, signer, 'grant all permissions');
	}
}
