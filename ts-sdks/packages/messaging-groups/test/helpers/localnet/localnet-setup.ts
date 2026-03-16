// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import type { MovePackageConfig, PublishedPackages } from '../types.js';
import { startSuiLocalnet } from './sui-localnet.js';
import { publishPackages } from './publisher.js';
import { execCommand } from './exec-command.js';
import { getNewAccount } from '../get-new-account.js';
import { createSuiClient } from '../create-sui-client.js';

export interface LocalnetSetupResult {
	ports: { localnet: number; graphql: number; faucet: number; grpc: number };
	containerId: string;
	suiClientUrl: string;
	adminAccount: {
		secretKey: string;
		address: string;
		keypair: ReturnType<typeof getNewAccount>['keypair'];
	};
	publishedPackages: PublishedPackages;
	messagingNamespaceId: string;
	messagingVersionId: string;
}

/**
 * Boots a Sui localnet container, publishes Move packages, and extracts
 * shared singleton object IDs.
 *
 * Reusable across integration and e2e globalSetup functions.
 */
export async function bootstrapLocalnet(
	packages: MovePackageConfig[],
): Promise<LocalnetSetupResult> {
	const fixture = await startSuiLocalnet({
		packages,
		verbose: true,
	});

	const LOCALNET_PORT = fixture.ports.localnet;
	const FAUCET_PORT = fixture.ports.faucet;
	const SUI_TOOLS_CONTAINER_ID = fixture.containerId;
	const SUI_CLIENT_URL = `http://localhost:${LOCALNET_PORT}`;

	// Initialize sui client in container and configure localnet environment
	await execCommand(['sui', 'client', '--yes'], SUI_TOOLS_CONTAINER_ID);
	await execCommand(
		['sui', 'client', 'new-env', '--alias', 'localnet', '--rpc', 'http://127.0.0.1:9000'],
		SUI_TOOLS_CONTAINER_ID,
	);
	await execCommand(['sui', 'client', 'switch', '--env', 'localnet'], SUI_TOOLS_CONTAINER_ID);
	await execCommand(['sui', 'client', 'faucet', '--json'], SUI_TOOLS_CONTAINER_ID);

	console.log('Preparing admin account...');
	const suiClient = createSuiClient({ url: SUI_CLIENT_URL, network: 'localnet' });
	const admin = getNewAccount();
	await requestSuiFromFaucetV2({
		host: `http://localhost:${FAUCET_PORT}`,
		recipient: admin.address,
	});

	console.log('Publishing Move packages...');
	const published = await publishPackages({
		packages,
		suiClient,
		suiToolsContainerId: SUI_TOOLS_CONTAINER_ID,
	});

	// Find MessagingNamespace and Version shared objects from the messaging package's publish tx
	const messagingCreated = published['messaging'].createdObjects;

	const namespaceObj = messagingCreated.find((obj) =>
		obj.objectType.includes('MessagingNamespace'),
	);
	if (!namespaceObj) {
		throw new Error('MessagingNamespace not found in messaging publish transaction');
	}
	const messagingNamespaceId = namespaceObj.objectId;
	console.log(`Found MessagingNamespace at ${messagingNamespaceId}`);

	const versionObj = messagingCreated.find((obj) => obj.objectType.includes('::version::Version'));
	if (!versionObj) {
		throw new Error('Version shared object not found in messaging publish transaction');
	}
	const messagingVersionId = versionObj.objectId;
	console.log(`Found Version at ${messagingVersionId}`);

	return {
		ports: {
			localnet: LOCALNET_PORT,
			graphql: fixture.ports.graphql,
			faucet: FAUCET_PORT,
			grpc: fixture.ports.grpc,
		},
		containerId: SUI_TOOLS_CONTAINER_ID,
		suiClientUrl: SUI_CLIENT_URL,
		adminAccount: {
			secretKey: admin.keypair.getSecretKey(),
			address: admin.address,
			keypair: admin.keypair,
		},
		publishedPackages: published,
		messagingNamespaceId,
		messagingVersionId,
	};
}
