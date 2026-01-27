// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, inject } from 'vitest';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bcs } from '@mysten/sui/bcs';
import { fromHex, toHex } from '@mysten/sui/utils';
import { permissionedGroups } from '@mysten/permissioned-groups';
import { messagingGroups } from '@mysten/messaging-groups';

/**
 * Mock EncryptedObject BCS struct matching Seal's format.
 * Only includes fields needed for identity bytes parsing - the rest are dummy values.
 */
const MockEncryptedObject = bcs.struct('MockEncryptedObject', {
	version: bcs.u8(),
	packageId: bcs.Address,
	id: bcs.byteVector().transform({
		output: (val) => toHex(val),
		input: (val: string) => fromHex(val),
	}),
	// Simplified: remaining fields as dummy byte vectors
	services: bcs.vector(bcs.tuple([bcs.Address, bcs.u8()])),
	threshold: bcs.u8(),
	encryptedShares: bcs.vector(bcs.vector(bcs.u8())),
	ciphertext: bcs.vector(bcs.u8()),
});

/**
 * Creates a mock encrypted DEK that matches the expected Seal EncryptedObject BCS format.
 *
 * Identity bytes format: [creator_address (32 bytes)][nonce (32 bytes)]
 */
function createMockEncryptedDEK(creatorAddress: string): Uint8Array {
	// Remove 0x prefix and convert to bytes
	const addressBytes = fromHex(creatorAddress);

	// Generate a random nonce (32 bytes)
	const nonceBytes = new Uint8Array(32);
	crypto.getRandomValues(nonceBytes);

	// Create identity bytes: [creator_address (32 bytes)][nonce (32 bytes)]
	const identityBytes = new Uint8Array(64);
	identityBytes.set(addressBytes, 0);
	identityBytes.set(nonceBytes, 32);

	// Serialize using BCS
	return MockEncryptedObject.serialize({
		version: 0,
		packageId: '0x' + '00'.repeat(32), // Mock package ID
		id: toHex(identityBytes),
		services: [], // Empty services
		threshold: 1,
		encryptedShares: [], // Empty encrypted shares
		ciphertext: Array.from(new Uint8Array(32)), // Mock ciphertext
	}).toBytes();
}

describe('messaging-groups', () => {
	it('should have published both packages', () => {
		const publishedPackages = inject('publishedPackages');
		expect(publishedPackages['permissioned-groups']).toBeDefined();
		expect(publishedPackages['permissioned-groups'].packageId).toBeDefined();
		expect(publishedPackages['messaging']).toBeDefined();
		expect(publishedPackages['messaging'].packageId).toBeDefined();
	});

	it('should have found the MessagingNamespace', () => {
		const namespaceId = inject('messagingNamespaceId');
		expect(namespaceId).toBeDefined();
		expect(namespaceId).toMatch(/^0x[a-f0-9]+$/);
	});

	it('should have a working sui client', async () => {
		const suiClientUrl = inject('suiClientUrl');
		const adminAccount = inject('adminAccount');

		const suiClient = new SuiClient({ url: suiClientUrl });
		const balance = await suiClient.getBalance({
			owner: adminAccount.address,
		});

		expect(BigInt(balance.totalBalance)).toBeGreaterThan(0n);
	});

	it('should extend SuiClient with both PermissionedGroupsClient and MessagingGroupsClient', () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const namespaceId = inject('messagingNamespaceId');

		const permissionedGroupsPackageId = publishedPackages['permissioned-groups'].packageId;
		const messagingPackageId = publishedPackages['messaging'].packageId;
		const witnessType = `${messagingPackageId}::messaging::Messaging`;

		// Create SuiClient with MVR overrides for localnet
		const suiClient = new SuiClient({
			url: suiClientUrl,
			mvr: {
				overrides: {
					packages: {
						'@local-pkg/permissioned-groups': permissionedGroupsPackageId,
						'@local-pkg/messaging': messagingPackageId,
					},
				},
			},
		});

		// Extend with PermissionedGroupsClient first (required by MessagingGroupsClient)
		const clientWithGroups = suiClient.$extend(
			permissionedGroups({
				packageConfig: { packageId: permissionedGroupsPackageId },
				witnessType,
			}),
		);

		// Extend with MessagingGroupsClient
		const client = clientWithGroups.$extend(
			messagingGroups({
				packageConfig: {
					packageId: messagingPackageId,
					namespaceId: namespaceId!,
				},
			}),
		);

		// Verify both extensions are available
		expect(client.groups).toBeDefined();
		expect(client.groups.call).toBeDefined();
		expect(client.groups.tx).toBeDefined();
		expect(client.groups.bcs).toBeDefined();

		expect(client.messaging).toBeDefined();
		expect(client.messaging.call).toBeDefined();
		expect(client.messaging.tx).toBeDefined();
		expect(client.messaging.view).toBeDefined();
		expect(client.messaging.bcs).toBeDefined();
	});

	it('should have BCS types with correct package-scoped names', () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const namespaceId = inject('messagingNamespaceId');

		const permissionedGroupsPackageId = publishedPackages['permissioned-groups'].packageId;
		const messagingPackageId = publishedPackages['messaging'].packageId;
		const witnessType = `${messagingPackageId}::messaging::Messaging`;

		const suiClient = new SuiClient({
			url: suiClientUrl,
			mvr: {
				overrides: {
					packages: {
						'@local-pkg/permissioned-groups': permissionedGroupsPackageId,
						'@local-pkg/messaging': messagingPackageId,
					},
				},
			},
		});

		const client = suiClient
			.$extend(
				permissionedGroups({
					packageConfig: { packageId: permissionedGroupsPackageId },
					witnessType,
				}),
			)
			.$extend(
				messagingGroups({
					packageConfig: {
						packageId: messagingPackageId,
						namespaceId: namespaceId!,
					},
				}),
			);

		// Verify messaging BCS types have correct package-scoped names
		expect(client.messaging.bcs.Messaging.name).toBe(`${messagingPackageId}::messaging::Messaging`);
		expect(client.messaging.bcs.MessagingNamespace.name).toBe(
			`${messagingPackageId}::messaging::MessagingNamespace`,
		);
		expect(client.messaging.bcs.MessagingSender.name).toBe(
			`${messagingPackageId}::messaging::MessagingSender`,
		);
		expect(client.messaging.bcs.MessagingReader.name).toBe(
			`${messagingPackageId}::messaging::MessagingReader`,
		);
		expect(client.messaging.bcs.EncryptionHistory.name).toBe(
			`${messagingPackageId}::encryption_history::EncryptionHistory`,
		);
		expect(client.messaging.bcs.EncryptionKeyRotator.name).toBe(
			`${messagingPackageId}::encryption_history::EncryptionKeyRotator`,
		);
	});

	it('should create a messaging group transaction', () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const namespaceId = inject('messagingNamespaceId');
		const adminAccount = inject('adminAccount');

		const permissionedGroupsPackageId = publishedPackages['permissioned-groups'].packageId;
		const messagingPackageId = publishedPackages['messaging'].packageId;
		const witnessType = `${messagingPackageId}::messaging::Messaging`;

		const suiClient = new SuiClient({
			url: suiClientUrl,
			mvr: {
				overrides: {
					packages: {
						'@local-pkg/permissioned-groups': permissionedGroupsPackageId,
						'@local-pkg/messaging': messagingPackageId,
					},
				},
			},
		});

		const client = suiClient
			.$extend(
				permissionedGroups({
					packageConfig: { packageId: permissionedGroupsPackageId },
					witnessType,
				}),
			)
			.$extend(
				messagingGroups({
					packageConfig: {
						packageId: messagingPackageId,
						namespaceId: namespaceId!,
					},
				}),
			);

		// Create a mock encrypted DEK with proper identity bytes
		const mockEncryptedDek = createMockEncryptedDEK(adminAccount.address);

		// Build a createAndShareGroup transaction (just verify it builds without errors)
		const tx = client.messaging.tx.createAndShareGroup({
			initialEncryptedDek: mockEncryptedDek,
			initialMembers: [],
		});

		expect(tx).toBeDefined();
		expect(tx.getData).toBeDefined();
	});

	it('should create and share a messaging group on-chain', async () => {
		const suiClientUrl = inject('suiClientUrl');
		const publishedPackages = inject('publishedPackages');
		const namespaceId = inject('messagingNamespaceId');
		const adminAccount = inject('adminAccount');

		const permissionedGroupsPackageId = publishedPackages['permissioned-groups'].packageId;
		const messagingPackageId = publishedPackages['messaging'].packageId;
		const witnessType = `${messagingPackageId}::messaging::Messaging`;

		const suiClient = new SuiClient({
			url: suiClientUrl,
			mvr: {
				overrides: {
					packages: {
						'@local-pkg/permissioned-groups': permissionedGroupsPackageId,
						'@local-pkg/messaging': messagingPackageId,
					},
				},
			},
		});

		const keypair = Ed25519Keypair.fromSecretKey(adminAccount.secretKey);

		const client = suiClient
			.$extend(
				permissionedGroups({
					packageConfig: { packageId: permissionedGroupsPackageId },
					witnessType,
				}),
			)
			.$extend(
				messagingGroups({
					packageConfig: {
						packageId: messagingPackageId,
						namespaceId: namespaceId!,
					},
				}),
			);

		// Create encrypted DEK with proper identity bytes matching the signer's address
		const mockEncryptedDek = createMockEncryptedDEK(keypair.toSuiAddress());

		// Execute createAndShareGroup
		const result = await client.messaging.createAndShareGroup({
			signer: keypair,
			initialEncryptedDek: mockEncryptedDek,
			initialMembers: [],
		});

		expect(result.digest).toBeDefined();
		expect(result.digest).toMatch(/^[A-Za-z0-9+/=]+$/);
	});
});
