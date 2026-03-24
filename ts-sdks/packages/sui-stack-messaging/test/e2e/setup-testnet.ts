// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { TestProject } from 'vitest/node';
import { startRelayerContainer } from './fixtures/relayer-container.js';
import { startIndexerContainer } from './fixtures/indexer-container.js';
import { TESTNET_SUI_STACK_MESSAGING_PACKAGE_CONFIG } from '../../src/constants.js';
import { TESTNET_SUI_GROUPS_PACKAGE_CONFIG } from '@mysten/sui-groups';

const TESTNET_SEAL_KEY_SERVERS =
	'0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75,0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8';

/**
 * Testnet setup: uses published package constants as defaults,
 * starts a relayer container pointing at the real Sui testnet.
 *
 * Required environment variables:
 *   TEST_WALLET_PRIVATE_KEY  — Funded admin wallet (suiprivkey1...)
 *
 * Optional (override published constants):
 *   SUI_RPC_URL              — Sui testnet RPC URL (default: https://fullnode.testnet.sui.io:443)
 *   GROUPS_PACKAGE_ID        — Override permissioned-groups package ID
 *   MESSAGING_PACKAGE_ID     — Override messaging package ID
 *   MESSAGING_NAMESPACE_ID   — Override MessagingNamespace shared object ID
 *   MESSAGING_VERSION_ID     — Override Version shared object ID
 *   FAUCET_URL               — Testnet faucet URL (default: https://faucet.testnet.sui.io)
 *   RELAYER_URL              — Pre-deployed relayer URL. When set, skips container startup.
 *   INDEXER_URL              — Pre-deployed indexer URL. When set, skips container startup.
 *   WALRUS_PUBLISHER_SUI_ADDRESS — Walrus publisher address for indexer event filtering
 *   SEAL_KEY_SERVERS         — Comma-separated Seal key server object IDs
 *   SEAL_THRESHOLD           — Seal threshold (default: 2)
 */
export async function setupTestnet(project: TestProject) {
	console.log('Setting up E2E test environment (testnet)...');

	const suiRpcUrl = process.env.SUI_RPC_URL ?? 'https://fullnode.testnet.sui.io:443';
	const groupsPackageId =
		process.env.GROUPS_PACKAGE_ID ?? TESTNET_SUI_GROUPS_PACKAGE_CONFIG.originalPackageId;
	const messagingPackageId =
		process.env.MESSAGING_PACKAGE_ID ??
		TESTNET_SUI_STACK_MESSAGING_PACKAGE_CONFIG.originalPackageId;
	const messagingNamespaceId =
		process.env.MESSAGING_NAMESPACE_ID ?? TESTNET_SUI_STACK_MESSAGING_PACKAGE_CONFIG.namespaceId;
	const messagingVersionId =
		process.env.MESSAGING_VERSION_ID ?? TESTNET_SUI_STACK_MESSAGING_PACKAGE_CONFIG.versionId;
	const faucetUrl = process.env.FAUCET_URL ?? 'https://faucet.testnet.sui.io';

	const adminSecretKey = process.env.TEST_WALLET_PRIVATE_KEY;
	if (!adminSecretKey) {
		throw new Error('Missing required env var for testnet E2E: TEST_WALLET_PRIVATE_KEY');
	}

	// Start the relayer container or use a pre-deployed one
	let relayerUrl: string;
	if (process.env.RELAYER_URL) {
		relayerUrl = process.env.RELAYER_URL;
		console.log(`Using pre-deployed relayer at ${relayerUrl}`);
	} else {
		console.log('Starting relayer container for testnet...');
		const relayer = await startRelayerContainer({
			suiRpcUrl,
			groupsPackageId,
		});
		relayerUrl = relayer.url;
	}

	// Start the indexer container or use a pre-deployed one
	let indexerUrl = '';
	if (process.env.INDEXER_URL) {
		indexerUrl = process.env.INDEXER_URL;
		console.log(`Using pre-deployed indexer at ${indexerUrl}`);
	} else {
		console.log('Starting indexer container for testnet...');
		const indexer = await startIndexerContainer({
			network: 'testnet',
			// publisherSuiAddress:
			// process.env.WALRUS_PUBLISHER_SUI_ADDRESS ?? TESTNET_WALRUS_PUBLISHER_SUI_ADDRESS,
		});
		indexerUrl = indexer.url;
	}

	// Parse Seal key server configs from env
	const sealKeyServerIds = (process.env.SEAL_KEY_SERVERS ?? TESTNET_SEAL_KEY_SERVERS)
		.split(',')
		.filter(Boolean);
	const sealThreshold = parseInt(process.env.SEAL_THRESHOLD ?? '2', 10);
	const sealServerConfigs = sealKeyServerIds.map((objectId) => ({
		objectId,
		weight: 1,
	}));

	// Derive admin address from the private key
	const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519');
	const adminKeypair = Ed25519Keypair.fromSecretKey(adminSecretKey);
	const adminAddress = adminKeypair.toSuiAddress();

	project.provide('network', 'testnet');
	// Testnet doesn't use testcontainer ports — provide 0 as sentinel values
	project.provide('localnetPort', 0);
	project.provide('graphqlPort', 0);
	project.provide('faucetPort', 0);
	project.provide('suiToolsContainerId', '');
	project.provide('suiClientUrl', suiRpcUrl);
	project.provide('adminAccount', {
		secretKey: adminSecretKey,
		address: adminAddress,
	});
	project.provide('publishedPackages', {
		'permissioned-groups': { packageId: groupsPackageId, createdObjects: [] },
		messaging: { packageId: messagingPackageId, createdObjects: [] },
	});
	project.provide('messagingNamespaceId', messagingNamespaceId);
	project.provide('messagingVersionId', messagingVersionId);
	project.provide('relayerUrl', relayerUrl);
	project.provide('sealServerConfigs', sealServerConfigs);
	project.provide('faucetUrl', faucetUrl);
	project.provide('sealThreshold', sealThreshold);
	project.provide('indexerUrl', indexerUrl);

	console.log(`E2E testnet environment is ready.`);
	console.log(`  Sui RPC:     ${suiRpcUrl}`);
	console.log(`  Relayer:     ${relayerUrl}`);
	console.log(`  Indexer:     ${indexerUrl || '(not available)'}`);
	console.log(`  Admin:       ${adminAddress}`);
	console.log(`  Groups pkg:  ${groupsPackageId}`);
	console.log(`  Messaging:   ${messagingPackageId}`);
}
