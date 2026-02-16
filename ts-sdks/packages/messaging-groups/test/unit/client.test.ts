// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SessionKey } from '@mysten/seal';
import { SessionKey as SessionKeyClass } from '@mysten/seal';
import type { SealCompatibleClient } from '@mysten/seal';
import { permissionedGroups } from '@mysten/permissioned-groups';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { describe, expect, it } from 'vitest';

import { MessagingGroupsClient, messagingGroups } from '../../src/client.js';
import { MessagingGroupsClientError } from '../../src/error.js';
import type { MessagingGroupsEncryptionOptions } from '../../src/types.js';
import { createMockSealClient } from './helpers/mock-seal-client.js';

const MOCK_PACKAGE_ID = '0x' + 'ab'.repeat(32);
const MOCK_NAMESPACE_ID = '0x' + '99'.repeat(32);
const MOCK_VERSION_ID = '0x' + '11'.repeat(32);
const MOCK_PACKAGE_CONFIG = {
	originalPackageId: MOCK_PACKAGE_ID,
	latestPackageId: MOCK_PACKAGE_ID,
	namespaceId: MOCK_NAMESPACE_ID,
	versionId: MOCK_VERSION_ID,
};
const MOCK_PERMISSIONED_GROUPS_PACKAGE_ID = '0x' + 'ff'.repeat(32);
const MOCK_WITNESS_TYPE = `${MOCK_PERMISSIONED_GROUPS_PACKAGE_ID}::messaging::Messaging`;

const mockSealSuiClient = {} as SealCompatibleClient;

function createMockSessionKey(): SessionKey {
	const keypair = Ed25519Keypair.generate();
	return SessionKeyClass.import(
		{
			address: keypair.getPublicKey().toSuiAddress(),
			packageId: '0x' + '00'.repeat(32),
			creationTimeMs: Date.now(),
			ttlMin: 30,
			sessionKey: keypair.getSecretKey(),
		},
		mockSealSuiClient,
	);
}

function createMockEncryptionOptions(): MessagingGroupsEncryptionOptions {
	const sessionKey = createMockSessionKey();
	return {
		sessionKey: { getSessionKey: () => sessionKey },
	};
}

function createSealExtension() {
	return {
		name: 'seal' as const,
		register: () => createMockSealClient(),
	};
}

function createExtendedClient(network: string = 'localnet') {
	const suiClient = new SuiJsonRpcClient({ url: 'http://127.0.0.1:9000', network });
	return suiClient.$extend(
		permissionedGroups({
			witnessType: MOCK_WITNESS_TYPE,
			packageConfig: {
				originalPackageId: MOCK_PERMISSIONED_GROUPS_PACKAGE_ID,
				latestPackageId: MOCK_PERMISSIONED_GROUPS_PACKAGE_ID,
			},
		}),
		createSealExtension(),
	);
}

describe('MessagingGroupsClient', () => {
	describe('constructor validation', () => {
		it('should throw if client is not provided', () => {
			expect(
				() =>
					new MessagingGroupsClient({
						client: undefined as any,
						groupsName: 'groups',
						sealName: 'seal',
						packageConfig: MOCK_PACKAGE_CONFIG,
						encryption: createMockEncryptionOptions(),
					}),
			).toThrow(MessagingGroupsClientError);
			expect(
				() =>
					new MessagingGroupsClient({
						client: undefined as any,
						groupsName: 'groups',
						sealName: 'seal',
						packageConfig: MOCK_PACKAGE_CONFIG,
						encryption: createMockEncryptionOptions(),
					}),
			).toThrow('client must be provided');
		});

		it('should throw for unsupported network without packageConfig', () => {
			expect(
				() =>
					new MessagingGroupsClient({
						client: createExtendedClient('localnet') as any,
						groupsName: 'groups',
						sealName: 'seal',
						encryption: createMockEncryptionOptions(),
					}),
			).toThrow(MessagingGroupsClientError);
			expect(
				() =>
					new MessagingGroupsClient({
						client: createExtendedClient('localnet') as any,
						groupsName: 'groups',
						sealName: 'seal',
						encryption: createMockEncryptionOptions(),
					}),
			).toThrow('Unsupported network');
		});

		it('should accept custom packageConfig for localnet', () => {
			const client = new MessagingGroupsClient({
				client: createExtendedClient() as any,
				groupsName: 'groups',
				sealName: 'seal',
				packageConfig: MOCK_PACKAGE_CONFIG,
				encryption: createMockEncryptionOptions(),
			});
			expect(client).toBeInstanceOf(MessagingGroupsClient);
		});

		it('should expose call, tx, view, bcs, derive, encryption', () => {
			const client = new MessagingGroupsClient({
				client: createExtendedClient() as any,
				groupsName: 'groups',
				sealName: 'seal',
				packageConfig: MOCK_PACKAGE_CONFIG,
				encryption: createMockEncryptionOptions(),
			});

			expect(client.call).toBeDefined();
			expect(client.tx).toBeDefined();
			expect(client.view).toBeDefined();
			expect(client.bcs).toBeDefined();
			expect(client.derive).toBeDefined();
			expect(client.encryption).toBeDefined();
		});
	});
});

describe('messagingGroups factory + $extend', () => {
	it('should extend SuiClient and expose sub-modules via client.messaging', () => {
		const client = createExtendedClient().$extend(
			messagingGroups({
				packageConfig: MOCK_PACKAGE_CONFIG,
				encryption: createMockEncryptionOptions(),
			}),
		);

		expect(client.messaging).toBeDefined();
		expect(client.messaging).toBeInstanceOf(MessagingGroupsClient);
		expect(client.messaging.call).toBeDefined();
		expect(client.messaging.tx).toBeDefined();
		expect(client.messaging.view).toBeDefined();
		expect(client.messaging.bcs).toBeDefined();
		expect(client.messaging.derive).toBeDefined();
		expect(client.messaging.encryption).toBeDefined();
	});

	it('should use custom name when provided', () => {
		const client = createExtendedClient().$extend(
			messagingGroups({
				name: 'chat',
				packageConfig: MOCK_PACKAGE_CONFIG,
				encryption: createMockEncryptionOptions(),
			}),
		);

		expect(client.chat).toBeDefined();
		expect(client.chat).toBeInstanceOf(MessagingGroupsClient);
	});

	it('should compose with permissionedGroups and seal extensions', () => {
		const client = createExtendedClient().$extend(
			messagingGroups({
				packageConfig: MOCK_PACKAGE_CONFIG,
				encryption: createMockEncryptionOptions(),
			}),
		);

		// All three extensions should coexist
		expect(client.groups).toBeDefined();
		expect(client.seal).toBeDefined();
		expect(client.messaging).toBeDefined();
	});

	it('should support custom groupsName and sealName', () => {
		const suiClient = new SuiJsonRpcClient({ url: 'http://127.0.0.1:9000', network: 'localnet' });
		const client = suiClient
			.$extend(
				permissionedGroups({
					name: 'permissions',
					witnessType: MOCK_WITNESS_TYPE,
					packageConfig: {
						originalPackageId: MOCK_PERMISSIONED_GROUPS_PACKAGE_ID,
						latestPackageId: MOCK_PERMISSIONED_GROUPS_PACKAGE_ID,
					},
				}),
				{ name: 'mySeal' as const, register: () => createMockSealClient() },
			)
			.$extend(
				messagingGroups({
					groupsName: 'permissions',
					sealName: 'mySeal',
					packageConfig: MOCK_PACKAGE_CONFIG,
					encryption: createMockEncryptionOptions(),
				}),
			);

		expect(client.permissions).toBeDefined();
		expect(client.mySeal).toBeDefined();
		expect(client.messaging).toBeDefined();
		expect(client.messaging).toBeInstanceOf(MessagingGroupsClient);
	});
});
