// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		projects: ['suites/permissioned-groups', 'suites/messaging-groups', 'suites/example-apps'],
	},
});
