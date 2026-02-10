// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineProject } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineProject({
	test: {
		name: 'messaging-groups',
		root: __dirname,
		globals: true,
		environment: 'node',
		globalSetup: ['./setup.ts'],
		include: ['./**/*.test.ts'],
		testTimeout: 120_000,
		hookTimeout: 120_000,
		fileParallelism: false,
	},
});
