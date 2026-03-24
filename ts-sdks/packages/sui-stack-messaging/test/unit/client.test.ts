// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SessionKey } from '@mysten/seal';
import { SessionKey as SessionKeyClass } from '@mysten/seal';
import type { SealCompatibleClient } from '@mysten/seal';
import { suiGroups } from '@mysten/sui-groups';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { describe, expect, it } from 'vitest';

import { SuiStackMessagingClient, suiStackMessaging } from '../../src/client.js';
import { SuiStackMessagingClientError } from '../../src/error.js';
import type { SuiStackMessagingEncryptionOptions } from '../../src/types.js';
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
const MOCK_RELAYER_CONFIG = {
	relayerUrl: 'http://localhost:3000',
};

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

function createMockEncryptionOptions(): SuiStackMessagingEncryptionOptions {
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
		suiGroups({
			witnessType: MOCK_WITNESS_TYPE,
			packageConfig: {
				originalPackageId: MOCK_PERMISSIONED_GROUPS_PACKAGE_ID,
				latestPackageId: MOCK_PERMISSIONED_GROUPS_PACKAGE_ID,
			},
		}),
		createSealExtension(),
	);
}

describe('SuiStackMessagingClient', () => {
	describe('constructor validation', () => {
		it('should throw if client is not provided', () => {
			expect(
				() =>
					new SuiStackMessagingClient({
						client: undefined as any,
						groupsName: 'groups',
						sealName: 'seal',
						packageConfig: MOCK_PACKAGE_CONFIG,
						encryption: createMockEncryptionOptions(),
						relayer: MOCK_RELAYER_CONFIG,
					}),
			).toThrow(SuiStackMessagingClientError);
			expect(
				() =>
					new SuiStackMessagingClient({
						client: undefined as any,
						groupsName: 'groups',
						sealName: 'seal',
						packageConfig: MOCK_PACKAGE_CONFIG,
						encryption: createMockEncryptionOptions(),
						relayer: MOCK_RELAYER_CONFIG,
					}),
			).toThrow('client must be provided');
		});

		it('should throw for unsupported network without packageConfig', () => {
			expect(
				() =>
					new SuiStackMessagingClient({
						client: createExtendedClient('localnet') as any,
						groupsName: 'groups',
						sealName: 'seal',
						encryption: createMockEncryptionOptions(),
						relayer: MOCK_RELAYER_CONFIG,
					}),
			).toThrow(SuiStackMessagingClientError);
			expect(
				() =>
					new SuiStackMessagingClient({
						client: createExtendedClient('localnet') as any,
						groupsName: 'groups',
						sealName: 'seal',
						encryption: createMockEncryptionOptions(),
						relayer: MOCK_RELAYER_CONFIG,
					}),
			).toThrow('Unsupported network');
		});

		it('should accept custom packageConfig for localnet', () => {
			const client = new SuiStackMessagingClient({
				client: createExtendedClient() as any,
				groupsName: 'groups',
				sealName: 'seal',
				packageConfig: MOCK_PACKAGE_CONFIG,
				encryption: createMockEncryptionOptions(),
				relayer: MOCK_RELAYER_CONFIG,
			});
			expect(client).toBeInstanceOf(SuiStackMessagingClient);
		});

		it('should expose call, tx, view, bcs, derive, encryption, transport', () => {
			const client = new SuiStackMessagingClient({
				client: createExtendedClient() as any,
				groupsName: 'groups',
				sealName: 'seal',
				packageConfig: MOCK_PACKAGE_CONFIG,
				encryption: createMockEncryptionOptions(),
				relayer: MOCK_RELAYER_CONFIG,
			});

			expect(client.call).toBeDefined();
			expect(client.tx).toBeDefined();
			expect(client.view).toBeDefined();
			expect(client.bcs).toBeDefined();
			expect(client.derive).toBeDefined();
			expect(client.encryption).toBeDefined();
			expect(client.transport).toBeDefined();
		});
	});
});

describe('suiStackMessaging factory + $extend', () => {
	it('should extend SuiClient and expose sub-modules via client.messaging', () => {
		const client = createExtendedClient().$extend(
			suiStackMessaging({
				packageConfig: MOCK_PACKAGE_CONFIG,
				encryption: createMockEncryptionOptions(),
				relayer: MOCK_RELAYER_CONFIG,
			}),
		);

		expect(client.messaging).toBeDefined();
		expect(client.messaging).toBeInstanceOf(SuiStackMessagingClient);
		expect(client.messaging.call).toBeDefined();
		expect(client.messaging.tx).toBeDefined();
		expect(client.messaging.view).toBeDefined();
		expect(client.messaging.bcs).toBeDefined();
		expect(client.messaging.derive).toBeDefined();
		expect(client.messaging.encryption).toBeDefined();
	});

	it('should use custom name when provided', () => {
		const client = createExtendedClient().$extend(
			suiStackMessaging({
				name: 'chat',
				packageConfig: MOCK_PACKAGE_CONFIG,
				encryption: createMockEncryptionOptions(),
				relayer: MOCK_RELAYER_CONFIG,
			}),
		);

		expect(client.chat).toBeDefined();
		expect(client.chat).toBeInstanceOf(SuiStackMessagingClient);
	});

	it('should compose with suiGroups and seal extensions', () => {
		const client = createExtendedClient().$extend(
			suiStackMessaging({
				packageConfig: MOCK_PACKAGE_CONFIG,
				encryption: createMockEncryptionOptions(),
				relayer: MOCK_RELAYER_CONFIG,
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
				suiGroups({
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
				suiStackMessaging({
					groupsName: 'permissions',
					sealName: 'mySeal',
					packageConfig: MOCK_PACKAGE_CONFIG,
					encryption: createMockEncryptionOptions(),
					relayer: MOCK_RELAYER_CONFIG,
				}),
			);

		expect(client.permissions).toBeDefined();
		expect(client.mySeal).toBeDefined();
		expect(client.messaging).toBeDefined();
		expect(client.messaging).toBeInstanceOf(SuiStackMessagingClient);
	});
});
