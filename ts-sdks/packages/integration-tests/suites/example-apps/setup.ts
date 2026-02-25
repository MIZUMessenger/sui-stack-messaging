// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import '../../src/vitest.js';
import type { TestProject } from 'vitest/node';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import { startSuiLocalnet, publishPackages } from '../../src/fixtures/index.js';
import { execCommand } from '../../src/utils/exec-command.js';
import { getNewAccount } from '../../src/utils/get-new-account.js';
import { PACKAGES } from './config.js';

export default async function setup(project: TestProject) {
	console.log('Setting up example-apps test environment...');

	const fixture = await startSuiLocalnet({
		packages: PACKAGES,
		verbose: true,
	});

	const LOCALNET_PORT = fixture.ports.localnet;
	const FAUCET_PORT = fixture.ports.faucet;
	const SUI_TOOLS_CONTAINER_ID = fixture.containerId;
	const SUI_CLIENT_URL = `http://localhost:${LOCALNET_PORT}`;

	project.provide('localnetPort', LOCALNET_PORT);
	project.provide('graphqlPort', fixture.ports.graphql);
	project.provide('faucetPort', FAUCET_PORT);
	project.provide('suiToolsContainerId', SUI_TOOLS_CONTAINER_ID);
	project.provide('suiClientUrl', SUI_CLIENT_URL);

	// Initialize sui client in container and configure localnet environment
	await execCommand(['sui', 'client', '--yes'], SUI_TOOLS_CONTAINER_ID);
	// Add localnet environment (inside container, localnet is on localhost:9000)
	await execCommand(
		['sui', 'client', 'new-env', '--alias', 'localnet', '--rpc', 'http://127.0.0.1:9000'],
		SUI_TOOLS_CONTAINER_ID,
	);
	// Switch to localnet environment
	await execCommand(['sui', 'client', 'switch', '--env', 'localnet'], SUI_TOOLS_CONTAINER_ID);

	// Fund the container's active address from faucet (using container's internal faucet port)
	await execCommand(['sui', 'client', 'faucet', '--json'], SUI_TOOLS_CONTAINER_ID);

	console.log('Preparing admin account...');
	const suiClient = new SuiJsonRpcClient({ url: SUI_CLIENT_URL, network: 'localnet' });
	const admin = getNewAccount();
	await requestSuiFromFaucetV2({
		host: `http://localhost:${FAUCET_PORT}`,
		recipient: admin.address,
	});

	console.log('Publishing Move packages...');
	const publishedPackages = await publishPackages({
		packages: PACKAGES,
		suiClient,
		sender: admin,
		suiToolsContainerId: SUI_TOOLS_CONTAINER_ID,
	});

	// Find the MessagingNamespace shared object created during messaging's init.
	// The objectChanges from testPublish include all objects from all published packages.
	const objectChanges = publishedPackages['messaging'].objectChanges;
	const namespaceChange = objectChanges.find(
		(change) =>
			change.type === 'created' &&
			'objectType' in change &&
			change.objectType.includes('MessagingNamespace'),
	);

	if (!namespaceChange || !('objectId' in namespaceChange)) {
		throw new Error('MessagingNamespace not found in objectChanges');
	}

	const namespaceId = namespaceChange.objectId;
	console.log(`Found MessagingNamespace at ${namespaceId}`);

	// Find the Version shared object created during messaging's init
	const versionChange = objectChanges.find(
		(change) =>
			change.type === 'created' &&
			'objectType' in change &&
			change.objectType.includes('::version::Version'),
	);

	if (!versionChange || !('objectId' in versionChange)) {
		throw new Error('Version shared object not found in objectChanges');
	}

	const versionId = versionChange.objectId;
	console.log(`Found Version at ${versionId}`);

	// Provide serializable account (secret key as bech32)
	project.provide('adminAccount', {
		secretKey: admin.keypair.getSecretKey(),
		address: admin.address,
	});
	project.provide('publishedPackages', publishedPackages);
	project.provide('messagingNamespaceId', namespaceId);
	project.provide('messagingVersionId', versionId);

	console.log('example-apps test environment is ready.');
}
