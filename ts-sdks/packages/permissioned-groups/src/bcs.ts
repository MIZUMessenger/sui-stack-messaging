// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { PermissionedGroupsPackageConfig } from './types.js';

export interface PermissionedGroupsBCSOptions {
	packageConfig: PermissionedGroupsPackageConfig;
}

export class PermissionedGroupsBCS {
	// @ts-expect-error - Will be used in future implementation
	#packageConfig: PermissionedGroupsPackageConfig;

	constructor(options: PermissionedGroupsBCSOptions) {
		this.#packageConfig = options.packageConfig;
	}
}
