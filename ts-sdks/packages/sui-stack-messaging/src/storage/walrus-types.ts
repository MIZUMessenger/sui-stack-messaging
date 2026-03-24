// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Internal types matching the Walrus publisher/aggregator HTTP API responses.
 *
 * These follow the `publisher_openapi.yaml` schemas (`QuiltStoreResult`,
 * `BlobStoreResult`, `StoredQuiltPatch`, `Blob`) and are intentionally
 * **not** exported from the package — consumers interact only with the
 * adapter-agnostic `StorageAdapter` interface.
 */

// ── Blob-level types ────────────────────────────────────────────────

export interface WalrusStorageResource {
	id: string;
	startEpoch: number;
	endEpoch: number;
	storageSize: number;
}

/** Sui object for a stored blob. */
export interface WalrusBlob {
	id: string;
	registeredEpoch: number;
	blobId: string;
	size: number;
	encodingType: string;
	certifiedEpoch: number | null;
	storage: WalrusStorageResource;
	deletable: boolean;
}

// ── BlobStoreResult variants ────────────────────────────────────────

export interface WalrusNewlyCreated {
	blobObject: WalrusBlob;
	resourceOperation: unknown;
	cost: number;
	sharedBlobObject?: string | null;
}

export interface WalrusAlreadyCertified {
	blobId: string;
	endEpoch: number;
	event?: { txDigest: string; eventSeq: string };
	object?: string;
}

/**
 * Discriminated union returned by `PUT /v1/quilts` and `PUT /v1/blobs`.
 *
 * We only handle `newlyCreated` and `alreadyCertified` — `markedInvalid`
 * and `error` variants are surfaced as generic errors.
 */
export type WalrusBlobStoreResult =
	| { newlyCreated: WalrusNewlyCreated; alreadyCertified?: never }
	| { alreadyCertified: WalrusAlreadyCertified; newlyCreated?: never };

// ── Quilt-level types ───────────────────────────────────────────────

export interface WalrusStoredQuiltPatch {
	identifier: string;
	quiltPatchId: string;
	range?: [number, number] | null;
}

/** Top-level response from `PUT /v1/quilts`. */
export interface WalrusQuiltStoreResult {
	blobStoreResult: WalrusBlobStoreResult;
	storedQuiltBlobs: WalrusStoredQuiltPatch[];
}
