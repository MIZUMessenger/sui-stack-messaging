import { createNetworkConfig } from '@mysten/dapp-kit';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const rpcUrl = import.meta.env.VITE_SUI_RPC_URL;

const { networkConfig, useNetworkVariable } = createNetworkConfig({
  testnet: {
    url: rpcUrl || getJsonRpcFullnodeUrl('testnet'),
    network: 'testnet',
  },
});

export { networkConfig, useNetworkVariable };
