// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClient } from '@mysten/sui/client';
import type { Account, PublishedPackage } from './types.js';

declare module 'vitest' {
	export interface ProvidedContext {
		localnetPort: number;
		graphqlPort: number;
		faucetPort: number;
		suiToolsContainerId: string;
		adminAccount: Account;
		suiClient: SuiClient;
		publishedPackages: Record<string, PublishedPackage>;
	}
}
