// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Signer } from '@mysten/sui/cryptography';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import type { Transaction } from '@mysten/sui/transactions';
import { isValidNamedPackage, isValidSuiAddress } from '@mysten/sui/utils';
import { PermissionedGroupsClientError } from './error.js';
import {
	TESTNET_PERMISSIONED_GROUPS_PACKAGE_CONFIG,
	MAINNET_PERMISSIONED_GROUPS_PACKAGE_CONFIG,
} from './constants.js';
import type {
	AddMembersOptions,
	GrantPermissionOptions,
	GrantPermissionsOptions,
	PauseOptions,
	PermissionedGroupsClientOptions,
	PermissionedGroupsCompatibleClient,
	PermissionedGroupsPackageConfig,
	RemoveMemberOptions,
	RevokePermissionOptions,
	RevokePermissionsOptions,
	UnpauseOptions,
} from './types.js';
import { PermissionedGroupsCall } from './call.js';
import { PermissionedGroupsTransactions } from './transactions.js';
import { PermissionedGroupsBCS } from './bcs.js';
import { PermissionedGroupsView } from './view.js';

export function permissionedGroups<const Name = 'groups'>({
	name = 'groups' as Name,
	witnessType,
	packageConfig,
}: {
	name?: Name;
	/** The witness type from the extending package (e.g., '0xabc::my_module::MY_WITNESS') */
	witnessType: string;
	packageConfig?: PermissionedGroupsPackageConfig;
}) {
	return {
		name,
		register: (client: ClientWithCoreApi) => {
			return new PermissionedGroupsClient({ client, witnessType, packageConfig });
		},
	};
}

export class PermissionedGroupsClient {
	#packageConfig: PermissionedGroupsPackageConfig;
	#client: PermissionedGroupsCompatibleClient;
	#witnessType: string;

	call: PermissionedGroupsCall;
	tx: PermissionedGroupsTransactions;
	view: PermissionedGroupsView;
	bcs: PermissionedGroupsBCS;

	constructor(options: PermissionedGroupsClientOptions) {
		if (!options.client) {
			throw new PermissionedGroupsClientError('client must be provided');
		}
		this.#client = options.client;

		if (!options.witnessType) {
			throw new PermissionedGroupsClientError('witnessType must be provided');
		}
		PermissionedGroupsClient.#validateWitnessType(options.witnessType);
		this.#witnessType = options.witnessType;

		// Use custom packageConfig if provided, otherwise determine from network
		if (options.packageConfig) {
			this.#packageConfig = options.packageConfig;
		} else {
			const network = options.client.network;
			switch (network) {
				case 'testnet':
					this.#packageConfig = TESTNET_PERMISSIONED_GROUPS_PACKAGE_CONFIG;
					break;
				case 'mainnet':
					this.#packageConfig = MAINNET_PERMISSIONED_GROUPS_PACKAGE_CONFIG;
					break;
				default:
					throw new PermissionedGroupsClientError(
						`Unsupported network: ${network}. Provide a custom packageConfig for localnet/devnet.`,
					);
			}
		}

		this.call = new PermissionedGroupsCall({
			packageConfig: this.#packageConfig,
			witnessType: this.#witnessType,
		});
		this.bcs = new PermissionedGroupsBCS({
			packageConfig: this.#packageConfig,
			witnessType: this.#witnessType,
		});
		this.tx = new PermissionedGroupsTransactions({
			call: this.call,
		});
		this.view = new PermissionedGroupsView({
			packageConfig: this.#packageConfig,
			witnessType: this.#witnessType,
			client: this.#client,
		});
	}

	// === Private Helpers ===

	/**
	 * Executes a transaction with the given signer and waits for confirmation.
	 * @throws {PermissionedGroupsClientError} if the transaction fails
	 */
	async #executeTransaction(transaction: Transaction, signer: Signer, action: string) {
		transaction.setSenderIfNotSet(signer.toSuiAddress());

		const result = await signer.signAndExecuteTransaction({
			transaction,
			client: this.#client,
		});

		const tx = result.Transaction ?? result.FailedTransaction;
		if (!tx) {
			throw new PermissionedGroupsClientError(`Failed to ${action}: no transaction result`);
		}

		if (!tx.status.success) {
			throw new PermissionedGroupsClientError(
				`Failed to ${action} (${tx.digest}): ${tx.status.error}`,
			);
		}

		await this.#client.core.waitForTransaction({ result });

		return { digest: tx.digest, effects: tx.effects };
	}

	/**
	 * Validates that a witnessType is a valid Move struct tag.
	 * @throws {PermissionedGroupsClientError} if the witnessType is invalid
	 */
	static #validateWitnessType(witnessType: string): void {
		// Must have at least 3 parts: address::module::name
		const parts = witnessType.split('::');
		if (parts.length < 3) {
			throw new PermissionedGroupsClientError(
				`Invalid witnessType: "${witnessType}". Must be a valid Move type (e.g., '0xabc::module::Type').`,
			);
		}
		const [address] = parts;
		if (!isValidSuiAddress(address) && !isValidNamedPackage(address)) {
			throw new PermissionedGroupsClientError(
				`Invalid witnessType address: "${address}". Must be a valid Sui address or MVR package name.`,
			);
		}
	}

	// === Top-Level Imperative Methods ===

	/**
	 * Grants a permission to a member.
	 * If the member doesn't exist, they are automatically added to the group.
	 */
	async grantPermission({
		signer,
		transaction,
		...callOptions
	}: GrantPermissionOptions & { transaction?: Transaction }) {
		return this.#executeTransaction(
			this.tx.grantPermission({ transaction, ...callOptions }),
			signer,
			'grant permission',
		);
	}

	/**
	 * Grants multiple permissions to a member in a single transaction.
	 */
	async grantPermissions({
		signer,
		transaction,
		...callOptions
	}: GrantPermissionsOptions & { transaction?: Transaction }) {
		return this.#executeTransaction(
			this.tx.grantPermissions({ transaction, ...callOptions }),
			signer,
			'grant permissions',
		);
	}

	/**
	 * Adds multiple members to a group, each with their own set of permissions.
	 * Members who already exist will simply receive the additional permissions.
	 */
	async addMembers({
		signer,
		transaction,
		...callOptions
	}: AddMembersOptions & { transaction?: Transaction }) {
		return this.#executeTransaction(
			this.tx.addMembers({ transaction, ...callOptions }),
			signer,
			'add members',
		);
	}

	/**
	 * Revokes a permission from a member.
	 * If this is the member's last permission, they are automatically removed.
	 */
	async revokePermission({
		signer,
		transaction,
		...callOptions
	}: RevokePermissionOptions & { transaction?: Transaction }) {
		return this.#executeTransaction(
			this.tx.revokePermission({ transaction, ...callOptions }),
			signer,
			'revoke permission',
		);
	}

	/**
	 * Revokes multiple permissions from a member in a single transaction.
	 */
	async revokePermissions({
		signer,
		transaction,
		...callOptions
	}: RevokePermissionsOptions & { transaction?: Transaction }) {
		return this.#executeTransaction(
			this.tx.revokePermissions({ transaction, ...callOptions }),
			signer,
			'revoke permissions',
		);
	}

	/**
	 * Removes a member from the PermissionedGroup.
	 * Requires PermissionsAdmin permission.
	 */
	async removeMember({
		signer,
		transaction,
		...callOptions
	}: RemoveMemberOptions & { transaction?: Transaction }) {
		return this.#executeTransaction(
			this.tx.removeMember({ transaction, ...callOptions }),
			signer,
			'remove member',
		);
	}

	/**
	 * Pauses the group and transfers the `UnpauseCap` to the given recipient
	 * (defaults to the transaction sender, or the signer's address).
	 */
	async pause({
		signer,
		transaction,
		...callOptions
	}: PauseOptions & { transaction?: Transaction }) {
		const recipient =
			callOptions.unpauseCapRecipient ?? transaction?.getData().sender ?? signer.toSuiAddress();
		return this.#executeTransaction(
			this.tx.pause({ transaction, ...callOptions, unpauseCapRecipient: recipient }),
			signer,
			'pause group',
		);
	}

	/**
	 * Unpauses the group. Consumes and destroys the `UnpauseCap`.
	 * The signer must own the `UnpauseCap` object.
	 */
	async unpause({
		signer,
		transaction,
		...callOptions
	}: UnpauseOptions & { transaction?: Transaction }) {
		return this.#executeTransaction(
			this.tx.unpause({ transaction, ...callOptions }),
			signer,
			'unpause group',
		);
	}
}
