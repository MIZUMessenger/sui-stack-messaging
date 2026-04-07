# Installation

## Contents

- [Install from npm](#install-from-npm)
- [Peer Dependency Versions](#peer-dependency-versions)
- [Requirements](#requirements)
- [Build from Source](#build-from-source)
- [Smart Contracts](#smart-contracts)
- [Relayer](#relayer)

**Documentation:** [Home](../../README.md) | [Setup](./Setup.md) | [Examples](./Examples.md) | [API Reference](./APIRef.md) | [Encryption](./Encryption.md) | [Security](./Security.md) | [Relayer](./Relayer.md) | [Attachments](./Attachments.md) | [Archive & Recovery](./ArchiveRecovery.md) | [Group Discovery](./GroupDiscovery.md) | [Extending](./Extending.md) | [Testing](./Testing.md) | [Community Contributed Tools](./CommunityContributed.md)

---

## Install from npm

```bash
pnpm add @mysten/sui-stack-messaging @mysten/sui-groups @mysten/seal @mysten/sui @mysten/bcs
```

The last four are peer dependencies. If your project already depends on them (most Sui dApps do), you only need:

```bash
pnpm add @mysten/sui-stack-messaging @mysten/sui-groups
```

### Peer Dependency Versions

| Package | Minimum version |
| --- | --- |
| `@mysten/sui-groups` | \* |
| `@mysten/seal` | ^1.1.0 |
| `@mysten/sui` | ^2.6.0 |
| `@mysten/bcs` | ^2.0.2 |

## Requirements

- Node.js >= 22
- pnpm >= 10.17.0

## Build from Source

```bash
git clone https://github.com/MystenLabs/sui-stack-messaging.git
cd sui-stack-messaging/ts-sdks
pnpm install
pnpm build
```

## Smart Contracts

The messaging Move package is pre-deployed on **testnet and on mainnet**. The SDK auto-detects the correct package IDs based on the client's network.

For localnet or custom deployments, you must deploy both the `sui_groups` and `sui_stack_messaging` packages (`sui_stack_messaging` depends on `sui_groups`). Refer to the [Sui Groups Installation guide](https://github.com/MystenLabs/sui-groups) for deploying the base package first, then deploy the messaging package on top.

Provide a `packageConfig` when instantiating the client to point at your custom deployment. See [Setup](./Setup.md) for details.

## Relayer

The SDK communicates with an off-chain relayer for message storage and delivery. See [Relayer](./Relayer.md) for integration details and the [relayer README](../../relayer/README.md) for running the reference implementation.
