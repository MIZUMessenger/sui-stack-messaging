// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
	'suites/permissioned-groups/vitest.config.ts',
	'suites/messaging/vitest.config.ts',
	'suites/example-apps/vitest.config.ts',
]);
