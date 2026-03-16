// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { TestProject } from 'vitest/node';
import { MESSAGING_PACKAGES } from '../helpers/localnet/packages.js';
import { bootstrapLocalnet } from '../helpers/localnet/localnet-setup.js';
import { startRelayerContainer } from './fixtures/relayer-container.js';

/**
 * Localnet setup: spins up Sui localnet + relayer via testcontainers,
 * publishes Move packages, and provides all context to tests.
 *
 * Uses mock SealClient (no real key servers needed).
 */
export async function setupLocalnet(project: TestProject) {
	console.log('Setting up E2E test environment (localnet via testcontainers)...');

	// 1. Bootstrap Sui localnet and publish packages
	const env = await bootstrapLocalnet(MESSAGING_PACKAGES);

	project.provide('network', 'localnet');
	project.provide('localnetPort', env.ports.localnet);
	project.provide('graphqlPort', env.ports.graphql);
	project.provide('faucetPort', env.ports.faucet);
	project.provide('suiToolsContainerId', env.containerId);
	project.provide('suiClientUrl', env.suiClientUrl);
	project.provide('adminAccount', {
		secretKey: env.adminAccount.secretKey,
		address: env.adminAccount.address,
	});
	project.provide('publishedPackages', env.publishedPackages);
	project.provide('messagingNamespaceId', env.messagingNamespaceId);
	project.provide('messagingVersionId', env.messagingVersionId);

	// 2. Start the relayer container pointing to our localnet
	console.log('Starting relayer container...');
	const relayer = await startRelayerContainer({
		suiRpcUrl: `http://host.testcontainers.internal:${env.ports.localnet}`,
		groupsPackageId: env.publishedPackages['permissioned-groups'].packageId,
	});

	project.provide('relayerUrl', relayer.url);

	// No real Seal key servers for localnet — tests use mock SealClient
	project.provide('sealServerConfigs', []);
	project.provide('faucetUrl', `http://localhost:${env.ports.faucet}`);
	// No indexer on localnet (requires Walrus which isn't available locally)
	project.provide('indexerUrl', '');

	console.log('E2E localnet environment is ready.');
}
