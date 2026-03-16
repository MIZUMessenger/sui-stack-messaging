// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SealClient, SealClientOptions, SealCompatibleClient } from '@mysten/seal';
import { SessionKey } from '@mysten/seal';
import {
	createMessagingGroupsClient as createClient,
	type RelayerConfig,
	type RelayerTransport,
	type SealPolicy,
} from '@mysten/messaging-groups';
import type { SuiClientTypes } from '@mysten/sui/client';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

import { createMockSealClient } from './seal-mock/index.js';
import { createSuiClient, type SuiTransport } from './create-sui-client.js';

/** No-op transport for integration tests that only exercise on-chain operations. */
const noopTransport: RelayerTransport = {
	sendMessage: () => {
		throw new Error('noopTransport: sendMessage not implemented');
	},
	fetchMessages: () => {
		throw new Error('noopTransport: fetchMessages not implemented');
	},
	fetchMessage: () => {
		throw new Error('noopTransport: fetchMessage not implemented');
	},
	updateMessage: () => {
		throw new Error('noopTransport: updateMessage not implemented');
	},
	deleteMessage: () => {
		throw new Error('noopTransport: deleteMessage not implemented');
	},
	subscribe: () => {
		throw new Error('noopTransport: subscribe not implemented');
	},
	disconnect: () => {},
};

export interface CreateMessagingGroupsClientOptions<TApproveContext = void> {
	url: string;
	network: SuiClientTypes.Network;
	transport?: SuiTransport;
	permissionedGroupsPackageId: string;
	messagingPackageId: string;
	namespaceId: string;
	versionId: string;
	keypair: Ed25519Keypair;
	sealPolicy?: SealPolicy<TApproveContext>;
	/**
	 * Relayer configuration. When provided, the client uses a real relayer transport
	 * (e.g. HTTPRelayerTransport for E2E tests). When omitted, a noop transport is used
	 * (suitable for integration tests that only exercise on-chain operations).
	 */
	relayer?: RelayerConfig;
	/**
	 * Seal configuration override. When provided, uses a real SealClient
	 * (e.g. for testnet E2E with real key servers). When omitted, a mock SealClient is used
	 * (suitable for localnet tests).
	 */
	seal?: SealClient | Omit<SealClientOptions, 'suiClient'>;
}

/**
 * Creates a fully extended Sui client with `permissionedGroups`, `seal`,
 * and `messagingGroups` extensions.
 *
 * By default uses a mock SealClient and noop relayer transport (suitable for
 * integration tests that only exercise on-chain operations). Pass `seal` and/or
 * `relayer` options to use real implementations (e.g. for E2E tests with a real
 * relayer and testnet key servers).
 */
export function createMessagingGroupsClient<TApproveContext = void>(
	options: CreateMessagingGroupsClientOptions<TApproveContext>,
) {
	const {
		url,
		network,
		transport,
		permissionedGroupsPackageId,
		messagingPackageId,
		namespaceId,
		versionId,
		keypair,
		sealPolicy,
		relayer,
		seal,
	} = options;

	const baseClient = createSuiClient({
		url,
		network,
		transport,
		mvr: {
			overrides: {
				packages: {
					'@local-pkg/permissioned-groups': permissionedGroupsPackageId,
					'@local-pkg/messaging': messagingPackageId,
				},
			},
		},
	});

	// When a real SealClient/config is provided (testnet), use `{ signer }` so the SDK
	// creates a proper SessionKey with a real personal message signature.
	// For localnet (mock seal), use the fake SessionKey.import() shortcut.
	const sessionKey = seal
		? { signer: keypair }
		: {
				getSessionKey: () =>
					SessionKey.import(
						{
							address: keypair.getPublicKey().toSuiAddress(),
							packageId: messagingPackageId,
							creationTimeMs: Date.now(),
							ttlMin: 30,
							sessionKey: keypair.getSecretKey(),
						},
						{} as SealCompatibleClient,
					),
			};

	return createClient<TApproveContext>(baseClient, {
		seal: seal ?? createMockSealClient({ suiClient: baseClient, packageId: messagingPackageId }),
		encryption: {
			sessionKey,
			sealPolicy,
		},
		relayer: relayer ?? { transport: noopTransport },
		packageConfig: {
			messaging: {
				originalPackageId: messagingPackageId,
				latestPackageId: messagingPackageId,
				namespaceId,
				versionId,
			},
			permissionedGroups: {
				originalPackageId: permissionedGroupsPackageId,
				latestPackageId: permissionedGroupsPackageId,
			},
		},
	});
}

/** Convenience type for the return value of `createMessagingGroupsClient` with default (void) approve context. */
export type MessagingGroupsTestClient = ReturnType<typeof createMessagingGroupsClient<void>>;
