// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SealClient } from '@mysten/seal';
import type { Signer } from '@mysten/sui/cryptography';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import type { Transaction } from '@mysten/sui/transactions';

import { MessagingGroupsClientError } from './error.js';
import {
	TESTNET_MESSAGING_GROUPS_PACKAGE_CONFIG,
	MAINNET_MESSAGING_GROUPS_PACKAGE_CONFIG,
} from './constants.js';
import { EnvelopeEncryption } from './encryption/envelope-encryption.js';
import type {
	CreateGroupOptions,
	GrantAllMessagingPermissionsOptions,
	GrantAllPermissionsOptions,
	MessagingGroupsClientOptions,
	MessagingGroupsCompatibleClient,
	MessagingGroupsEncryptionOptions,
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
 * // Use a single $extend call with all extensions
 * const client = new SuiClient({ url: 'https://...' }).$extend(
 *   permissionedGroups({ witnessType: `${pkg}::messaging::Messaging`, packageConfig }),
 *   messagingGroups({ packageConfig }),
 * );
 *
 * // Access the messaging client
 * client.messaging.createAndShareGroup({ signer });
 * ```
 */
export function messagingGroups<
	TApproveContext = void,
	const Name = 'messaging',
	const GroupsName extends string = 'groups',
	const SealName extends string = 'seal',
>({
	name = 'messaging' as Name,
	groupsName = 'groups' as GroupsName,
	sealName = 'seal' as SealName,
	packageConfig,
	encryption,
}: {
	name?: Name;
	/** Name under which the PermissionedGroupsClient extension is registered (default: 'groups'). */
	groupsName?: GroupsName;
	/** Name under which the SealClient extension is registered (default: 'seal'). */
	sealName?: SealName;
	packageConfig?: MessagingGroupsPackageConfig;
	encryption: MessagingGroupsEncryptionOptions<TApproveContext>;
}) {
	return {
		name,
		register: (client: MessagingGroupsCompatibleClient<GroupsName, SealName>) => {
			return new MessagingGroupsClient<TApproveContext>({
				client,
				groupsName,
				sealName,
				packageConfig,
				encryption,
			});
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
 * // Create and share a group (encryption handled internally)
 * const { digest } = await client.messaging.createAndShareGroup({
 *   signer,
 *   initialMembers: ['0x...', '0x...'],
 * });
 *
 * // Rotate encryption key (by UUID or explicit IDs)
 * await client.messaging.rotateEncryptionKey({
 *   signer,
 *   uuid: 'my-group-uuid',
 * });
 *
 * // For member removal and fine-grained permissions, use the groups extension:
 * await client.groups.grantPermission({
 *   signer,
 *   groupId: '0x...',
 *   member: '0x...',
 *   permissionType: `${messagingPkg}::messaging::MessagingSender`,
 * });
 * ```
 */
export class MessagingGroupsClient<TApproveContext = void> {
	#packageConfig: MessagingGroupsPackageConfig;
	#client: ClientWithCoreApi;

	call: MessagingGroupsCall;
	tx: MessagingGroupsTransactions;
	view: MessagingGroupsView;
	bcs: MessagingGroupsBCS;
	derive: MessagingGroupsDerive;
	encryption: EnvelopeEncryption<TApproveContext>;

	constructor(options: MessagingGroupsClientOptions<TApproveContext, string, string>) {
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

		// Resolve extension dependencies by their registered names
		const sealExt = options.client[options.sealName] as SealClient;

		// Build order matters: bcs → derive → view → encryption → call → tx
		this.bcs = new MessagingGroupsBCS({ packageConfig: this.#packageConfig });
		this.derive = new MessagingGroupsDerive({ packageConfig: this.#packageConfig });
		this.view = new MessagingGroupsView({
			packageConfig: this.#packageConfig,
			client: this.#client,
			derive: this.derive,
			bcs: this.bcs,
		});
		this.encryption = new EnvelopeEncryption({
			sealClient: sealExt,
			suiClient: this.#client,
			view: this.view,
			derive: this.derive,
			packageId: this.#packageConfig.packageId,
			encryption: options.encryption,
		});
		this.call = new MessagingGroupsCall({
			packageConfig: this.#packageConfig,
			encryption: this.encryption,
		});
		this.tx = new MessagingGroupsTransactions({
			call: this.call,
		});
	}

	// === Private Helpers ===

	/**
	 * Executes a transaction with the given signer and waits for confirmation.
	 * @throws {MessagingGroupsClientError} if the transaction fails
	 */
	async #executeTransaction(transaction: Transaction, signer: Signer, action: string) {
		transaction.setSenderIfNotSet(signer.toSuiAddress());

		const result = await signer.signAndExecuteTransaction({
			transaction,
			client: this.#client,
		});

		const tx = result.Transaction ?? result.FailedTransaction;
		if (!tx) {
			throw new MessagingGroupsClientError(`Failed to ${action}: no transaction result`);
		}

		if (!tx.status.success) {
			throw new MessagingGroupsClientError(
				`Failed to ${action} (${tx.digest}): ${tx.status.error}`,
			);
		}

		await this.#client.core.waitForTransaction({ result });

		return { digest: tx.digest, effects: tx.effects };
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
