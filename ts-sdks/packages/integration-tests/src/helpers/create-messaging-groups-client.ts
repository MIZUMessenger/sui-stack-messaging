// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SealCompatibleClient } from '@mysten/seal';
import { SessionKey } from '@mysten/seal';
import { permissionedGroups } from '@mysten/permissioned-groups';
import { messagingGroups, type SealPolicy } from '@mysten/messaging-groups';
import type { ClientWithCoreApi, SuiClientTypes } from '@mysten/sui/client';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

import { createMockSealClient } from '../seal-mock/index.js';
import { createSuiClient, type SuiTransport } from './create-sui-client.js';

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
}

/**
 * Creates a fully extended Sui client with `permissionedGroups`, mock `seal`,
 * and `messagingGroups` extensions.
 *
 * Transport-agnostic: uses `SUI_TRANSPORT` env var or explicit `transport` option
 * to choose between JSON-RPC and gRPC.
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
	} = options;

	const witnessType = `${messagingPackageId}::messaging::Messaging`;

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

	return baseClient
		.$extend(
			permissionedGroups({
				packageConfig: {
					originalPackageId: permissionedGroupsPackageId,
					latestPackageId: permissionedGroupsPackageId,
				},
				witnessType,
			}),
			{
				name: 'seal' as const,
				register: (client: ClientWithCoreApi) =>
					createMockSealClient({ suiClient: client, packageId: messagingPackageId }),
			},
		)
		.$extend(
			messagingGroups<TApproveContext>({
				packageConfig: {
					originalPackageId: messagingPackageId,
					latestPackageId: messagingPackageId,
					namespaceId,
					versionId,
				},
				encryption: {
					sessionKey: {
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
					},
					sealPolicy,
				},
			}),
		);
}

/** Convenience type for the return value of `createMessagingGroupsClient` with default (void) approve context. */
export type MessagingGroupsTestClient = ReturnType<typeof createMessagingGroupsClient<void>>;
