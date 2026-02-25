// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { PublishedPackage, SerializableAccount } from './types.js';

declare module 'vitest' {
	export interface ProvidedContext {
		localnetPort: number;
		graphqlPort: number;
		faucetPort: number;
		suiToolsContainerId: string;
		adminAccount: SerializableAccount;
		suiClientUrl: string;
		publishedPackages: Record<string, PublishedPackage>;
		/** MessagingNamespace shared object ID (messaging-groups suite only) */
		messagingNamespaceId?: string;
		/** Version shared object ID (messaging-groups suite only) */
		messagingVersionId?: string;
	}
}
