import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  useCurrentAccount,
  useSignPersonalMessage,
  useSuiClient,
} from '@mysten/dapp-kit';
import { createMessagingGroupsClient, WalrusHttpStorageAdapter } from '@mysten/messaging-groups';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { DappKitSigner } from '../lib/dapp-kit-signer';

// Infer the client type from the factory return
type MessagingClient = ReturnType<typeof createMessagingGroupsClient>;

interface MessagingClientContextValue {
  client: MessagingClient | null;
  graphqlClient: SuiGraphQLClient;
}

const MessagingClientContext = createContext<MessagingClientContextValue | null>(
  null,
);

// --- Environment config ---
const RELAYER_URL =
  import.meta.env.VITE_RELAYER_URL || 'http://localhost:3000';
const GRAPHQL_URL =
  import.meta.env.VITE_SUI_GRAPHQL_URL ||
  'https://sui-testnet.mystenlabs.com/graphql';

// Walrus storage (for file attachments)
const WALRUS_PUBLISHER_URL =
  import.meta.env.VITE_WALRUS_PUBLISHER_URL || '';
const WALRUS_AGGREGATOR_URL =
  import.meta.env.VITE_WALRUS_AGGREGATOR_URL || '';
const WALRUS_EPOCHS = Number(import.meta.env.VITE_WALRUS_EPOCHS) || 1;

// Package config overrides (optional — auto-detected from network if not set)
function parsePackageConfig() {
  const originalPackageId = import.meta.env.VITE_MESSAGING_ORIGINAL_PACKAGE_ID;
  if (!originalPackageId) return undefined;
  return {
    messaging: {
      originalPackageId,
      latestPackageId: import.meta.env.VITE_MESSAGING_LATEST_PACKAGE_ID || originalPackageId,
      namespaceId: import.meta.env.VITE_MESSAGING_NAMESPACE_ID || '',
      versionId: import.meta.env.VITE_MESSAGING_VERSION_ID || '',
    },
  };
}

// Seal key server object IDs (comma-separated in env)
function parseSealServerConfigs(): { objectId: string; weight: number }[] {
  const ids = import.meta.env.VITE_SEAL_KEY_SERVER_OBJECT_IDS;
  if (!ids) return [];
  return ids.split(',').map((id: string) => ({
    objectId: id.trim(),
    weight: 1,
  }));
}

// Singleton GraphQL client (does not depend on wallet)
const graphqlClient = new SuiGraphQLClient({ url: GRAPHQL_URL, network: 'testnet' });

export function MessagingClientProvider({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  // Stabilize signPersonalMessage so it doesn't cause client recreation on every render
  const signRef = useRef(signPersonalMessage);
  useEffect(() => {
    signRef.current = signPersonalMessage;
  }, [signPersonalMessage]);

  const client = useMemo(() => {
    if (!account) return null;

    const signer = new DappKitSigner({
      address: account.address,
      publicKeyBytes: account.publicKey
        ? new Uint8Array(account.publicKey)
        : undefined,
      signPersonalMessage: (args) =>
        signRef.current({ message: args.message }),
    });

    const sealServerConfigs = parseSealServerConfigs();

    // Build optional attachments config when Walrus URLs are provided
    const attachments =
      WALRUS_PUBLISHER_URL && WALRUS_AGGREGATOR_URL
        ? {
            storageAdapter: new WalrusHttpStorageAdapter({
              publisherUrl: WALRUS_PUBLISHER_URL,
              aggregatorUrl: WALRUS_AGGREGATOR_URL,
              epochs: WALRUS_EPOCHS,
              fetch: (...args) => fetch(...args),
            }),
            maxFileSizeBytes: 5 * 1024 * 1024, // 5 MB per file
            maxAttachments: 10,
          }
        : undefined;

    return createMessagingGroupsClient(suiClient, {
      seal: {
        serverConfigs: sealServerConfigs,
      },
      encryption: {
        sessionKey: {
          address: account.address,
          onSign: async (message: Uint8Array) => {
            const { signature } = await signRef.current({ message });
            return signature;
          },
        },
      },
      packageConfig: parsePackageConfig(),
      relayer: {
        relayerUrl: RELAYER_URL,
        signer,
        fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
      },
      attachments,
    });
  }, [account, suiClient]);

  const value = useMemo(
    () => ({ client, graphqlClient }),
    [client],
  );

  return (
    <MessagingClientContext.Provider value={value}>
      {children}
    </MessagingClientContext.Provider>
  );
}

/**
 * Access the SDK client. Returns null when wallet is disconnected.
 * Use `useRequiredMessagingClient()` when you know the wallet must be connected.
 */
export function useMessagingClient(): MessagingClient | null {
  const ctx = useContext(MessagingClientContext);
  if (!ctx) {
    throw new Error(
      'useMessagingClient must be used within <MessagingClientProvider>',
    );
  }
  return ctx.client;
}

/** Access the SDK client, throwing if wallet is disconnected. */
export function useRequiredMessagingClient(): MessagingClient {
  const client = useMessagingClient();
  if (!client) {
    throw new Error('Wallet must be connected to use messaging client');
  }
  return client;
}

/** Access the Sui GraphQL client for group discovery queries. */
export function useGraphQLClient(): SuiGraphQLClient {
  const ctx = useContext(MessagingClientContext);
  if (!ctx) {
    throw new Error(
      'useGraphQLClient must be used within <MessagingClientProvider>',
    );
  }
  return ctx.graphqlClient;
}
