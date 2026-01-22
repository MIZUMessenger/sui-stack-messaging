// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiClient } from '@mysten/sui/client';
import { fromBase64 } from '@mysten/sui/utils';
import { getPublishBytes, testPublish } from '../../../../../publish/src/utils/index.js';
import type { Account, MovePackageConfig, PublishedPackage } from '../types.js';
import { execCommand } from '../utils/exec-command.js';

/**
 * Publishes a single Move package to localnet (no dependencies).
 * Uses the traditional sui move build + transaction approach.
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

interface PublishWithDepsResult extends PublishedPackage {
	/** Package IDs of dependencies that were published */
	dependencyPackageIds: string[];
	/** All published packages in publish order (dependencies first, then root) */
	publishedPackages: Array<{ packageId: string; modules: string[] }>;
}

/**
 * Publishes a Move package with its dependencies using test-publish.
 * Uses sui client test-publish --publish-unpublished-deps.
 */
export async function publishPackageWithDeps({
	packageConfig,
	suiToolsContainerId,
}: {
	packageConfig: MovePackageConfig;
	suiToolsContainerId: string;
}): Promise<PublishWithDepsResult> {
	console.log(`Publishing ${packageConfig.name} with dependencies...`);

	const result = await testPublish({
		packagePath: packageConfig.containerPath,
		exec: async (command) => {
			return execCommand(command.split(' '), suiToolsContainerId);
		},
		buildEnv: 'localnet',
		publishUnpublishedDeps: true,
	});

	// The last published package is the root package we requested
	const rootPackage = result.publishedPackages[result.publishedPackages.length - 1];
	console.log(`Published ${packageConfig.name} at ${rootPackage.packageId}`);

	return {
		packageId: rootPackage.packageId,
		objectChanges: result.objectChanges,
		dependencyPackageIds: result.dependencyPackageIds,
		publishedPackages: result.publishedPackages,
	};
}

/**
 * Publishes multiple packages in dependency order.
 * - For single packages: uses traditional publish approach
 * - For multiple packages: uses test-publish --publish-unpublished-deps on the root package
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
	if (packages.length === 0) {
		return {};
	}

	// Single package: use traditional approach (faster, no dep resolution needed)
	if (packages.length === 1) {
		const result = await publishPackage({
			packageConfig: packages[0],
			suiClient,
			sender,
			suiToolsContainerId,
		});
		return { [packages[0].name]: result };
	}

	// Multiple packages: use test-publish with --publish-unpublished-deps on root
	// The root package is the last one (has all dependencies)
	const rootPackage = packages[packages.length - 1];
	const result = await publishPackageWithDeps({
		packageConfig: rootPackage,
		suiToolsContainerId,
	});

	const results: Record<string, PublishedPackage> = {};

	// The root package is always the main published package (last in publishedPackages)
	results[rootPackage.name] = {
		packageId: result.packageId,
		objectChanges: result.objectChanges,
	};

	// Map dependency packages by order
	// packages array is ordered by dependency (first = no deps, last = root)
	// dependencyPackageIds are the packages referenced by the Publish transaction (in dependency order)
	const dependencyConfigs = packages.slice(0, -1); // All except the last (root)

	// Dependency IDs from transaction are in the order they appear in the Move.toml
	// which should match our config order
	for (let i = 0; i < dependencyConfigs.length && i < result.dependencyPackageIds.length; i++) {
		const depConfig = dependencyConfigs[i];
		const depPackageId = result.dependencyPackageIds[i];
		results[depConfig.name] = {
			packageId: depPackageId,
			objectChanges: [], // Dependencies don't have objectChanges in the main publish
		};
		console.log(`Mapped dependency ${depConfig.name} to ${depPackageId}`);
	}

	return results;
}
