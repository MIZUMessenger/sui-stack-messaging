// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
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
	suiClient: SuiJsonRpcClient;
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
	/** Transaction digest of the publish transaction */
	digest: string;
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
		digest: result.digest,
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
	suiClient: SuiJsonRpcClient;
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

	// Map dependency packages by querying each dependency's publish transaction from the chain.
	// test-publish --publish-unpublished-deps publishes each dependency in a separate transaction,
	// but the CLI JSON only contains the root transaction. We query each dependency to get its
	// module names (for matching to configs) and objectChanges (for init objects).
	const dependencyConfigs = packages.slice(0, -1); // All except the last (root)

	// Query each dependency's publish transaction from the chain
	const depInfos: Array<{
		packageId: string;
		modules: string[];
		objectChanges: typeof result.objectChanges;
	}> = [];

	for (const depPackageId of result.dependencyPackageIds) {
		try {
			const resp = await suiClient.queryTransactionBlocks({
				filter: { ChangedObject: depPackageId },
				options: { showObjectChanges: true },
				limit: 1,
			});
			const objectChanges = resp.data[0]?.objectChanges ?? [];
			const publishedChange = objectChanges.find(
				(c) => c.type === 'published' && c.packageId === depPackageId,
			);
			const modules =
				publishedChange && publishedChange.type === 'published'
					? publishedChange.modules || []
					: [];
			depInfos.push({ packageId: depPackageId, modules, objectChanges });
		} catch (e) {
			console.warn(`  queryTransactionBlocks failed for ${depPackageId}:`, e);
			depInfos.push({ packageId: depPackageId, modules: [], objectChanges: [] });
		}
	}

	// Match each config to the correct dependency using its moduleName field.
	for (const depConfig of dependencyConfigs) {
		const match = depInfos.find((info) => info.modules.some((m) => m === depConfig.moduleName));

		if (!match) {
			console.warn(
				`Could not match dependency ${depConfig.name} (moduleName: ${depConfig.moduleName}) ` +
					`to any published package. Available: ${depInfos.map((d) => d.modules.join(',')).join(' | ')}`,
			);
			continue;
		}

		results[depConfig.name] = {
			packageId: match.packageId,
			objectChanges: match.objectChanges,
		};
		console.log(`Mapped dependency ${depConfig.name} to ${match.packageId}`);
	}

	return results;
}
