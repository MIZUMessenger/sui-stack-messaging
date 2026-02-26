// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { StorageAdapter } from '../storage/storage-adapter.js';

// === Configuration ===

/** Configuration for the {@link AttachmentsManager}. */
export interface AttachmentsConfig {
	/** Storage adapter for uploading/downloading encrypted bytes. */
	storageAdapter: StorageAdapter;
	/** Maximum number of files per upload (default: 10). */
	maxAttachments?: number;
	/** Maximum size per individual file in bytes (default: 10 MB). */
	maxFileSizeBytes?: number;
	/** Maximum total size of all files in bytes (default: 50 MB). */
	maxTotalFileSizeBytes?: number;
}

// === Input Types ===

/** A file to be encrypted and uploaded as an attachment. */
export interface AttachmentFile {
	/** Display name (e.g., "photo.jpg"). */
	fileName: string;
	/** MIME type (e.g., "image/jpeg"). */
	mimeType: string;
	/** Raw file bytes. */
	data: Uint8Array;
}

// === Output Types ===

/** Result of uploading a batch of attachments. */
export interface AttachmentUploadResult {
	/** Storage ID of the encrypted manifest. */
	manifestId: string;
	/** Hex-encoded nonce used to encrypt the manifest. */
	manifestNonce: string;
	/** Key version used to encrypt the manifest. */
	manifestKeyVersion: number;
	/** Optional adapter-specific metadata from the storage upload (e.g., Walrus blob info). */
	storageMetadata?: unknown;
}

// === Manifest Types (serialized to JSON) ===

/** Encrypted manifest describing all attachments in a batch. */
export interface AttachmentManifest {
	version: 1;
	attachments: AttachmentManifestEntry[];
	/** Adapter-specific metadata preserved from the upload. */
	storageMetadata?: unknown;
}

/** One entry in the attachment manifest. */
export interface AttachmentManifestEntry {
	/** Original file name. */
	fileName: string;
	/** MIME type. */
	mimeType: string;
	/** Original file size in bytes (before encryption). */
	fileSize: number;
	/** Storage ID for downloading the encrypted data. */
	dataId: string;
	/** Hex-encoded nonce used to encrypt this file. */
	nonce: string;
	/** Key version used to encrypt this file. */
	keyVersion: number;
}

// === User-facing Handle ===

/** A resolved attachment with lazy download+decrypt. */
export interface AttachmentHandle {
	/** Original file name. */
	fileName: string;
	/** MIME type. */
	mimeType: string;
	/** Original file size in bytes (before encryption). */
	fileSize: number;
	/** Download and decrypt the attachment data on demand. */
	data(): Promise<Uint8Array>;
}
