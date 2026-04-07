# Archive & Recovery

## Table of Contents

- [How Archival Works](#how-archival-works)
  - [Batching](#batching)
  - [Tagging](#tagging)
  - [Sync Status Lifecycle](#sync-status-lifecycle)
- [How Discovery Works](#how-discovery-works)
- [How Recovery Works](#how-recovery-works)
  - [Reference Implementation](#reference-implementation)
  - [Wiring It Up](#wiring-it-up)
- [Current Limitations](#current-limitations)

**Documentation:** [Home](../../README.md) | [Installation](./Installation.md) | [Setup](./Setup.md) | [API Reference](./APIRef.md) | [Examples](./Examples.md) | [Encryption](./Encryption.md) | [Security](./Security.md) | [Relayer](./Relayer.md) | [Attachments](./Attachments.md) | [Group Discovery](./GroupDiscovery.md) | [Extending](./Extending.md) | [Testing](./Testing.md) | [Community Contributed Tools](./CommunityContributed.md)

---

Messages in the Messaging SDK flow through an off-chain relayer for real-time delivery. To provide durability and cross-device access without requiring centralized backups, the relayer archives messages to [Walrus](https://www.walrus.xyz/) and we provide a discovery indexer that allows clients to recover them.

Message history is typically fetched from the relayer for real-time use and recovered from Walrus only when rebuilding state or restoring devices.

This page describes the archive and recovery pipeline, the reference implementations, and their current limitations.

## How Archival Works

The relayer's `WalrusSyncService` runs in the background and periodically uploads pending messages to Walrus. Sync is triggered by either:
- A **timer** (default: every hour, configurable via `WALRUS_SYNC_INTERVAL_SECS`)
- A **message count threshold** (default: 50 new messages, configurable via `WALRUS_SYNC_MESSAGE_THRESHOLD`)

Whichever fires first triggers a sync cycle.

### Batching

Messages are grouped into Walrus **quilts** (a quilt is a collection of named patches stored as a single blob). Each message becomes a patch named `msg-{messageId}`. Messages from different groups can be batched into the same quilt.

Batch size is configurable via `WALRUS_SYNC_BATCH_SIZE` (default: 100, hard-capped at 666 by the Walrus quilt limit). Each sync cycle queries the storage backend for messages with a pending sync status and uploads up to `WALRUS_SYNC_BATCH_SIZE` of them. If more messages are pending than the batch size, the remaining messages stay in their pending state and will be picked up by the next sync cycle. Multiple consecutive cycles will run until all pending messages are drained. This means that under high message volume, the effective archival throughput is `batch_size / sync_interval`.

### Tagging

Each patch carries metadata tags in the quilt index:

| Tag | Value | Purpose |
|-----|-------|---------|
| `source` | `"sui-messaging-relayer"` | Identifies patches from the messaging relayer |
| `group_id` | Group object ID | Allows filtering by group |
| `sender` | Sender's Sui address | Allows filtering by sender |
| `order` | Message order number | Preserves ordering |
| `sync_status` | Status string | Indicates message state |

These tags are readable from the quilt index without downloading patch content, which enables efficient discovery.

### Sync Status Lifecycle

Every message tracks its archival state:

```
New message   --> SYNC_PENDING   --> SYNCED
Edited        --> UPDATE_PENDING --> UPDATED
Deleted       --> DELETE_PENDING --> DELETED
```

Edited messages are re-uploaded as new patches. Deleted messages are uploaded as tombstone records so that recovering clients know the message was intentionally removed.

## How Discovery Works

The **walrus-discovery-indexer** is a reference service that watches Sui checkpoints for `BlobCertified` events from Walrus, inspects the blobs for messaging patches (by checking the `source: "sui-messaging-relayer"` tag), and stores the results in a queryable index.

It serves a REST API:

| Endpoint | Description |
|----------|-------------|
| `GET /v1/groups/:groupId/patches` | Message patches for a group (paginated) |
| `GET /v1/patches` | All discovered patches across groups |
| `GET /health` | Health check with last processed checkpoint |

Patch metadata (group ID, sender, order, sync status, blob ID) is extracted from quilt index tags without downloading the actual encrypted message content.

See the [walrus-discovery-indexer README](../../walrus-discovery-indexer/README.md) for deployment and configuration.

## How Recovery Works

The SDK provides a `RecoveryTransport` interface for fetching messages from an alternative backend:

```typescript
interface RecoveryTransport {
  recoverMessages(params: RecoverMessagesParams): Promise<FetchMessagesResult>;
}
```

When configured, the client exposes a `recoverMessages()` method:

```typescript
const result = await client.messaging.recoverMessages({
  groupRef: { uuid: 'my-group' },
  limit: 50,
});
```

Recovered messages go through the same decryption and sender verification pipeline as real-time messages. Messages that fail decryption are silently dropped.

See [Extending](./Extending.md) for implementing a custom `RecoveryTransport`.

### Reference Implementation

A reference `WalrusRecoveryTransport` is provided in [examples/recovery-transport/](../../ts-sdks/packages/sui-stack-messaging/examples/recovery-transport/). It:

1. Queries the walrus-discovery-indexer for patches belonging to the group
2. Fetches patch content from the Walrus aggregator
3. Converts the Walrus wire format to SDK `RelayerMessage` objects
4. Returns them sorted by order for the SDK to decrypt and verify

### Wiring It Up

```typescript
const client = createMessagingGroupsClient(baseClient, {
  encryption: { sessionKey: { signer: keypair } },
  relayer: { relayerUrl: 'https://your-relayer.example.com' },
  recovery: myWalrusRecoveryTransport,
});

// Real-time messages (from relayer)
const messages = await client.messaging.getMessages({ ... });

// Recovered messages (from Walrus)
const recovered = await client.messaging.recoverMessages({ ... });
```

## Current Limitations

Both the relayer and the discovery indexer are reference implementations. Keep these limitations in mind when building for production:

**In-memory storage on the relayer.** The default relayer storage backend holds everything in memory. Messages created between sync cycles are lost on restart. For production, implement a persistent storage backend (e.g., PostgreSQL) against the relayer's `StorageAdapter` trait, or accept that Walrus serves as the durable store with a sync-window gap.

**In-memory storage on the indexer.** The walrus-discovery-indexer also uses in-memory storage by default. On restart, it re-processes checkpoints but may miss blobs from before its start. Implement a persistent `DiscoveryStore` for production.

**Recovery ordering is best-effort.** The relayer assigns monotonically increasing `order` values per group. Recovery preserves this ordering within a single relayer's output. However, if multiple relayers archive to Walrus independently, their `order` values are assigned independently and do not align. In multi-relayer recovery, sort by `created_at` timestamp for best-effort chronological order.

**Sender verification on recovery.** Recovered messages carry `signature` and `publicKey` fields, and the SDK verifies them during decryption (populating `senderVerified` on each message). Applications should check this field, especially for recovered messages, since Walrus storage is open and anyone can store quilts with the relayer's tagging convention.

**Optional publisher filter.** The indexer supports a `WALRUS_PUBLISHER_SUI_ADDRESS` filter to only process blobs from a specific sender. This reduces noise but cannot be used when you want cross-relayer discovery. Without the filter, tag-based inspection is the sole mechanism for identifying messaging blobs.

---

[Back to table of contents](#table-of-contents)
