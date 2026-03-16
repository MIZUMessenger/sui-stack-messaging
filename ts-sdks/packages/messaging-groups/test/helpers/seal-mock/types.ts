// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { ClientWithCoreApi } from '@mysten/sui/client';

export interface MockSealClientOptions {
	/** Sui client for dry-running seal_approve transactions. */
	suiClient: ClientWithCoreApi;
	/** Messaging package ID (used in EncryptedObject BCS serialization). */
	packageId: string;
}
