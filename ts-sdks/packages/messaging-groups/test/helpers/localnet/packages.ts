// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MovePackageConfig } from '../types.js';

/**
 * Move packages required for messaging + example-apps tests.
 * Listed in dependency order (example_app depends on messaging depends on permissioned-groups).
 */
export const MESSAGING_PACKAGES: MovePackageConfig[] = [
	{
		name: 'permissioned-groups',
		moduleName: 'display',
		localPath: 'move/packages/permissioned-groups',
		containerPath: '/test-data/permissioned-groups',
	},
	{
		name: 'messaging',
		moduleName: 'messaging',
		localPath: 'move/packages/messaging',
		containerPath: '/test-data/messaging',
	},
	{
		name: 'example-app',
		moduleName: 'custom_seal_policy',
		localPath: 'move/packages/example_app',
		containerPath: '/test-data/example_app',
	},
];
