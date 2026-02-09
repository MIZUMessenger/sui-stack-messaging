// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SessionKey } from '@mysten/seal';

/**
 * Callback invoked when the current session key is expired or near expiration.
 * The consumer is responsible for creating a fresh `SessionKey` (via
 * `SessionKey.create()`, wallet signing, storage import, etc.).
 */
export type RefreshSessionKeyCallback = () => Promise<SessionKey>;

export interface SessionKeyManagerConfig {
	/** The initial session key instance. */
	sessionKey: SessionKey;
	/**
	 * Called when a refresh is needed.
	 * If omitted, {@link getValidSessionKey} throws when the key expires.
	 */
	onRefresh?: RefreshSessionKeyCallback;
	/**
	 * How many milliseconds *before* actual expiration to consider the key
	 * stale and trigger a refresh. Defaults to 60 000 (1 minute).
	 */
	refreshBufferMs?: number;
}

/**
 * Manages the lifecycle of a Seal {@link SessionKey}.
 *
 * - Exposes the current key directly via {@link sessionKey}.
 * - Checks expiry (with configurable buffer) and delegates refresh to the
 *   consumer-supplied callback.
 * - Coalesces concurrent refresh calls so only one runs at a time.
 */
export class SessionKeyManager {
	/** The current session key — directly accessible, no wrapper. */
	sessionKey: SessionKey;

	readonly #onRefresh?: RefreshSessionKeyCallback;
	readonly #refreshBufferMs: number;

	#refreshPromise: Promise<SessionKey> | null = null;

	constructor(config: SessionKeyManagerConfig) {
		this.sessionKey = config.sessionKey;
		this.#onRefresh = config.onRefresh;
		this.#refreshBufferMs = config.refreshBufferMs ?? 60_000;
	}

	/** Replace the current session key (e.g. after importing from storage). */
	setSessionKey(sessionKey: SessionKey): void {
		this.sessionKey = sessionKey;
	}

	/**
	 * Whether the current key is expired or will expire within the
	 * configured buffer window.
	 */
	needsRefresh(): boolean {
		if (this.sessionKey.isExpired()) return true;

		const exported = this.sessionKey.export();
		const expiresAt = exported.creationTimeMs + exported.ttlMin * 60_000;
		return Date.now() + this.#refreshBufferMs >= expiresAt;
	}

	/**
	 * Return a valid session key, refreshing first if necessary.
	 *
	 * If no `onRefresh` callback was provided and the key needs refreshing,
	 * this throws an error — the consumer must replace the key manually via
	 * {@link setSessionKey}.
	 *
	 * Concurrent calls are coalesced: only one refresh runs at a time.
	 */
	async getValidSessionKey(): Promise<SessionKey> {
		if (!this.needsRefresh()) {
			return this.sessionKey;
		}

		if (!this.#onRefresh) {
			throw new Error(
				'Session key expired and no onRefresh callback provided. ' +
					'Call setSessionKey() with a fresh key or provide onRefresh in config.',
			);
		}

		// Coalesce concurrent refresh requests.
		if (this.#refreshPromise) {
			return this.#refreshPromise;
		}

		this.#refreshPromise = this.#onRefresh();
		try {
			this.sessionKey = await this.#refreshPromise;
			return this.sessionKey;
		} finally {
			this.#refreshPromise = null;
		}
	}
}
