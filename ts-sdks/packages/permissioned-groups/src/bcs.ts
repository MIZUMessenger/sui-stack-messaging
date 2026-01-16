// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { PermissionedGroupsPackageConfig } from './types.js';

export interface PermissionedGroupsBCSOptions {
	packageConfig: PermissionedGroupsPackageConfig;
}

export class PermissionedGroupsBCS {
	#packageConfig: PermissionedGroupsPackageConfig;

	constructor(options: PermissionedGroupsBCSOptions) {
		this.#packageConfig = options.packageConfig;
	}
}
