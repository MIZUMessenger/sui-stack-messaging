import { useEffect } from 'react';
import { registerEnokiWallets } from '@mysten/enoki';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { getEnokiConfig } from '../../lib/enoki-config';

let hasRegisteredEnokiWallets = false;

export function RegisterEnokiWallets() {
  useEffect(() => {
    if (hasRegisteredEnokiWallets) return;

    const config = getEnokiConfig();
    if (!config.enabled) {
      console.info(`[enoki] Skip registration: ${config.reason}`);
      return;
    }

    registerEnokiWallets({
      apiKey: config.apiKey,
      client: new SuiGrpcClient({ baseUrl: config.rpcUrl, network: config.network }),
      network: config.network,
      providers: {
        google: {
          clientId: config.googleClientId,
          redirectUrl: config.redirectUrl,
        },
      },
    });

    hasRegisteredEnokiWallets = true;
  }, []);

  return null;
}
