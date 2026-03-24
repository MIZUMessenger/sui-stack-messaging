// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SealClient, SealClientOptions } from '@mysten/seal';
import type { SuiClientTypes } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { messagingPermissionTypes } from '@mysten/sui-stack-messaging';
import {
	createSuiStackMessagingClient,
	createFundedAccount,
	type SuiStackMessagingTestClient,
	type AccountFunding,
} from '../../helpers/index.js';

export interface GroupSetupConfig {
	suiClientUrl: string;
	/** Network to use. Default: 'localnet'. */
	network?: SuiClientTypes.Network;
	permissionedGroupsPackageId: string;
	messagingPackageId: string;
	namespaceId: string;
	versionId: string;
	/** Faucet URL for funding accounts (localnet). When omitted, funds via admin wallet transfer. */
	faucetUrl?: string;
	adminKeypair: Ed25519Keypair;
	/** Relayer URL. When provided, clients are created with real HTTP transport. */
	relayerUrl?: string;
	/**
	 * Seal configuration override. When provided, uses a real SealClient
	 * (e.g. for testnet with real key servers). When omitted, a mock SealClient is used.
	 */
	seal?: SealClient | Omit<SealClientOptions, 'suiClient'>;
	/** How long to wait for the relayer to sync on-chain events (ms). Default: 12000 */
	relayerSyncDelayMs?: number;
}

export interface GroupUser {
	keypair: Ed25519Keypair;
	client: SuiStackMessagingTestClient;
}

export interface GroupSetupResult {
	/** UUID used to create the group. Use as `groupRef: { uuid }` with the SDK client. */
	uuid: string;
	/** Derived on-chain group ID. */
	groupId: string;
	admin: GroupUser;
	member: GroupUser;
	nonMember: GroupUser;
}

/**
 * Creates a new on-chain messaging group, grants full permissions to a member keypair,
 * and waits for the relayer to sync.
 *
 * Supports both localnet (mock seal, testcontainers) and testnet (real seal, real infra)
 * via the `network`, `seal`, and `relayerUrl` options.
 */
export async function setupTestGroup(config: GroupSetupConfig): Promise<GroupSetupResult> {
	const network = config.network ?? 'localnet';

	function buildClient(keypair: Ed25519Keypair) {
		return createSuiStackMessagingClient({
			url: config.suiClientUrl,
			network,
			permissionedGroupsPackageId: config.permissionedGroupsPackageId,
			messagingPackageId: config.messagingPackageId,
			namespaceId: config.namespaceId,
			versionId: config.versionId,
			keypair,
			relayer: config.relayerUrl ? { relayerUrl: config.relayerUrl } : undefined,
			seal: config.seal,
		});
	}

	const adminClient = buildClient(config.adminKeypair);

	// Create the messaging group
	const uuid = crypto.randomUUID();
	await adminClient.messaging.createAndShareGroup({
		signer: config.adminKeypair,
		uuid,
		name: 'E2E Test Group',
	});

	const groupId = adminClient.messaging.derive.groupId({ uuid });

	// Fund a member and grant all messaging permissions
	const funding: AccountFunding = config.faucetUrl
		? { faucetUrl: config.faucetUrl }
		: { client: adminClient, signer: config.adminKeypair };
	const member = await createFundedAccount(funding);
	const memberKeypair = member.keypair;

	const messagingPerms = messagingPermissionTypes(config.messagingPackageId);
	await adminClient.groups.grantPermissions({
		signer: config.adminKeypair,
		groupId,
		member: member.address,
		permissionTypes: Object.values(messagingPerms),
	});

	// Create a non-member keypair (not funded, not granted permissions)
	const nonMemberKeypair = new Ed25519Keypair();

	// Wait for the relayer to pick up on-chain events
	const syncDelay = config.relayerSyncDelayMs ?? 12_000;
	console.log(`Waiting ${syncDelay / 1000}s for relayer to sync on-chain permissions...`);
	await new Promise((resolve) => setTimeout(resolve, syncDelay));

	return {
		uuid,
		groupId,
		admin: { keypair: config.adminKeypair, client: adminClient },
		member: { keypair: memberKeypair, client: buildClient(memberKeypair) },
		nonMember: { keypair: nonMemberKeypair, client: buildClient(nonMemberKeypair) },
	};
}
