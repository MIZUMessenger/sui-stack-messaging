// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { fromHex, toHex } from '@mysten/sui/utils';

import type { EnvelopeEncryption } from '../encryption/envelope-encryption.js';
import { MessagingGroupsClientError } from '../error.js';
import type { StorageAdapter } from '../storage/storage-adapter.js';
import type { GroupRef } from '../types.js';
import type {
	AttachmentFile,
	AttachmentHandle,
	AttachmentManifest,
	AttachmentManifestEntry,
	AttachmentsConfig,
	AttachmentUploadResult,
} from './types.js';

const DEFAULT_MAX_ATTACHMENTS = 10;
const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_TOTAL_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

const MANIFEST_ENTRY_NAME = '_manifest';

/**
 * Orchestrates encrypting, uploading, downloading, and decrypting attachments.
 *
 * Upload flow:
 * 1. Validate file count and sizes.
 * 2. Encrypt each file individually via {@link EnvelopeEncryption}.
 * 3. Upload all encrypted files as a batch via {@link StorageAdapter}.
 * 4. Build a manifest describing each file (storage ID, nonce, key version).
 * 5. Encrypt and upload the manifest as a separate entry.
 * 6. Return the manifest's storage ID, nonce, and key version.
 *
 * Resolve flow:
 * 1. Download and decrypt the manifest.
 * 2. Return {@link AttachmentHandle}[] with lazy `data()` closures that
 *    download and decrypt individual files on demand.
 */
export class AttachmentsManager<TApproveContext = void> {
	readonly #encryption: EnvelopeEncryption<TApproveContext>;
	readonly #storageAdapter: StorageAdapter;
	readonly #maxAttachments: number;
	readonly #maxFileSizeBytes: number;
	readonly #maxTotalFileSizeBytes: number;

	constructor(encryption: EnvelopeEncryption<TApproveContext>, config: AttachmentsConfig) {
		this.#encryption = encryption;
		this.#storageAdapter = config.storageAdapter;
		this.#maxAttachments = config.maxAttachments ?? DEFAULT_MAX_ATTACHMENTS;
		this.#maxFileSizeBytes = config.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
		this.#maxTotalFileSizeBytes = config.maxTotalFileSizeBytes ?? DEFAULT_MAX_TOTAL_FILE_SIZE_BYTES;
	}

	/**
	 * Encrypt and upload a batch of files, returning a manifest reference.
	 *
	 * The manifest is itself encrypted and stored separately. The caller persists
	 * `manifestId`, `manifestNonce`, and `manifestKeyVersion` (e.g., on-chain
	 * in an Attachment object) so recipients can later call {@link resolve}.
	 */
	async upload(
		files: AttachmentFile[],
		groupRef: GroupRef,
		encryptOptions?: Omit<EncryptCallOptions<TApproveContext>, 'data'>,
	): Promise<AttachmentUploadResult> {
		this.#validateFiles(files);

		// 1. Encrypt each file individually.
		const encryptedEntries: {
			name: string;
			data: Uint8Array;
			nonce: Uint8Array;
			keyVersion: bigint;
		}[] = [];
		for (const file of files) {
			const envelope = await this.#encryption.encrypt({
				...groupRef,
				...encryptOptions,
				data: file.data,
			} as Parameters<EnvelopeEncryption<TApproveContext>['encrypt']>[0]);
			encryptedEntries.push({
				name: file.fileName,
				data: envelope.ciphertext,
				nonce: envelope.nonce,
				keyVersion: envelope.keyVersion,
			});
		}

		// 2. Upload all encrypted files as a batch.
		const uploadResult = await this.#storageAdapter.upload(
			encryptedEntries.map((e) => ({ name: e.name, data: e.data })),
		);

		// 3. Build the manifest.
		const manifestEntries: AttachmentManifestEntry[] = files.map((file, i) => ({
			fileName: file.fileName,
			mimeType: file.mimeType,
			fileSize: file.data.byteLength,
			dataId: uploadResult.ids[i],
			nonce: toHex(encryptedEntries[i].nonce),
			keyVersion: Number(encryptedEntries[i].keyVersion),
		}));

		const manifest: AttachmentManifest = {
			version: 1,
			attachments: manifestEntries,
			storageMetadata: uploadResult.metadata,
		};

		// 4. Encrypt and upload the manifest.
		const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
		const manifestEnvelope = await this.#encryption.encrypt({
			...groupRef,
			...encryptOptions,
			data: manifestBytes,
		} as Parameters<EnvelopeEncryption<TApproveContext>['encrypt']>[0]);

		const manifestUpload = await this.#storageAdapter.upload([
			{ name: MANIFEST_ENTRY_NAME, data: manifestEnvelope.ciphertext },
		]);

		return {
			manifestId: manifestUpload.ids[0],
			manifestNonce: toHex(manifestEnvelope.nonce),
			manifestKeyVersion: Number(manifestEnvelope.keyVersion),
			storageMetadata: uploadResult.metadata,
		};
	}

	/**
	 * Download and decrypt a manifest, returning lazy handles for each attachment.
	 *
	 * Each {@link AttachmentHandle.data} call triggers a fresh download+decrypt —
	 * no caching is done at the attachment level.
	 */
	async resolve(
		options: {
			manifestId: string;
			manifestNonce: string;
			manifestKeyVersion: number;
		} & GroupRef,
		decryptOptions?: Omit<DecryptCallOptions<TApproveContext>, 'envelope'>,
	): Promise<AttachmentHandle[]> {
		const { manifestId, manifestNonce, manifestKeyVersion, ...groupRef } = options;

		// 1. Download encrypted manifest.
		const encryptedManifest = await this.#storageAdapter.download(manifestId);

		// 2. Decrypt manifest.
		const manifestBytes = await this.#encryption.decrypt({
			...groupRef,
			...decryptOptions,
			envelope: {
				ciphertext: encryptedManifest,
				nonce: fromHex(manifestNonce),
				keyVersion: BigInt(manifestKeyVersion),
			},
		} as Parameters<EnvelopeEncryption<TApproveContext>['decrypt']>[0]);

		const manifest: AttachmentManifest = JSON.parse(new TextDecoder().decode(manifestBytes));

		// 3. Return lazy handles.
		return manifest.attachments.map((entry) => ({
			fileName: entry.fileName,
			mimeType: entry.mimeType,
			fileSize: entry.fileSize,
			data: async () => {
				const encrypted = await this.#storageAdapter.download(entry.dataId);
				return this.#encryption.decrypt({
					...groupRef,
					...decryptOptions,
					envelope: {
						ciphertext: encrypted,
						nonce: fromHex(entry.nonce),
						keyVersion: BigInt(entry.keyVersion),
					},
				} as Parameters<EnvelopeEncryption<TApproveContext>['decrypt']>[0]);
			},
		}));
	}

	// === Private: Validation ===

	#validateFiles(files: AttachmentFile[]): void {
		if (files.length === 0) {
			throw new MessagingGroupsClientError('At least one file is required');
		}

		if (files.length > this.#maxAttachments) {
			throw new MessagingGroupsClientError(
				`Too many files: ${files.length} exceeds maximum of ${this.#maxAttachments}`,
			);
		}

		let totalSize = 0;
		for (const file of files) {
			if (file.data.byteLength > this.#maxFileSizeBytes) {
				throw new MessagingGroupsClientError(
					`File "${file.fileName}" is ${file.data.byteLength} bytes, exceeding the ${this.#maxFileSizeBytes} byte limit`,
				);
			}
			totalSize += file.data.byteLength;
		}

		if (totalSize > this.#maxTotalFileSizeBytes) {
			throw new MessagingGroupsClientError(
				`Total file size ${totalSize} bytes exceeds the ${this.#maxTotalFileSizeBytes} byte limit`,
			);
		}
	}
}

// === Internal helper types ===

/** Extract encrypt options shape, minus `data` which we provide. */
type EncryptCallOptions<TApproveContext> = Parameters<
	EnvelopeEncryption<TApproveContext>['encrypt']
>[0];

/** Extract decrypt options shape, minus `envelope` which we provide. */
type DecryptCallOptions<TApproveContext> = Parameters<
	EnvelopeEncryption<TApproveContext>['decrypt']
>[0];
