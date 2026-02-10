import type { SuiObjectChange } from "@mysten/sui/jsonRpc";

export type BuildEnv = "localnet" | "devnet" | "testnet" | "mainnet";

export interface TestPublishResult {
  /** The digest of the publish transaction */
  digest: string;
  /** All object changes from the transaction (includes all published packages) */
  objectChanges: SuiObjectChange[];
  /** All packages that were published (root + dependencies) */
  publishedPackages: Array<{
    packageId: string;
    modules: string[];
  }>;
  /** Package IDs of dependencies (from transaction inputs, excludes MoveStdlib 0x1 and Sui 0x2) */
  dependencyPackageIds: string[];
}

/**
 * Publishes a Move package using `sui client test-publish`.
 * This command supports publishing packages with unpublished dependencies.
 *
 * @param packagePath - The file system path to the Move package to be published.
 * @param exec - A function to execute shell commands. Provides flexibility for testing in custom execution environments (eg TestContainers).
 * @param options.buildEnv - The build environment to use (localnet, devnet, testnet, mainnet). Required.
 * @param options.publishUnpublishedDeps - If true, also publishes transitive dependencies that have not already been published.
 * @param options.gasBudget - Gas budget for the transaction (default: 500000000 MIST).
 * @returns A Promise that resolves to the publish result containing all published package info.
 */
export const testPublish = async ({
  packagePath,
  exec,
  buildEnv,
  publishUnpublishedDeps = false,
  gasBudget = 500000000,
}: {
  packagePath: string;
  exec: (command: string) => Promise<string>;
  buildEnv: BuildEnv;
  publishUnpublishedDeps?: boolean;
  gasBudget?: number;
}): Promise<TestPublishResult> => {
  const args = [
    "sui",
    "client",
    "test-publish",
    packagePath,
    "--build-env",
    buildEnv,
    "--json",
    "--gas-budget",
    gasBudget.toString(),
  ];

  if (publishUnpublishedDeps) {
    args.push("--publish-unpublished-deps");
  }

  const output = await exec(args.join(" "));

  // Parse JSON output - there may be multiple JSON objects (one per published package)
  // Each dependency published gets its own JSON output
  const jsonOutputs: string[] = [];
  let remaining = output;
  while (remaining.length > 0) {
    const jsonStart = remaining.indexOf("{");
    if (jsonStart === -1) break;

    // Find matching closing brace by counting braces
    let depth = 0;
    let jsonEnd = -1;
    for (let i = jsonStart; i < remaining.length; i++) {
      if (remaining[i] === "{") depth++;
      else if (remaining[i] === "}") {
        depth--;
        if (depth === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }

    if (jsonEnd === -1) break;
    jsonOutputs.push(remaining.slice(jsonStart, jsonEnd));
    remaining = remaining.slice(jsonEnd);
  }

  if (jsonOutputs.length === 0) {
    throw new Error(`Failed to parse test-publish output: ${output}`);
  }

  // Parse all JSON outputs and collect all objectChanges
  const allObjectChanges: SuiObjectChange[] = [];
  let lastDigest = "";
  const dependencyPackageIds: string[] = [];

  // Standard library packages to exclude from dependencies
  const SYSTEM_PACKAGES = [
    "0x0000000000000000000000000000000000000000000000000000000000000001", // MoveStdlib
    "0x0000000000000000000000000000000000000000000000000000000000000002", // Sui
  ];

  for (const jsonStr of jsonOutputs) {
    const parsed = JSON.parse(jsonStr);
    if (parsed.objectChanges) {
      allObjectChanges.push(...parsed.objectChanges);
    }
    if (parsed.digest) {
      lastDigest = parsed.digest;
    }

    // Extract dependency package IDs from transaction Publish inputs
    const transactions = parsed.transaction?.data?.transaction?.transactions;
    if (transactions) {
      for (const tx of transactions) {
        if (tx.Publish && Array.isArray(tx.Publish)) {
          for (const depId of tx.Publish) {
            if (typeof depId === "string" && !SYSTEM_PACKAGES.includes(depId)) {
              dependencyPackageIds.push(depId);
            }
          }
        }
      }
    }
  }

  const result = { digest: lastDigest, objectChanges: allObjectChanges };

  // Extract all published packages from objectChanges
  const publishedChanges = (result.objectChanges as SuiObjectChange[])?.filter(
    (change): change is SuiObjectChange & { type: "published" } =>
      change.type === "published",
  );

  if (!publishedChanges || publishedChanges.length === 0) {
    throw new Error(`No packages were published. Output: ${output}`);
  }

  const publishedPackages = publishedChanges.map((change) => ({
    packageId: change.packageId,
    modules: change.modules || [],
  }));

  return {
    digest: result.digest,
    objectChanges: result.objectChanges || [],
    publishedPackages,
    dependencyPackageIds,
  };
};
