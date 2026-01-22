// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MovePackageConfig } from '../../src/types.js';

/**
 * Move packages required for permissioned-groups tests.
 * Listed in dependency order (permissioned-groups must be published before dummy_test_witness).
 */
export const PACKAGES: MovePackageConfig[] = [
	{
		name: 'permissioned-groups',
		localPath: 'move/packages/permissioned-groups',
		containerPath: '/test-data/permissioned-groups',
	},
	{
		name: 'dummy-test-witness',
		localPath: 'move/packages/dummy_test_witness',
		containerPath: '/test-data/dummy_test_witness',
	},
];
