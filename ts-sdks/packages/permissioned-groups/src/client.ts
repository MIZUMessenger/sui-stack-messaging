// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

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

export class PermissionedGroupsClient {
	#packageConfig: PermissionedGroupsPackageConfig;
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

		const network = options.client.network;
		switch (network) {
			case 'testnet':
				this.#packageConfig = TESTNET_PERMISSIONED_GROUPS_PACKAGE_CONFIG;
				break;
			case 'mainnet':
				this.#packageConfig = MAINNET_PERMISSIONED_GROUPS_PACKAGE_CONFIG;
				break;
			default:
				throw new PermissionedGroupsClientError(`Unsupported network: ${network}`);
		}

		this.calls = new PermissionedGroupsCalls({ packageConfig: this.#packageConfig });
		this.tx = new PermissionedGroupsTransactions({ calls: this.calls });
		this.bcs = new PermissionedGroupsBCS({ packageConfig: this.#packageConfig });
	}
}
