// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import '../../src/vitest.js';
import type { TestProject } from 'vitest/node';
import { SuiClient } from '@mysten/sui/client';
import { requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import { startSuiLocalnet, publishPackages } from '../../src/fixtures/index.js';
import { execCommand } from '../../src/utils/exec-command.js';
import { getNewAccount } from '../../src/utils/get-new-account.js';
import { PACKAGES } from './config.js';

export default async function setup(project: TestProject) {
	console.log('Setting up messaging test environment...');

	const fixture = await startSuiLocalnet({
		packages: PACKAGES,
		verbose: true,
	});

	const LOCALNET_PORT = fixture.ports.localnet;
	const FAUCET_PORT = fixture.ports.faucet;
	const SUI_TOOLS_CONTAINER_ID = fixture.containerId;

	project.provide('localnetPort', LOCALNET_PORT);
	project.provide('graphqlPort', fixture.ports.graphql);
	project.provide('faucetPort', FAUCET_PORT);
	project.provide('suiToolsContainerId', SUI_TOOLS_CONTAINER_ID);

	// Initialize sui client in container
	await execCommand(['sui', 'client', '--yes'], SUI_TOOLS_CONTAINER_ID);

	console.log('Preparing admin account...');
	const suiClient = new SuiClient({
		url: `http://localhost:${LOCALNET_PORT}`,
	});
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

	project.provide('adminAccount', admin);
	project.provide('suiClient', suiClient);
	project.provide('publishedPackages', publishedPackages);

	console.log('messaging test environment is ready.');
}
