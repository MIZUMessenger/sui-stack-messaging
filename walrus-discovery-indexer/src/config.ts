import 'dotenv/config';

export type Network = 'testnet' | 'mainnet';

export interface Config {
  network: Network;
  grpcUrl: string;
  walrusPackageId: string;
  publisherSuiAddress?: string;
  port: number;
}

const GRPC_URLS: Record<Network, string> = {
  testnet: 'https://fullnode.testnet.sui.io:443',
  mainnet: 'https://fullnode.mainnet.sui.io:443',
};

// Load and validate environment variables into a typed config object.
export function loadConfig(): Omit<Config, 'walrusPackageId'> {
  const network = process.env.NETWORK as Network;
  if (!network || !['testnet', 'mainnet'].includes(network)) {
    throw new Error('NETWORK must be "testnet" or "mainnet"');
  }

  return {
    network,
    grpcUrl: GRPC_URLS[network],
    publisherSuiAddress: process.env.WALRUS_PUBLISHER_SUI_ADDRESS || undefined,
    port: parseInt(process.env.PORT || '3001', 10),
  };
}
