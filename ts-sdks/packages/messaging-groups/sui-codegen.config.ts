// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiCodegenConfig } from '@mysten/codegen';

const config: SuiCodegenConfig = {
	output: './src/contracts',
	// Summaries are generated manually via the codegen script, which patches
	// address_mapping.json to use MVR names for dependencies before generation.
	generateSummaries: false,
	prune: true,
	packages: [
		{
			package: '@local-pkg/messaging',
			path: '../../../move/packages/messaging',
		},
	],
};

export default config;
