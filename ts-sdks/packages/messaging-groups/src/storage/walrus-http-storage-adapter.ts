// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { StorageAdapter, StorageEntry, StorageUploadResult } from './storage-adapter.js';
import type { WalrusBlob, WalrusQuiltStoreResult, WalrusStoredQuiltPatch } from './walrus-types.js';
import type { HttpClientConfig } from '../http/types.js';

import { DEFAULT_HTTP_TIMEOUT } from '../http/types.js';
import { HttpTimeoutError } from '../http/errors.js';
import { WalrusUploadError, WalrusDownloadError, WalrusResponseError } from './walrus-errors.js';

// ── Public config / metadata types ──────────────────────────────────

export interface WalrusHttpStorageAdapterConfig extends HttpClientConfig {
	/** Base URL of the Walrus publisher (e.g. `https://publisher.walrus-testnet.walrus.space`). */
	publisherUrl: string;
	/** Base URL of the Walrus aggregator (e.g. `https://aggregator.walrus-testnet.walrus.space`). */
	aggregatorUrl: string;
	/** Number of epochs (ahead of the current one) for which to store data. */
	epochs: number;
}

/**
 * Metadata extracted from a successful quilt upload.
 *
 * Persisted opaquely in `StorageUploadResult.metadata` so consumers can
 * perform future on-chain operations (deletion, epoch extension) without
 * knowing Walrus internals.
 */
export interface WalrusUploadMetadata {
	blobObjectId: string;
	blobId: string;
	startEpoch: number;
	endEpoch: number;
	cost: number;
	deletable: boolean;
}

// ── Adapter implementation ──────────────────────────────────────────

/**
 * {@link StorageAdapter} backed by the Walrus HTTP publisher + aggregator.
 *
 * - **Upload**: `PUT /v1/quilts?epochs=N` with `multipart/form-data`.
 * - **Download**: `GET /v1/blobs/by-quilt-patch-id/{id}`.
 * - **Delete**: not supported (publisher HTTP API has no deletion endpoint).
 */
export class WalrusHttpStorageAdapter implements StorageAdapter {
	readonly #publisherUrl: string;
	readonly #aggregatorUrl: string;
	readonly #epochs: number;
	readonly #fetch: typeof globalThis.fetch;
	readonly #timeout: number;
	readonly #onError?: (error: Error) => void;

	constructor(config: WalrusHttpStorageAdapterConfig) {
		this.#publisherUrl = config.publisherUrl.replace(/\/+$/, '');
		this.#aggregatorUrl = config.aggregatorUrl.replace(/\/+$/, '');
		this.#epochs = config.epochs;
		this.#fetch = config.fetch ?? globalThis.fetch;
		this.#timeout = config.timeout ?? DEFAULT_HTTP_TIMEOUT;
		this.#onError = config.onError;
	}

	// ── upload ─────────────────────────────────────────────────────

	async upload(entries: StorageEntry[]): Promise<StorageUploadResult> {
		const formData = new FormData();

		for (const entry of entries) {
			formData.append(entry.name, new Blob([new Uint8Array(entry.data)]));
		}

		const url = `${this.#publisherUrl}/v1/quilts?epochs=${this.#epochs}`;
		const response = await this.#request(url, { method: 'PUT', body: formData });

		if (!response.ok) {
			const body = await response.text();
			const error = new WalrusUploadError(response.status, body);
			this.#onError?.(error);
			throw error;
		}

		const result: WalrusQuiltStoreResult = await response.json();

		return {
			ids: this.#extractPatchIds(result.storedQuiltBlobs, entries),
			metadata: this.#extractMetadata(result),
		};
	}

	// ── download ───────────────────────────────────────────────────

	async download(id: string): Promise<Uint8Array> {
		const url = `${this.#aggregatorUrl}/v1/blobs/by-quilt-patch-id/${id}`;
		const response = await this.#request(url);

		if (!response.ok) {
			const body = await response.text();
			const error = new WalrusDownloadError(response.status, body);
			this.#onError?.(error);
			throw error;
		}

		return new Uint8Array(await response.arrayBuffer());
	}

	// ── internal request helper ────────────────────────────────────

	async #request(url: string, init?: RequestInit): Promise<Response> {
		const timeoutSignal = AbortSignal.timeout(this.#timeout);

		try {
			return await this.#fetch(url, {
				...init,
				signal: init?.signal ? AbortSignal.any([timeoutSignal, init.signal]) : timeoutSignal,
			});
		} catch (error) {
			if (error instanceof Error && error.name === 'TimeoutError') {
				const timeoutError = new HttpTimeoutError(url, this.#timeout);
				this.#onError?.(timeoutError);
				throw timeoutError;
			}
			if (error instanceof Error) {
				this.#onError?.(error);
			}
			throw error;
		}
	}

	// ── helpers ────────────────────────────────────────────────────

	/**
	 * Return quilt-patch IDs in the same order as `entries`.
	 *
	 * The publisher response contains patches keyed by `identifier` (the
	 * form-field name we used during upload). We build a lookup map so the
	 * returned `ids[]` array is positionally aligned with the input.
	 */
	#extractPatchIds(patches: WalrusStoredQuiltPatch[], entries: StorageEntry[]): string[] {
		const byIdentifier = new Map(patches.map((p) => [p.identifier, p.quiltPatchId]));

		return entries.map((entry) => {
			const patchId = byIdentifier.get(entry.name);
			if (!patchId) {
				throw new WalrusResponseError(
					`Walrus response missing quilt patch for identifier "${entry.name}"`,
				);
			}
			return patchId;
		});
	}

	/** Extract blob-level metadata from the `blobStoreResult`. */
	#extractMetadata(result: WalrusQuiltStoreResult): WalrusUploadMetadata {
		const { blobStoreResult } = result;

		if (blobStoreResult.newlyCreated) {
			const blob: WalrusBlob = blobStoreResult.newlyCreated.blobObject;
			return {
				blobObjectId: blob.id,
				blobId: blob.blobId,
				startEpoch: blob.storage.startEpoch,
				endEpoch: blob.storage.endEpoch,
				cost: blobStoreResult.newlyCreated.cost,
				deletable: blob.deletable,
			};
		}

		if (blobStoreResult.alreadyCertified) {
			const cert = blobStoreResult.alreadyCertified;
			return {
				blobObjectId: cert.object ?? '',
				blobId: cert.blobId,
				startEpoch: 0,
				endEpoch: cert.endEpoch,
				cost: 0,
				deletable: false,
			};
		}

		throw new WalrusResponseError(
			'Unexpected Walrus blobStoreResult — neither newlyCreated nor alreadyCertified',
		);
	}
}
