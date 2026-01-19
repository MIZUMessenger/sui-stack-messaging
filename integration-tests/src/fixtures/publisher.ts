// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClient } from '@mysten/sui/client';
import { fromBase64 } from '@mysten/sui/utils';
import { getPublishBytes } from '../../../publish/src/utils/getPublishBytes.js';
import type { Account, MovePackageConfig, PublishedPackage } from '../types.js';
import { execCommand } from '../utils/exec-command.js';

/**
 * Publishes a Move package to localnet.
 *
 * @param packageConfig - Configuration for the package to publish
 * @param suiClient - SuiClient instance connected to localnet
 * @param sender - Account that will publish and own the UpgradeCap
 * @param suiToolsContainerId - Docker container ID for executing sui commands
 */
export async function publishPackage({
	packageConfig,
	suiClient,
	sender,
	suiToolsContainerId,
}: {
	packageConfig: MovePackageConfig;
	suiClient: SuiClient;
	sender: Account;
	suiToolsContainerId: string;
}): Promise<PublishedPackage> {
	console.log(`Publishing ${packageConfig.name}...`);

	const unsignedBytes = await getPublishBytes({
		packagePath: packageConfig.containerPath,
		suiClient,
		sender: sender.address,
		exec: async (command) => {
			return execCommand(command.split(' '), suiToolsContainerId);
		},
	});

	const { bytes, signature } = await sender.keypair.signTransaction(fromBase64(unsignedBytes));

	const resp = await suiClient.executeTransactionBlock({
		transactionBlock: bytes,
		signature,
		options: {
			showEffects: true,
			showObjectChanges: true,
		},
	});

	const publishedChange = resp.objectChanges?.find((change) => change.type === 'published');
	if (!publishedChange || publishedChange.type !== 'published') {
		throw new Error(`Failed to find published package ID for ${packageConfig.name}`);
	}

	console.log(`Published ${packageConfig.name} at ${publishedChange.packageId}`);

	return {
		packageId: publishedChange.packageId,
		objectChanges: resp.objectChanges || [],
	};
}

/**
 * Publishes multiple packages in dependency order.
 */
export async function publishPackages({
	packages,
	suiClient,
	sender,
	suiToolsContainerId,
}: {
	packages: MovePackageConfig[];
	suiClient: SuiClient;
	sender: Account;
	suiToolsContainerId: string;
}): Promise<Record<string, PublishedPackage>> {
	const results: Record<string, PublishedPackage> = {};

	for (const pkg of packages) {
		results[pkg.name] = await publishPackage({
			packageConfig: pkg,
			suiClient,
			sender,
			suiToolsContainerId,
		});
	}

	return results;
}
