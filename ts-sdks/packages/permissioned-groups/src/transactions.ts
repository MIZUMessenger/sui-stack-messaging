// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { PermissionedGroupsCall } from './call.js';

export interface PermissionedGroupsTransactionsOptions {
	call: PermissionedGroupsCall;
}

export class PermissionedGroupsTransactions {
	// @ts-expect-error - Will be used in future implementation
	#call: PermissionedGroupsCall;

	constructor(options: PermissionedGroupsTransactionsOptions) {
		this.#call = options.call;
	}
}
