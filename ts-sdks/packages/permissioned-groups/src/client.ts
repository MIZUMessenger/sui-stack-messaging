// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { ClientWithCoreApi } from '@mysten/sui/experimental';
import { isValidNamedPackage, isValidSuiAddress } from '@mysten/sui/utils';
import { PermissionedGroupsClientError } from './error.js';
import {
	TESTNET_PERMISSIONED_GROUPS_PACKAGE_CONFIG,
	MAINNET_PERMISSIONED_GROUPS_PACKAGE_CONFIG,
} from './constants.js';
import type {
	PermissionedGroupsClientOptions,
	PermissionedGroupsCompatibleClient,
	PermissionedGroupsPackageConfig,
} from './types.js';
import { PermissionedGroupsCall } from './call.js';
import { PermissionedGroupsTransactions } from './transactions.js';
import { PermissionedGroupsBCS } from './bcs.js';

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
		this.bcs = new PermissionedGroupsBCS({ packageConfig: this.#packageConfig });
		this.tx = new PermissionedGroupsTransactions({
			witnessType: this.#witnessType,
			call: this.call,
			bcs: this.bcs,
		});
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
}
