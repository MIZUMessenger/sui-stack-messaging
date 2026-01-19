// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { ClientWithCoreApi } from '@mysten/sui/experimental';
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
import { PermissionedGroupsCalls } from './calls.js';
import { PermissionedGroupsTransactions } from './transactions.js';
import { PermissionedGroupsBCS } from './bcs.js';

export function permissionedGroups<const Name = 'groups'>({
	name = 'groups' as Name,
	packageConfig,
}: { name?: Name; packageConfig?: PermissionedGroupsPackageConfig } = {}) {
	return {
		name,
		register: (client: ClientWithCoreApi) => {
			return new PermissionedGroupsClient({ client, packageConfig });
		},
	};
}

export class PermissionedGroupsClient {
	#packageConfig: PermissionedGroupsPackageConfig;
	// @ts-expect-error - Will be used in future implementation
	#client: PermissionedGroupsCompatibleClient;

	calls: PermissionedGroupsCalls;
	tx: PermissionedGroupsTransactions;
	bcs: PermissionedGroupsBCS;

	constructor(options: PermissionedGroupsClientOptions) {
		if (options.client) {
			this.#client = options.client;
		} else {
			throw new PermissionedGroupsClientError('suiClient must be provided');
		}

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

		this.calls = new PermissionedGroupsCalls({ packageConfig: this.#packageConfig });
		this.tx = new PermissionedGroupsTransactions({ calls: this.calls });
		this.bcs = new PermissionedGroupsBCS({ packageConfig: this.#packageConfig });
	}
}
