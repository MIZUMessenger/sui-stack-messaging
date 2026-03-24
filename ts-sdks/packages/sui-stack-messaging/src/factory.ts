// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SealClient, type SealClientOptions } from '@mysten/seal';
import { suiGroups, type SuiGroupsPackageConfig } from '@mysten/sui-groups';
import type { ClientWithCoreApi } from '@mysten/sui/client';

import { suiStackMessaging } from './client.js';
import {
	TESTNET_SUI_STACK_MESSAGING_PACKAGE_CONFIG,
	MAINNET_SUI_STACK_MESSAGING_PACKAGE_CONFIG,
	type SuinsConfig,
} from './constants.js';
import { SuiStackMessagingClientError } from './error.js';
import type { AttachmentsConfig } from './attachments/types.js';
import type { RelayerConfig } from './relayer/types.js';
import type { RecoveryTransport } from './recovery/transport.js';
import type {
	SuiStackMessagingEncryptionOptions,
	SuiStackMessagingPackageConfig,
} from './types.js';

/**
 * Options for creating a fully-configured messaging groups client.
 *
 * For testnet/mainnet, package configs are auto-detected from the base client's network.
 * For localnet/custom deployments, explicit package configs must be provided.
 */
export interface CreateSuiStackMessagingClientOptions<TApproveContext = void> {
	/**
	 * Seal encryption layer. Either:
	 * - A pre-built `SealClient` instance (passed through as-is), or
	 * - Seal configuration options (sans `suiClient`, which is injected by the factory).
	 */
	seal: SealClient | Omit<SealClientOptions, 'suiClient'>;

	/** Encryption configuration (session key, crypto primitives, threshold, seal policy). */
	encryption: SuiStackMessagingEncryptionOptions<TApproveContext>;

	/**
	 * Custom package configs for localnet/devnet/custom deployments.
	 * When not provided, auto-detected from `baseClient.network` (testnet/mainnet only).
	 */
	packageConfig?: {
		/** Messaging groups package config. */
		messaging: SuiStackMessagingPackageConfig;
		/** Permissioned groups package config. Defaults to auto-detection for testnet/mainnet. */
		permissionedGroups?: SuiGroupsPackageConfig;
	};

	/** SuiNS config for reverse lookup operations (auto-detected for testnet/mainnet). */
	suinsConfig?: SuinsConfig;

	/** Relayer transport configuration. */
	relayer: RelayerConfig;

	/** Attachment support. When omitted, messages cannot include files. */
	attachments?: AttachmentsConfig;

	/** Optional recovery transport for fetching messages from an alternative storage backend. */
	recovery?: RecoveryTransport;
}

/**
 * Creates a fully-configured messaging groups client from an existing SuiClient.
 *
 * Internally composes the `suiGroups`, `seal`, and `suiStackMessaging`
 * extensions in the correct order. The returned client exposes:
 * - `client.messaging` — messaging-groups operations
 * - `client.groups` — permission management
 * - `client.seal` — Seal encryption/decryption
 * - `client.core` — base Sui RPC methods
 *
 * @example
 * ```ts
 * import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
 * import { createSuiStackMessagingClient } from '@mysten/sui-stack-messaging';
 *
 * const client = createSuiStackMessagingClient(
 *   new SuiJsonRpcClient({ url: 'https://...', network: 'testnet' }),
 *   {
 *     seal: {
 *       serverConfigs: [
 *         { objectId: '0x...', weight: 1 },
 *         { objectId: '0x...', weight: 1 },
 *       ],
 *     },
 *     encryption: {
 *       sessionKey: { signer: myKeypair },
 *     },
 *   },
 * );
 *
 * await client.messaging.createAndShareGroup({ signer, name: 'My Group' });
 * ```
 */
export function createSuiStackMessagingClient<TApproveContext = void>(
	baseClient: ClientWithCoreApi,
	options: CreateSuiStackMessagingClientOptions<TApproveContext>,
) {
	const witnessType = resolveWitnessType(baseClient, options);

	// Resolve seal: either pass through a pre-built SealClient or create one from config.
	// Done before $extend so the register callback has a concrete SealClient return type.
	const resolveSeal = (client: ClientWithCoreApi): SealClient =>
		isSealClient(options.seal)
			? options.seal
			: new SealClient({ ...options.seal, suiClient: client });

	// Two $extend calls: the first registers `groups` + `seal` (independent of each other),
	// the second registers `messaging` (which depends on both).
	return baseClient
		.$extend(
			suiGroups({
				witnessType,
				packageConfig: options.packageConfig?.permissionedGroups,
			}),
			{
				name: 'seal' as const,
				register: resolveSeal,
			},
		)
		.$extend(
			suiStackMessaging<TApproveContext>({
				packageConfig: options.packageConfig?.messaging,
				encryption: options.encryption,
				suinsConfig: options.suinsConfig,
				relayer: options.relayer,
				attachments: options.attachments,
				recovery: options.recovery,
			}),
		);
}

/** Duck-type check: a SealClient has an `encrypt` method, config options don't. */
function isSealClient(seal: SealClient | Omit<SealClientOptions, 'suiClient'>): seal is SealClient {
	return typeof (seal as SealClient).encrypt === 'function';
}

/**
 * Derives the `witnessType` for suiGroups from the messaging package's
 * original package ID. For testnet/mainnet, uses the built-in constants.
 */
function resolveWitnessType(
	baseClient: ClientWithCoreApi,
	options: CreateSuiStackMessagingClientOptions<unknown>,
): string {
	if (options.packageConfig?.messaging) {
		return `${options.packageConfig.messaging.originalPackageId}::messaging::Messaging`;
	}
	switch (baseClient.network) {
		case 'testnet':
			return `${TESTNET_SUI_STACK_MESSAGING_PACKAGE_CONFIG.originalPackageId}::messaging::Messaging`;
		case 'mainnet':
			return `${MAINNET_SUI_STACK_MESSAGING_PACKAGE_CONFIG.originalPackageId}::messaging::Messaging`;
		default:
			throw new SuiStackMessagingClientError(
				`Cannot derive witnessType for network "${baseClient.network}". ` +
					`Provide explicit packageConfig.messaging for localnet/devnet.`,
			);
	}
}
