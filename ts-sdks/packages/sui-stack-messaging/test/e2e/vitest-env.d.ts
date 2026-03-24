// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClientTypes } from '@mysten/sui/client';
import type { PublishedPackage, SerializableAccount } from '../helpers/types.js';

interface SealServerConfig {
	objectId: string;
	weight: number;
}

declare module 'vitest' {
	export interface ProvidedContext {
		/** Which network the tests are running against. */
		network: SuiClientTypes.Network;
		localnetPort: number;
		graphqlPort: number;
		faucetPort: number;
		suiToolsContainerId: string;
		suiClientUrl: string;
		adminAccount: SerializableAccount;
		publishedPackages: Record<string, PublishedPackage>;
		messagingNamespaceId: string;
		messagingVersionId: string;
		relayerUrl: string;
		/** Real Seal key server configs. Empty for localnet (uses mock SealClient). */
		sealServerConfigs: SealServerConfig[];
		/** Faucet URL. Provided by both localnet and testnet setups. */
		faucetUrl: string;
		/** Seal threshold. Default: 2. */
		sealThreshold?: number;
		/** Walrus discovery indexer URL. Empty string when not available. */
		indexerUrl: string;
	}
}
