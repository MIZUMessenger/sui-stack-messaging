import type { EnokiNetwork } from '@mysten/enoki';

type EnabledEnokiConfig = {
  enabled: true;
  apiKey: string;
  googleClientId: string;
  redirectUrl: string;
  rpcUrl: string;
  network: EnokiNetwork;
};

type DisabledEnokiConfig = {
  enabled: false;
  reason: string;
};

export type EnokiConfig = EnabledEnokiConfig | DisabledEnokiConfig;

function readEnv(name: string): string {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function getNetwork(): EnokiNetwork {
  const configuredNetwork = readEnv('VITE_SUI_NETWORK');
  if (
    configuredNetwork === 'mainnet' ||
    configuredNetwork === 'testnet' ||
    configuredNetwork === 'devnet'
  ) {
    return configuredNetwork;
  }
  return 'testnet';
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function getEnokiConfig(): EnokiConfig {
  const apiKey = readEnv('VITE_ENOKI_PUBLIC_KEY');
  const googleClientId = readEnv('VITE_ENOKI_GOOGLE_CLIENT_ID');
  const redirectUrl = readEnv('VITE_ENOKI_REDIRECT_URL');
  const rpcUrl = readEnv('VITE_SUI_RPC_URL');

  if (!apiKey || !googleClientId || !redirectUrl || !rpcUrl) {
    return {
      enabled: false,
      reason:
        'Missing one or more Enoki env vars: VITE_ENOKI_PUBLIC_KEY, VITE_ENOKI_GOOGLE_CLIENT_ID, VITE_ENOKI_REDIRECT_URL, VITE_SUI_RPC_URL.',
    };
  }

  if (!isValidUrl(redirectUrl)) {
    return {
      enabled: false,
      reason: 'VITE_ENOKI_REDIRECT_URL is not a valid URL.',
    };
  }

  if (!isValidUrl(rpcUrl)) {
    return {
      enabled: false,
      reason: 'VITE_SUI_RPC_URL is not a valid URL.',
    };
  }

  const network = getNetwork();

  return {
    enabled: true,
    apiKey,
    googleClientId,
    redirectUrl,
    rpcUrl,
    network,
  };
}
