// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClient, SuiObjectChange } from '@mysten/sui/client';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

export interface Account {
	keypair: Ed25519Keypair;
	address: string;
}

/**
 * Serializable version of Account for Vitest provide/inject.
 * The secret key (bech32 encoded) can be used to reconstruct the keypair.
 */
export interface SerializableAccount {
	secretKey: string;
	address: string;
}

/**
 * Configuration for a Move package to be published during test setup.
 */
export interface MovePackageConfig {
	/** Name identifier for the package */
	name: string;
	/** Local path relative to repository root */
	localPath: string;
	/** Path inside the test container */
	containerPath: string;
}

/**
 * Result of publishing a Move package.
 */
export interface PublishedPackage {
	packageId: string;
	objectChanges: SuiObjectChange[];
}

/**
 * Map of package names to their published info.
 */
export type PublishedPackages = Record<string, PublishedPackage>;

/**
 * Base context provided to all test suites.
 */
export interface BaseTestContext {
	localnetPort: number;
	graphqlPort: number;
	faucetPort: number;
	suiToolsContainerId: string;
	suiClient: SuiClient;
	adminAccount: Account;
}

/**
 * Extended context with published packages.
 */
export interface TestContextWithPackages extends BaseTestContext {
	publishedPackages: PublishedPackages;
}
