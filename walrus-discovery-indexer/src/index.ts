import { SuiGrpcClient } from '@mysten/sui/grpc';
import { WalrusClient } from '@mysten/walrus';
import { loadConfig } from './config.js';
import type { Config } from './config.js';
import { InMemoryDiscoveryStore } from './discovery-store.js';
import { createApp } from './api.js';
import { startCheckpointListener } from './checkpoint-listener.js';

// Entry point — wires config, clients, store, REST API, and checkpoint listener.
async function main() {
  const partialConfig = loadConfig();
  console.log(`Walrus Discovery Indexer starting on ${partialConfig.network}...`);

  const grpcClient = new SuiGrpcClient({
    network: partialConfig.network,
    baseUrl: partialConfig.grpcUrl,
  });

  const walrusClient = new WalrusClient({
    network: partialConfig.network,
    suiClient: grpcClient,
  });

  const blobType = await walrusClient.getBlobType();
  const walrusPackageId = blobType.split('::')[0];
  console.log(`Walrus package ID (auto-derived): ${walrusPackageId}`);

  const config: Config = {
    ...partialConfig,
    walrusPackageId,
  };

  const store = new InMemoryDiscoveryStore();

  const app = createApp(store);
  const server = app.listen(config.port, () => {
    console.log(`REST API listening on http://localhost:${config.port}`);
    console.log(`  GET /v1/groups/:groupId/patches — patches for a group`);
    console.log(`  GET /v1/patches                 — all patches`);
    console.log(`  GET /health                     — health check`);
  });

  const abortController = new AbortController();

  const shutdown = () => {
    console.log('\nShutting down...');
    abortController.abort();
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await startCheckpointListener(config, grpcClient, walrusClient, store, abortController.signal);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
