# Recovery Transport — Reference Implementation

This is a **reference implementation** of a read-only recovery transport that uses the
[Discovery Indexer](https://github.com/MystenLabs/messaging-sdk-relayer/tree/main/walrus-discovery-indexer)
and the Walrus aggregator to recover messages when the message backend is unavailable.

## How It Works

The reference relayer persists every message to Walrus as quilt patches (batched blobs). When the
backend is unavailable, this transport recovers messages by:

1. **Querying the Discovery Indexer** for patch metadata (which blobs contain a group's messages)
2. **Filtering out DELETED patches** (no need to download deleted content)
3. **Grouping patches by blobId** for efficient batch reads from Walrus
4. **Downloading content from the Walrus aggregator** via the quilt patch API
5. **Converting** each message using the SDK's `fromWalrusMessage()` utility

## Usage

```ts
import { WalrusRecoveryTransport } from './walrus-recovery-transport.js';

const recovery = new WalrusRecoveryTransport({
	indexerUrl: 'http://localhost:3001',
	aggregatorUrl: 'https://aggregator.walrus-testnet.walrus.space',
});

const { messages, hasNext } = await recovery.recoverMessages({
	groupId: '0x...',
	limit: 50,
});
```

## Building Your Own Recovery Transport

The SDK provides everything you need to build a custom recovery transport with your own indexer.

### What the SDK exports

| Export                                                           | Purpose                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| `RecoveryTransport`                                              | Interface your transport must implement (1 method: `recoverMessages`) |
| `fromWalrusMessage()`                                            | Converts Walrus wire format → `RelayerMessage`                        |
| `WalrusMessageWire`                                              | Type for the raw Walrus JSON shape                                    |
| `WalrusAttachmentWire`                                           | Type for the raw Walrus attachment shape                              |
| `RecoverMessagesParams`, `FetchMessagesResult`, `RelayerMessage` | Shared param/result types                                             |
| `HttpClientConfig`                                               | Base config type (timeout, fetch override, onError)                   |
| `DEFAULT_HTTP_TIMEOUT`                                           | Standard timeout (30s)                                                |
| `HttpTimeoutError`                                               | Timeout error class                                                   |

### 1. Implement `RecoveryTransport`

```ts
import {
	fromWalrusMessage,
	type RecoveryTransport,
	type RecoverMessagesParams,
	type FetchMessagesResult,
	type WalrusMessageWire,
} from '@mysten/sui-stack-messaging';

class MyRecoveryTransport implements RecoveryTransport {
	async recoverMessages(params: RecoverMessagesParams): Promise<FetchMessagesResult> {
		// 1. Query YOUR indexer for message locations
		// 2. Download content from Walrus
		// 3. Convert using fromWalrusMessage()
		// 4. Return sorted by order
	}
}
```

### 2. Use `fromWalrusMessage()` to convert Walrus blobs

The reference relayer stores messages on Walrus as raw JSON (via `serde_json::to_vec()`). The SDK
exports a converter that handles the format differences:

```ts
import { fromWalrusMessage } from '@mysten/sui-stack-messaging';
import type { WalrusMessageWire, RelayerMessage } from '@mysten/sui-stack-messaging';

const rawJson = await readFromWalrus(blobId, patchId);
const wire: WalrusMessageWire = JSON.parse(rawJson);
const message: RelayerMessage = fromWalrusMessage(wire);
```

`fromWalrusMessage()` handles:

- `number[]` -> `Uint8Array` for encrypted_msg/nonce
- ISO 8601 -> unix seconds for timestamps
- Deriving `isEdited` / `isDeleted` from timestamps and sync_status
- Field name mapping (Rust naming -> SDK naming)

## Limitations

- **Read-only** — `RecoveryTransport` only supports `recoverMessages`
