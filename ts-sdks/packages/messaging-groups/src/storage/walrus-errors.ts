// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { HttpRequestError } from '../http/errors.js';

/** Base class for errors specific to the Walrus HTTP storage adapter. */
export class WalrusStorageError extends HttpRequestError {
	constructor(message: string, status?: number, body?: string) {
		super(message, status, body);
		this.name = 'WalrusStorageError';
	}
}

/** A quilt upload to the Walrus publisher failed. */
export class WalrusUploadError extends WalrusStorageError {
	constructor(status: number, body: string) {
		super(`Walrus quilt upload failed: ${status} — ${body}`, status, body);
		this.name = 'WalrusUploadError';
	}
}

/** A quilt patch download from the Walrus aggregator failed. */
export class WalrusDownloadError extends WalrusStorageError {
	constructor(status: number, body: string) {
		super(`Walrus quilt patch download failed: ${status} — ${body}`, status, body);
		this.name = 'WalrusDownloadError';
	}
}

/** The publisher response was missing expected data. */
export class WalrusResponseError extends WalrusStorageError {
	constructor(message: string) {
		super(message);
		this.name = 'WalrusResponseError';
	}
}
