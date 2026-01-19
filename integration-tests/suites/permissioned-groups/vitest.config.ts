// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { defineProject } from 'vitest/config';

export default defineProject({
	test: {
		name: 'permissioned-groups',
		globals: true,
		environment: 'node',
		globalSetup: ['./setup.ts'],
		include: ['./**/*.test.ts'],
		testTimeout: 120_000,
		hookTimeout: 120_000,
	},
});
