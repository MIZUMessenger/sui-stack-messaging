// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { PermissionedGroupsPackageConfig } from './types.js';

export interface PermissionedGroupsCallOptions {
	packageConfig: PermissionedGroupsPackageConfig;
}

export class PermissionedGroupsCalls {
	// @ts-expect-error - Will be used in future implementation
	#packageConfig: PermissionedGroupsPackageConfig;

	constructor(options: PermissionedGroupsCallOptions) {
		this.#packageConfig = options.packageConfig;
	}
}
