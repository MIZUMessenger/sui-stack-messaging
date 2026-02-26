// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SessionKey } from '@mysten/seal';
import type { SealCompatibleClient } from '@mysten/seal';
import { ClientCache, type ClientWithCoreApi } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { describe, expect, it, vi } from 'vitest';

import { AttachmentsManager } from '../../src/attachments/attachments-manager.js';
import type { AttachmentFile } from '../../src/attachments/types.js';
import { EnvelopeEncryption } from '../../src/encryption/envelope-encryption.js';
import { MessagingGroupsClientError } from '../../src/error.js';
import type { StorageAdapter, StorageEntry, StorageUploadResult } from '../../src/storage/storage-adapter.js';
import { MessagingGroupsDerive } from '../../src/derive.js';
import type { MessagingGroupsView } from '../../src/view.js';
import { createMockSealClient } from './helpers/mock-seal-client.js';

// === Constants ===

const MOCK_PACKAGE_ID = '0x' + 'ab'.repeat(32);
const MOCK_NAMESPACE_ID = '0x' + '99'.repeat(32);
const MOCK_VERSION_ID = '0x' + '11'.repeat(32);

const mockSealSuiClient = {} as SealCompatibleClient;

// === Helpers ===

function createTestSessionKey(): SessionKey {
	const keypair = Ed25519Keypair.generate();
	return SessionKey.import(
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

function createEnvelopeEncryption(): EnvelopeEncryption {
	const sessionKey = createTestSessionKey();
	return new EnvelopeEncryption({
		sealClient: createMockSealClient(),
		suiClient: { cache: new ClientCache() } as unknown as ClientWithCoreApi,
		view: { getCurrentKeyVersion: async () => 0n } as unknown as MessagingGroupsView,
		derive: new MessagingGroupsDerive({
			packageConfig: {
				originalPackageId: MOCK_PACKAGE_ID,
				latestPackageId: MOCK_PACKAGE_ID,
				namespaceId: MOCK_NAMESPACE_ID,
				versionId: MOCK_VERSION_ID,
			},
		}),
		originalPackageId: MOCK_PACKAGE_ID,
		latestPackageId: MOCK_PACKAGE_ID,
		versionId: MOCK_VERSION_ID,
		encryption: {
			sessionKey: { getSessionKey: () => sessionKey },
		},
	});
}

/**
 * In-memory StorageAdapter that stores entries in a Map.
 * Upload assigns incrementing IDs ("id-0", "id-1", ...).
 */
function createMockStorageAdapter(): StorageAdapter & {
	store: Map<string, Uint8Array>;
	uploadCalls: StorageEntry[][];
} {
	let nextId = 0;
	const store = new Map<string, Uint8Array>();
	const uploadCalls: StorageEntry[][] = [];

	return {
		store,
		uploadCalls,
		upload: vi.fn(async (entries: StorageEntry[]): Promise<StorageUploadResult> => {
			uploadCalls.push(entries);
			const ids: string[] = [];
			for (const entry of entries) {
				const id = `id-${nextId++}`;
				store.set(id, entry.data);
				ids.push(id);
			}
			return { ids, metadata: { blobId: 'test-blob' } };
		}),
		download: vi.fn(async (id: string): Promise<Uint8Array> => {
			const data = store.get(id);
			if (!data) throw new Error(`Not found: ${id}`);
			return data;
		}),
	};
}

function makeFile(name: string, content: string, mimeType = 'text/plain'): AttachmentFile {
	return {
		fileName: name,
		mimeType,
		data: new TextEncoder().encode(content),
	};
}

function makeFileOfSize(name: string, sizeBytes: number): AttachmentFile {
	return {
		fileName: name,
		mimeType: 'application/octet-stream',
		data: new Uint8Array(sizeBytes),
	};
}

// === Tests ===

describe('AttachmentsManager', () => {
	describe('validation', () => {
		it('should reject empty files array', async () => {
			const encryption = createEnvelopeEncryption();
			await encryption.generateGroupDEK();
			const manager = new AttachmentsManager(encryption, {
				storageAdapter: createMockStorageAdapter(),
			});

			await expect(manager.upload([], { uuid: 'test' })).rejects.toThrow(
				MessagingGroupsClientError,
			);
			await expect(manager.upload([], { uuid: 'test' })).rejects.toThrow(
				'At least one file is required',
			);
		});

		it('should reject too many files', async () => {
			const encryption = createEnvelopeEncryption();
			await encryption.generateGroupDEK();
			const manager = new AttachmentsManager(encryption, {
				storageAdapter: createMockStorageAdapter(),
				maxAttachments: 2,
			});

			const files = [makeFile('a.txt', 'a'), makeFile('b.txt', 'b'), makeFile('c.txt', 'c')];

			await expect(manager.upload(files, { uuid: 'test' })).rejects.toThrow(
				'Too many files: 3 exceeds maximum of 2',
			);
		});

		it('should reject individual file exceeding size limit', async () => {
			const encryption = createEnvelopeEncryption();
			await encryption.generateGroupDEK();
			const manager = new AttachmentsManager(encryption, {
				storageAdapter: createMockStorageAdapter(),
				maxFileSizeBytes: 100,
			});

			const files = [makeFileOfSize('big.bin', 101)];

			await expect(manager.upload(files, { uuid: 'test' })).rejects.toThrow(
				/big\.bin.*101 bytes.*100 byte limit/,
			);
		});

		it('should reject total file size exceeding limit', async () => {
			const encryption = createEnvelopeEncryption();
			await encryption.generateGroupDEK();
			const manager = new AttachmentsManager(encryption, {
				storageAdapter: createMockStorageAdapter(),
				maxFileSizeBytes: 100,
				maxTotalFileSizeBytes: 150,
			});

			const files = [makeFileOfSize('a.bin', 80), makeFileOfSize('b.bin', 80)];

			await expect(manager.upload(files, { uuid: 'test' })).rejects.toThrow(
				/Total file size 160 bytes exceeds the 150 byte limit/,
			);
		});
	});

	describe('upload', () => {
		it('should encrypt each file individually and upload as batch', async () => {
			const encryption = createEnvelopeEncryption();
			const { uuid } = await encryption.generateGroupDEK();
			const storage = createMockStorageAdapter();
			const manager = new AttachmentsManager(encryption, { storageAdapter: storage });

			const files = [
				makeFile('hello.txt', 'hello world'),
				makeFile('photo.jpg', 'fake-image-data', 'image/jpeg'),
			];

			const result = await manager.upload(files, { uuid });

			// Should have uploaded files batch + manifest separately
			expect(storage.uploadCalls).toHaveLength(2);

			// First call: encrypted files batch (2 entries)
			const fileEntries = storage.uploadCalls[0];
			expect(fileEntries).toHaveLength(2);
			expect(fileEntries[0].name).toBe('hello.txt');
			expect(fileEntries[1].name).toBe('photo.jpg');
			// Encrypted data should differ from plaintext
			expect(fileEntries[0].data).not.toEqual(files[0].data);

			// Second call: encrypted manifest (1 entry)
			expect(storage.uploadCalls[1]).toHaveLength(1);
			expect(storage.uploadCalls[1][0].name).toBe('_manifest');

			// Result should have manifest reference
			expect(result.manifestId).toBeDefined();
			expect(result.manifestNonce).toBeDefined();
			expect(typeof result.manifestKeyVersion).toBe('number');
			expect(result.storageMetadata).toEqual({ blobId: 'test-blob' });
		});

		it('should work with a single file', async () => {
			const encryption = createEnvelopeEncryption();
			const { uuid } = await encryption.generateGroupDEK();
			const storage = createMockStorageAdapter();
			const manager = new AttachmentsManager(encryption, { storageAdapter: storage });

			const result = await manager.upload([makeFile('only.txt', 'content')], { uuid });

			expect(storage.uploadCalls).toHaveLength(2);
			expect(storage.uploadCalls[0]).toHaveLength(1);
			expect(result.manifestId).toBeDefined();
		});

		it('should work at max file count', async () => {
			const encryption = createEnvelopeEncryption();
			const { uuid } = await encryption.generateGroupDEK();
			const storage = createMockStorageAdapter();
			const manager = new AttachmentsManager(encryption, {
				storageAdapter: storage,
				maxAttachments: 3,
			});

			const files = [makeFile('a.txt', 'a'), makeFile('b.txt', 'b'), makeFile('c.txt', 'c')];

			const result = await manager.upload(files, { uuid });

			expect(storage.uploadCalls[0]).toHaveLength(3);
			expect(result.manifestId).toBeDefined();
		});
	});

	describe('resolve', () => {
		it('should download and decrypt manifest, returning lazy handles', async () => {
			const encryption = createEnvelopeEncryption();
			const { uuid } = await encryption.generateGroupDEK();
			const storage = createMockStorageAdapter();
			const manager = new AttachmentsManager(encryption, { storageAdapter: storage });

			const files = [
				makeFile('doc.txt', 'document content'),
				makeFile('img.png', 'png-bytes', 'image/png'),
			];

			const uploadResult = await manager.upload(files, { uuid });

			const handles = await manager.resolve({
				...uploadResult,
				uuid,
			});

			expect(handles).toHaveLength(2);

			expect(handles[0].fileName).toBe('doc.txt');
			expect(handles[0].mimeType).toBe('text/plain');
			expect(handles[0].fileSize).toBe(new TextEncoder().encode('document content').byteLength);

			expect(handles[1].fileName).toBe('img.png');
			expect(handles[1].mimeType).toBe('image/png');
		});

		it('should lazily download and decrypt each attachment via data()', async () => {
			const encryption = createEnvelopeEncryption();
			const { uuid } = await encryption.generateGroupDEK();
			const storage = createMockStorageAdapter();
			const manager = new AttachmentsManager(encryption, { storageAdapter: storage });

			const files = [makeFile('hello.txt', 'hello'), makeFile('world.txt', 'world')];

			const uploadResult = await manager.upload(files, { uuid });

			// Reset download mock to track resolve calls separately
			(storage.download as ReturnType<typeof vi.fn>).mockClear();

			const handles = await manager.resolve({ ...uploadResult, uuid });

			// No downloads for individual files yet (only manifest was downloaded)
			expect(storage.download).toHaveBeenCalledTimes(1);

			// Download first file
			const data0 = await handles[0].data();
			expect(new TextDecoder().decode(data0)).toBe('hello');
			expect(storage.download).toHaveBeenCalledTimes(2);

			// Download second file
			const data1 = await handles[1].data();
			expect(new TextDecoder().decode(data1)).toBe('world');
			expect(storage.download).toHaveBeenCalledTimes(3);
		});

		it('should trigger a fresh download on each data() call (no caching)', async () => {
			const encryption = createEnvelopeEncryption();
			const { uuid } = await encryption.generateGroupDEK();
			const storage = createMockStorageAdapter();
			const manager = new AttachmentsManager(encryption, { storageAdapter: storage });

			const uploadResult = await manager.upload([makeFile('f.txt', 'content')], { uuid });

			(storage.download as ReturnType<typeof vi.fn>).mockClear();

			const handles = await manager.resolve({ ...uploadResult, uuid });
			// 1 call for the manifest
			expect(storage.download).toHaveBeenCalledTimes(1);

			await handles[0].data();
			expect(storage.download).toHaveBeenCalledTimes(2);

			await handles[0].data();
			expect(storage.download).toHaveBeenCalledTimes(3);
		});
	});

	describe('roundtrip', () => {
		it('should upload and resolve files with matching plaintext', async () => {
			const encryption = createEnvelopeEncryption();
			const { uuid } = await encryption.generateGroupDEK();
			const storage = createMockStorageAdapter();
			const manager = new AttachmentsManager(encryption, { storageAdapter: storage });

			const files = [
				makeFile('readme.md', '# Hello World', 'text/markdown'),
				makeFile('data.json', '{"key":"value"}', 'application/json'),
				makeFile('empty.txt', ''),
			];

			const uploadResult = await manager.upload(files, { uuid });
			const handles = await manager.resolve({ ...uploadResult, uuid });

			expect(handles).toHaveLength(3);

			for (let i = 0; i < files.length; i++) {
				const handle = handles[i];
				expect(handle.fileName).toBe(files[i].fileName);
				expect(handle.mimeType).toBe(files[i].mimeType);
				expect(handle.fileSize).toBe(files[i].data.byteLength);

				const decrypted = await handle.data();
				expect(new TextDecoder().decode(decrypted)).toBe(
					new TextDecoder().decode(files[i].data),
				);
			}
		});

		it('should roundtrip with explicit groupId and encryptionHistoryId', async () => {
			const encryption = createEnvelopeEncryption();
			const { uuid } = await encryption.generateGroupDEK();
			const derive = new MessagingGroupsDerive({
				packageConfig: {
					originalPackageId: MOCK_PACKAGE_ID,
					latestPackageId: MOCK_PACKAGE_ID,
					namespaceId: MOCK_NAMESPACE_ID,
					versionId: MOCK_VERSION_ID,
				},
			});
			const groupId = derive.groupId({ uuid });
			const encryptionHistoryId = derive.encryptionHistoryId({ uuid });

			const storage = createMockStorageAdapter();
			const manager = new AttachmentsManager(encryption, { storageAdapter: storage });

			const files = [makeFile('test.txt', 'explicit ids')];

			const uploadResult = await manager.upload(files, { groupId, encryptionHistoryId });
			const handles = await manager.resolve({
				...uploadResult,
				groupId,
				encryptionHistoryId,
			});

			const decrypted = await handles[0].data();
			expect(new TextDecoder().decode(decrypted)).toBe('explicit ids');
		});

		it('should roundtrip binary data', async () => {
			const encryption = createEnvelopeEncryption();
			const { uuid } = await encryption.generateGroupDEK();
			const storage = createMockStorageAdapter();
			const manager = new AttachmentsManager(encryption, { storageAdapter: storage });

			const binaryData = new Uint8Array([0, 1, 2, 255, 254, 253, 128, 127]);
			const files: AttachmentFile[] = [
				{ fileName: 'binary.bin', mimeType: 'application/octet-stream', data: binaryData },
			];

			const uploadResult = await manager.upload(files, { uuid });
			const handles = await manager.resolve({ ...uploadResult, uuid });

			const decrypted = await handles[0].data();
			expect(Array.from(decrypted)).toEqual(Array.from(binaryData));
		});
	});
});
