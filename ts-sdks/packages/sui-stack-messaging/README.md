# @mysten/sui-stack-messaging

TypeScript SDK for encrypted group messaging on Sui, powered by
[Seal](https://github.com/AgiMaulana/seal) for end-to-end encryption.

## Installation

```bash
npm install @mysten/sui-stack-messaging
```

## Architecture

The SDK is **transport-agnostic**. It handles encryption, decryption, key management, and on-chain
group operations — but delegates message delivery and storage to a pluggable `RelayerTransport`
interface. You can implement this interface to connect to any backend (HTTP server, WebSocket,
peer-to-peer, etc.).

We provide two **reference implementations**:

- **`HTTPRelayerTransport`** — Built-in transport that works with the
  [reference relayer](https://github.com/MystenLabs/messaging-sdk-relayer). Ships with the SDK.
- **`WalrusRecoveryTransport`** — Read-only recovery adapter that fetches messages from Walrus
  storage via the
  [Discovery Indexer](https://github.com/MystenLabs/messaging-sdk-relayer/tree/main/walrus-discovery-indexer).
  Implements `RecoveryTransport`. See
  [`examples/recovery-transport/`](./examples/recovery-transport/).

Neither is required — you can build your own transport from scratch.

## Quick Start

### With the reference relayer (built-in HTTP transport)

```ts
import { suiStackMessaging } from '@mysten/sui-stack-messaging';

const client = suiStackMessaging({
	relayerUrl: 'https://relayer.example.com',
	signer: keypair,
	sealClient,
	suiClient,
	packageId: '0x...',
});

await client.sendMessage({
	groupRef: { groupId: '0x...' },
	text: 'Hello, group!',
});

const { messages } = await client.getMessages({
	groupRef: { groupId: '0x...' },
});
```

### With a custom transport

```ts
import { suiStackMessaging } from '@mysten/sui-stack-messaging';
import type { RelayerTransport } from '@mysten/sui-stack-messaging';

class MyTransport implements RelayerTransport {
	// Implement sendMessage, fetchMessages, subscribe, etc.
	// Connect to whatever backend you want.
}

const client = suiStackMessaging({
	transport: new MyTransport(),
	sealClient,
	suiClient,
	packageId: '0x...',
});
```

## Recovery from Walrus

If your message backend persists messages to [Walrus](https://docs.walrus.site/) (as the reference
relayer does), the SDK provides utilities to read them back directly — useful when the backend is
unavailable and you need to restore conversation history.

### SDK Utilities

- **`fromWalrusMessage(wire)`** — Converts a raw Walrus message (the `serde_json` wire format used
  by the reference relayer) to the SDK's `RelayerMessage` format. Handles `number[]` to
  `Uint8Array`, ISO 8601 to unix timestamps, field name mapping, and deriving
  `isEdited`/`isDeleted`.

- **`WalrusMessageWire`** — TypeScript type for the raw JSON shape stored on Walrus.

```ts
import { fromWalrusMessage } from '@mysten/sui-stack-messaging';
import type { WalrusMessageWire, RelayerMessage } from '@mysten/sui-stack-messaging';

// Read a message blob/patch from Walrus (via aggregator, SDK, etc.)
const rawJson = await fetchFromWalrus(blobId, patchId);
const wire: WalrusMessageWire = JSON.parse(rawJson);

// Convert to the SDK's standard format — ready for decryption
const message: RelayerMessage = fromWalrusMessage(wire);
```

### Building a Recovery Transport

To restore full conversation history from Walrus, implement `RecoveryTransport` (1 method:
`recoverMessages`) that:

1. Queries an indexer for which Walrus blobs contain a group's messages
2. Downloads message content from the Walrus aggregator
3. Converts each message using `fromWalrusMessage()`
4. Returns them sorted by order

See [`examples/recovery-transport/`](./examples/recovery-transport/) for a complete reference
implementation using the
[Discovery Indexer](https://github.com/MystenLabs/messaging-sdk-relayer/tree/main/walrus-discovery-indexer).

## API Reference

### Client Methods

| Method                | Description                                 |
| --------------------- | ------------------------------------------- |
| `sendMessage()`       | Encrypt and send a message to a group       |
| `getMessages()`       | Fetch and decrypt messages for a group      |
| `getMessage()`        | Fetch and decrypt a single message          |
| `updateMessage()`     | Re-encrypt and update an existing message   |
| `deleteMessage()`     | Soft-delete a message                       |
| `subscribeMessages()` | Subscribe to real-time messages (decrypted) |

### Transport Interface (`RelayerTransport`)

| Method            | Description                              |
| ----------------- | ---------------------------------------- |
| `sendMessage()`   | Send an encrypted message to the backend |
| `fetchMessages()` | Fetch paginated messages for a group     |
| `fetchMessage()`  | Fetch a single message by ID             |
| `updateMessage()` | Update message content                   |
| `deleteMessage()` | Soft-delete a message                    |
| `subscribe()`     | Stream real-time messages                |
| `disconnect()`    | Clean up transport resources             |

### Recovery Exports

| Export                 | Description                                                             |
| ---------------------- | ----------------------------------------------------------------------- |
| `RecoveryTransport`    | Read-only interface for recovery adapters (1 method: `recoverMessages`) |
| `fromWalrusMessage()`  | Convert Walrus wire format to `RelayerMessage`                          |
| `WalrusMessageWire`    | Type for the raw Walrus JSON shape                                      |
| `WalrusAttachmentWire` | Type for the raw Walrus attachment shape                                |

## License

Apache-2.0
