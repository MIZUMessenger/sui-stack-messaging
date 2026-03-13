// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

export interface IndexerContainerConfig {
	/** Network to connect to ('testnet' or 'mainnet') */
	network: 'testnet' | 'mainnet';
	/** Optional: Walrus publisher Sui address to filter BlobCertified events */
	publisherSuiAddress?: string;
	/** Port to expose on the host (default: auto-assigned) */
	hostPort?: number;
}

export interface StartedIndexer {
	container: StartedTestContainer;
	/** The indexer URL accessible from the host (e.g. http://localhost:12345) */
	url: string;
}

/**
 * Builds the walrus-discovery-indexer Docker image from the local Dockerfile and starts it.
 */
export async function startIndexerContainer(
	config: IndexerContainerConfig,
): Promise<StartedIndexer> {
	const INDEXER_PORT = 3001;
	const indexerDockerfilePath = '../../../walrus-discovery-indexer';

	const container = await GenericContainer.fromDockerfile(indexerDockerfilePath).build(
		'walrus-discovery-indexer-test',
		{ deleteOnExit: false },
	);

	const env: Record<string, string> = {
		NETWORK: config.network,
		PORT: String(INDEXER_PORT),
	};

	if (config.publisherSuiAddress) {
		env.WALRUS_PUBLISHER_SUI_ADDRESS = config.publisherSuiAddress;
	}

	let builder = container
		.withExposedPorts(INDEXER_PORT)
		.withEnvironment(env)
		.withWaitStrategy(Wait.forHttp('/health', INDEXER_PORT).forStatusCode(200))
		.withStartupTimeout(120_000);

	builder = builder.withLogConsumer((stream) => {
		stream.on('data', (data: Buffer) => {
			console.log(`[indexer] ${data.toString().trimEnd()}`);
		});
	});

	if (config.hostPort) {
		builder = builder.withExposedPorts({
			container: INDEXER_PORT,
			host: config.hostPort,
		});
	}

	const started = await builder.start();

	const mappedPort = started.getMappedPort(INDEXER_PORT);
	const host = started.getHost();
	const url = `http://${host}:${mappedPort}`;

	console.log(`Indexer container started at ${url}`);

	return { container: started, url };
}
