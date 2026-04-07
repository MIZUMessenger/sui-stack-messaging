# Developer Setup

## Contents

- [Quick Setup with createMessagingGroupsClient](#quick-setup-with-createmessaginggroupsclient)
- [Manual Extension Chain (Advanced)](#manual-extension-chain-advanced)
- [Configuration Reference](#configuration-reference)
- [Sub-Modules](#sub-modules)
- [The GroupRef Pattern](#the-groupref-pattern)

**Documentation:** [Home](../../README.md) | [Installation](./Installation.md) | [Examples](./Examples.md) | [API Reference](./APIRef.md) | [Encryption](./Encryption.md) | [Security](./Security.md) | [Relayer](./Relayer.md) | [Attachments](./Attachments.md) | [Archive & Recovery](./ArchiveRecovery.md) | [Group Discovery](./GroupDiscovery.md) | [Extending](./Extending.md) | [Testing](./Testing.md) | [Community Contributed Tools](./CommunityContributed.md)

---

This SDK follows the [MystenLabs TS SDK building guidelines](https://sdk.mystenlabs.com/sui/sdk-building). It uses the **client extension pattern**: you extend a base Sui client with messaging, groups, and Seal extensions.

## Quick Setup with `createMessagingGroupsClient()`

This helper 'factory' function handles all three extensions automatically:

```typescript
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { createMessagingGroupsClient } from '@mysten/sui-stack-messaging';

const client = createMessagingGroupsClient(
  new SuiGrpcClient({
    baseUrl: 'https://fullnode.testnet.sui.io:443',
    network: 'testnet',
  }),
  {
    seal: {
      serverConfigs: [
        { objectId: '0x...', weight: 1 },
        { objectId: '0x...', weight: 1 },
      ],
    },
    encryption: {
      sessionKey: { signer: keypair },
    },
    relayer: {
      relayerUrl: 'https://your-relayer.example.com',
    },
  },
);
```

After creation, the client exposes four namespaces:

| Namespace          | Purpose                                                                        |
| ------------------ | ------------------------------------------------------------------------------ |
| `client.messaging` | E2EE messaging, group creation, key rotation                                   |
| `client.groups`    | Permission management ([Sui Groups docs](https://github.com/MystenLabs/sui-groups)) |
| `client.seal`      | Seal encryption/decryption (utilized by `messaging`)                           |
| `client.core`      | Base Sui RPC methods                                                           |

## Manual Extension Chain (Advanced)

For full control over each extension, use `$extend()` directly:

```typescript
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { SealClient } from '@mysten/seal';
import { suiGroups } from '@mysten/sui-groups';
import { suiStackMessaging } from '@mysten/sui-stack-messaging';

const base = new SuiGrpcClient({
  baseUrl: 'https://fullnode.testnet.sui.io:443',
  network: 'testnet',
});

// Step 1: extend with groups + seal (independent of each other)
const withGroupsAndSeal = base.$extend(
  suiGroups({
    witnessType: `${MESSAGING_PACKAGE_ID}::messaging::Messaging`,
  }),
  {
    name: 'seal' as const,
    register: (c) =>
      new SealClient({
        suiClient: c,
        serverConfigs: [
          { objectId: '0x...', weight: 1 },
          { objectId: '0x...', weight: 1 },
        ],
      }),
  },
);

// Step 2: extend with messaging (depends on both groups and seal)
const client = withGroupsAndSeal.$extend(
  suiStackMessaging({
    encryption: { sessionKey: { signer: keypair } },
    relayer: { relayerUrl: 'https://your-relayer.example.com' },
  }),
);
```

## Configuration Reference

### `encryption` (required)

Controls how the SDK obtains Seal session keys and encrypts/decrypts messages.

#### Session Key Tiers

**Tier 1: Signer-based** (recommended for dapp-kit-next, Keypair, Enoki):

```typescript
encryption: {
  sessionKey: { signer: keypair },
}
```

The SDK derives the address via `signer.toSuiAddress()`, creates a `SessionKey`, and handles certification automatically.

**Tier 2: Callback-based** (for current dapp-kit without Signer abstraction):

```typescript
encryption: {
  sessionKey: {
    address: '0x...',
    onSign: async (message: Uint8Array) => {
      // Sign with your wallet adapter and return the signature string
      return signPersonalMessage(message);
    },
  },
}
```

The SDK creates the session key, then calls `onSign()` with the personal message bytes.

**Tier 3: Manual** (full control over session key lifecycle):

```typescript
encryption: {
  sessionKey: {
    getSessionKey: () => myManagedSessionKey,
  },
}
```

#### Session Key Options (Tier 1 & 2)

| Option            | Default | Description                        |
| ----------------- | ------- | ---------------------------------- |
| `ttlMin`          | 10      | Session key TTL in minutes         |
| `refreshBufferMs` | 60000   | Refresh this many ms before expiry |
| `mvrName`         | (none)  | MVR name for Seal policy resolution |

#### Encryption Options

| Option             | Default             | Description                                                         |
| ------------------ | ------------------- | ------------------------------------------------------------------- |
| `sealThreshold`    | 2                   | Number of key servers needed for decryption                         |
| `cryptoPrimitives` | Web Crypto          | Custom AES-GCM implementation                                       |
| `sealPolicy`       | `DefaultSealPolicy` | Custom Seal access control policy (see [Extending](./Extending.md)) |

### `relayer` (required)

Either provide a URL for the built-in HTTP transport or a custom transport instance:

```typescript
// Built-in HTTP transport
relayer: {
  relayerUrl: 'https://your-relayer.example.com',
  pollingIntervalMs: 3000,  // default
  timeout: 30000,           // default
  onError: (err) => console.error(err),
}

// Custom transport
relayer: {
  transport: myCustomTransport,  // implements RelayerTransport
}
```

See [Relayer](./Relayer.md) for the `RelayerTransport` interface.

### `attachments` (optional)

Enable file attachment support by providing a storage adapter:

```typescript
import { WalrusHttpStorageAdapter } from '@mysten/sui-stack-messaging';

attachments: {
  storageAdapter: new WalrusHttpStorageAdapter({
    publisherUrl: 'https://publisher.walrus-testnet.walrus.space',
    aggregatorUrl: 'https://aggregator.walrus-testnet.walrus.space',
    epochs: 5,
  }),
  maxAttachments: 10,          // default
  maxFileSizeBytes: 10_485_760, // 10 MB default
  maxTotalFileSizeBytes: 52_428_800, // 50 MB default
}
```

When omitted, `sendMessage` cannot include files and received attachment metadata is not resolvable. See [Attachments](./Attachments.md).

### `packageConfig` (optional)

Auto-detected for testnet and mainnet. Required for localnet or custom deployments:

```typescript
packageConfig: {
  messaging: {
    originalPackageId: '0x...',  // First published package ID (type names, BCS, Seal)
    latestPackageId: '0x...',    // Current package ID (moveCall targets)
    namespaceId: '0x...',        // MessagingNamespace shared object
    versionId: '0x...',          // Version shared object
  },
  permissionedGroups: {          // optional, also auto-detected
    originalPackageId: '0x...',
    latestPackageId: '0x...',
  },
}
```

### `suinsConfig` (optional)

Auto-detected for testnet and mainnet. Only needed for SuiNS reverse lookup operations (`setSuinsReverseLookup`, `unsetSuinsReverseLookup`).

### `seal` (factory only)

When using `createMessagingGroupsClient`, pass either a pre-built `SealClient` or Seal config options:

```typescript
// Config options (SealClient created internally)
seal: {
  serverConfigs: [
    { objectId: '0x...', weight: 1 },
    { objectId: '0x...', weight: 1 },
  ],
}

// Pre-built SealClient
seal: existingSealClient,
```

## Sub-Modules

The `client.messaging` object exposes several sub-modules:

| Sub-module   | Purpose                                    | Example                                                   |
| ------------ | ------------------------------------------ | --------------------------------------------------------- |
| `call`       | PTB thunks: composable transaction steps   | `tx.add(client.messaging.call.createAndShareGroup(opts))` |
| `tx`         | Full transactions: ready to sign           | `client.messaging.tx.createAndShareGroup(opts)`           |
| `view`       | Read-only queries (no gas)                 | `client.messaging.view.groupsMetadata(opts)`              |
| `bcs`        | BCS type definitions for parsing           | `client.messaging.bcs.EncryptionHistory`                  |
| `derive`     | Deterministic address derivation           | `client.messaging.derive.groupId({ uuid })`               |
| `encryption` | Low-level encrypt/decrypt                  | `client.messaging.encryption.encrypt(opts)`               |
| `transport`  | Direct relayer access                      | `client.messaging.transport.fetchMessages(opts)`          |

### When to use which

- **Top-level imperative methods** (e.g., `client.messaging.sendMessage()`): simplest path, sign, encrypt, and send in one call.
- **`tx.*`**: when you need a `Transaction` object to inspect or modify before signing (e.g., with dapp-kit's `signAndExecuteTransaction`).
- **`call.*`**: when composing multiple operations into a single PTB.
- **`view.*`**: for read-only queries that don't require a signer.

## The `GroupRef` Pattern

Most messaging methods accept a `GroupRef`, either a UUID or explicit object IDs:

```typescript
// By UUID (simpler: derives both IDs internally)
await client.messaging.sendMessage({
  signer: keypair,
  groupRef: { uuid: 'my-group-uuid' },
  text: 'Hello!',
});

// By explicit IDs
await client.messaging.sendMessage({
  signer: keypair,
  groupRef: {
    groupId: '0x...',
    encryptionHistoryId: '0x...',
  },
  text: 'Hello!',
});
```

Using UUIDs is recommended. See [Group Discovery](./GroupDiscovery.md) for details on UUID derivation and tracking.
