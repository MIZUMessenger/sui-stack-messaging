// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MovePackageConfig } from '../../src/types.js';

/**
 * Move packages required for messaging tests.
 * Listed in dependency order (messaging depends on permissioned-groups).
 */
export const PACKAGES: MovePackageConfig[] = [
	{
		name: 'permissioned-groups',
		localPath: 'move/packages/permissioned-groups',
		containerPath: '/test-data/permissioned-groups',
	},
	{
		name: 'messaging',
		localPath: 'move/packages/messaging',
		containerPath: '/test-data/messaging',
	},
];
