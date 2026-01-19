// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { PermissionedGroupsCalls } from './calls.js';

export interface PermissionedGroupsTransactionsOptions {
	calls: PermissionedGroupsCalls;
}

export class PermissionedGroupsTransactions {
	// @ts-expect-error - Will be used in future implementation
	#calls: PermissionedGroupsCalls;

	constructor(options: PermissionedGroupsTransactionsOptions) {
		this.#calls = options.calls;
	}
}
