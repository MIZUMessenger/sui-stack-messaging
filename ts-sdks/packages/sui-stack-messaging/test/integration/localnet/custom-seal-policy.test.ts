// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, inject, beforeAll } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import { Transaction } from '@mysten/sui/transactions';
import { messagingPermissionTypes, type SealPolicy } from '@mysten/sui-stack-messaging';

import {
	createSuiStackMessagingClient,
	type SuiStackMessagingTestClient,
} from '../../helpers/index.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Context required by the custom seal_approve in example_app::custom_seal_policy. */
interface SubscriptionApproveContext {
	serviceId: string;
	subscriptionId: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fundNewKeypair(faucetUrl: string): Promise<Ed25519Keypair> {
	const keypair = new Ed25519Keypair();
	await requestSuiFromFaucetV2({
		host: faucetUrl,
		recipient: keypair.getPublicKey().toSuiAddress(),
	});
	return keypair;
}

/**
 * Creates a custom SealPolicy that calls example_app::custom_seal_policy::seal_approve.
 * The seal_approve validates:
 * 1. Standard identity bytes (via messaging::seal_policies::validate_identity)
 * 2. Subscription ownership and expiry (custom check_policy)
 */
function createSubscriptionSealPolicy(
	exampleAppPackageId: string,
): SealPolicy<SubscriptionApproveContext> {
	return {
		packageId: exampleAppPackageId,
		sealApproveThunk(idBytes, groupId, encHistId, context) {
			return (tx) =>
				tx.moveCall({
					package: exampleAppPackageId,
					module: 'custom_seal_policy',
					function: 'seal_approve',
					typeArguments: ['0x2::sui::SUI'],
					arguments: [
						tx.pure.vector('u8', Array.from(idBytes)),
						tx.object(context.subscriptionId),
						tx.object(context.serviceId),
						tx.object(groupId),
						tx.object(encHistId),
						tx.object('0x6'), // Clock
					],
				});
		},
	};
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Custom SealPolicy — Subscription-Gated Encryption', () => {
	// Default-policy admin client (for group creation and management)
	let defaultAdminClient: SuiStackMessagingTestClient;
	let adminKeypair: Ed25519Keypair;
	let faucetUrl: string;

	let exampleAppPackageId: string;
	let groupId: string;
	let encryptionHistoryId: string;
	let serviceId: string;

	let clientConfig: {
		suiClientUrl: string;
		permissionedGroupsPackageId: string;
		messagingPackageId: string;
		namespaceId: string;
		versionId: string;
	};

	beforeAll(async () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const namespaceId = inject('messagingNamespaceId');
		const versionId = inject('messagingVersionId');
		const adminAccount = inject('adminAccount');
		const faucetPort = inject('faucetPort');

		exampleAppPackageId = publishedPackages['example-app'].packageId;
		faucetUrl = `http://localhost:${faucetPort}`;
		adminKeypair = Ed25519Keypair.fromSecretKey(adminAccount.secretKey);

		clientConfig = {
			suiClientUrl,
			permissionedGroupsPackageId: publishedPackages['permissioned-groups'].packageId,
			messagingPackageId: publishedPackages['messaging'].packageId,
			namespaceId: namespaceId!,
			versionId: versionId!,
		};

		// 1. Create a default-policy admin client (for group management)
		defaultAdminClient = createSuiStackMessagingClient({
			url: suiClientUrl,
			network: 'localnet',
			...clientConfig,
			keypair: adminKeypair,
		});

		// 2. Create a messaging group
		const uuid = crypto.randomUUID();
		await defaultAdminClient.messaging.createAndShareGroup({
			signer: adminKeypair,
			name: 'Custom Seal Policy Group',
			uuid,
		});

		groupId = defaultAdminClient.messaging.derive.groupId({ uuid });
		encryptionHistoryId = defaultAdminClient.messaging.derive.encryptionHistoryId({ uuid });

		// 3. Create Service<SUI> linked to this group (creates + shares in one call)
		const createServiceTx = new Transaction();
		createServiceTx.moveCall({
			package: exampleAppPackageId,
			module: 'custom_seal_policy',
			function: 'create_service_and_share',
			typeArguments: ['0x2::sui::SUI'],
			arguments: [
				createServiceTx.pure.id(groupId),
				createServiceTx.pure.u64(1000), // fee: 1000 MIST
				createServiceTx.pure.u64(3_600_000), // ttl: 1 hour
			],
		});

		const createServiceResult = await defaultAdminClient.core.signAndExecuteTransaction({
			transaction: createServiceTx,
			signer: adminKeypair,
			include: { effects: true, objectTypes: true },
		});

		const createServiceTxResult =
			createServiceResult.Transaction ?? createServiceResult.FailedTransaction;
		if (!createServiceTxResult?.status.success) {
			throw new Error(`Failed to create service: ${JSON.stringify(createServiceTxResult?.status)}`);
		}

		await defaultAdminClient.core.waitForTransaction({ result: createServiceResult });

		// Find the created Service object
		const createdService = createServiceTxResult.effects!.changedObjects.find((obj) => {
			const objType = createServiceTxResult.objectTypes?.[obj.objectId];
			return obj.idOperation === 'Created' && objType?.includes('Service');
		});

		if (!createdService) {
			throw new Error('Service not found in transaction effects');
		}

		serviceId = createdService.objectId;
	});

	it('should encrypt and decrypt with custom seal_approve', async () => {
		// Fund a subscriber and grant them MessagingReader permission
		const subscriberKeypair = await fundNewKeypair(faucetUrl);
		const subscriberAddress = subscriberKeypair.getPublicKey().toSuiAddress();

		await defaultAdminClient.groups.grantPermissions({
			signer: adminKeypair,
			groupId,
			member: subscriberAddress,
			permissionTypes: Object.values(messagingPermissionTypes(clientConfig.messagingPackageId)),
		});

		// Subscribe using entry function (creates + transfers to sender in one call)
		const subscribeTx = new Transaction();
		const [coin] = subscribeTx.splitCoins(subscribeTx.gas, [1000]);
		subscribeTx.moveCall({
			package: exampleAppPackageId,
			module: 'custom_seal_policy',
			function: 'subscribe_entry',
			typeArguments: ['0x2::sui::SUI'],
			arguments: [
				subscribeTx.object(serviceId),
				coin,
				subscribeTx.object('0x6'), // Clock
			],
		});

		const subscribeResult = await defaultAdminClient.core.signAndExecuteTransaction({
			transaction: subscribeTx,
			signer: subscriberKeypair,
			include: { effects: true, objectTypes: true },
		});

		const subscribeTxResult = subscribeResult.Transaction ?? subscribeResult.FailedTransaction;
		if (!subscribeTxResult?.status.success) {
			throw new Error(`Failed to subscribe: ${JSON.stringify(subscribeTxResult?.status)}`);
		}

		await defaultAdminClient.core.waitForTransaction({ result: subscribeResult });

		// Find the created Subscription object
		const createdSubscription = subscribeTxResult.effects!.changedObjects.find((obj) => {
			const objType = subscribeTxResult.objectTypes?.[obj.objectId];
			return obj.idOperation === 'Created' && objType?.includes('Subscription');
		});

		if (!createdSubscription) {
			throw new Error('Subscription not found in transaction effects');
		}

		const subscriptionId = createdSubscription.objectId;

		// Create custom seal policy
		const sealPolicy = createSubscriptionSealPolicy(exampleAppPackageId);

		// Create subscriber client with custom seal policy
		const subscriberClient = createSuiStackMessagingClient({
			url: clientConfig.suiClientUrl,
			network: 'localnet',
			...clientConfig,
			keypair: subscriberKeypair,
			sealPolicy,
		});

		const approveContext: SubscriptionApproveContext = { serviceId, subscriptionId };

		// Encrypt
		const message = 'Subscription-gated secret message';
		const data = new TextEncoder().encode(message);

		const envelope = await subscriberClient.messaging.encryption.encrypt({
			groupId,
			encryptionHistoryId,
			keyVersion: 0n,
			data,
			sealApproveContext: approveContext,
		});

		expect(envelope.ciphertext).toBeInstanceOf(Uint8Array);
		expect(envelope.keyVersion).toBe(0n);

		// Decrypt
		const decrypted = await subscriberClient.messaging.encryption.decrypt({
			groupId,
			encryptionHistoryId,
			envelope,
			sealApproveContext: approveContext,
		});

		expect(new TextDecoder().decode(decrypted)).toBe(message);
	});

	it('should deny a non-subscriber member', async () => {
		// Fund an outsider and grant them MessagingReader but NO subscription
		const outsiderKeypair = await fundNewKeypair(faucetUrl);
		const outsiderAddress = outsiderKeypair.getPublicKey().toSuiAddress();

		await defaultAdminClient.groups.grantPermissions({
			signer: adminKeypair,
			groupId,
			member: outsiderAddress,
			permissionTypes: Object.values(messagingPermissionTypes(clientConfig.messagingPackageId)),
		});

		const sealPolicy = createSubscriptionSealPolicy(exampleAppPackageId);

		const outsiderClient = createSuiStackMessagingClient({
			url: clientConfig.suiClientUrl,
			network: 'localnet',
			...clientConfig,
			keypair: outsiderKeypair,
			sealPolicy,
		});

		// The outsider has no subscription — use a fake subscription ID
		// The seal_approve dry-run should fail because the object doesn't exist / isn't owned
		await expect(
			outsiderClient.messaging.encryption.encrypt({
				groupId,
				encryptionHistoryId,
				keyVersion: 0n,
				data: new TextEncoder().encode('should fail'),
				sealApproveContext: {
					serviceId,
					subscriptionId: '0x0000000000000000000000000000000000000000000000000000000000000000',
				},
			}),
		).rejects.toThrow();
	});

	it('should deny a non-member subscriber', async () => {
		// Fund an outsider — do NOT grant MessagingReader
		const outsiderKeypair = await fundNewKeypair(faucetUrl);

		// Subscribe using entry function (they can subscribe even without being a member)
		const subscribeTx = new Transaction();
		const [coin] = subscribeTx.splitCoins(subscribeTx.gas, [1000]);
		subscribeTx.moveCall({
			package: exampleAppPackageId,
			module: 'custom_seal_policy',
			function: 'subscribe_entry',
			typeArguments: ['0x2::sui::SUI'],
			arguments: [
				subscribeTx.object(serviceId),
				coin,
				subscribeTx.object('0x6'), // Clock
			],
		});

		const subscribeResult = await defaultAdminClient.core.signAndExecuteTransaction({
			transaction: subscribeTx,
			signer: outsiderKeypair,
			include: { effects: true, objectTypes: true },
		});

		const subscribeTxResult = subscribeResult.Transaction ?? subscribeResult.FailedTransaction;
		if (!subscribeTxResult?.status.success) {
			throw new Error(`Failed to subscribe outsider: ${JSON.stringify(subscribeTxResult?.status)}`);
		}

		await defaultAdminClient.core.waitForTransaction({ result: subscribeResult });

		const createdSubscription = subscribeTxResult.effects!.changedObjects.find((obj) => {
			const objType = subscribeTxResult.objectTypes?.[obj.objectId];
			return obj.idOperation === 'Created' && objType?.includes('Subscription');
		});

		if (!createdSubscription) {
			throw new Error('Subscription not found in transaction effects');
		}

		const subscriptionId = createdSubscription.objectId;

		const sealPolicy = createSubscriptionSealPolicy(exampleAppPackageId);

		const outsiderClient = createSuiStackMessagingClient({
			url: clientConfig.suiClientUrl,
			network: 'localnet',
			...clientConfig,
			keypair: outsiderKeypair,
			sealPolicy,
		});

		// Has subscription but is NOT a member — seal_approve should reject
		await expect(
			outsiderClient.messaging.encryption.encrypt({
				groupId,
				encryptionHistoryId,
				keyVersion: 0n,
				data: new TextEncoder().encode('should fail'),
				sealApproveContext: { serviceId, subscriptionId },
			}),
		).rejects.toThrow(/seal_approve/);
	});
});
