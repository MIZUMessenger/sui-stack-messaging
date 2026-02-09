// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SessionKey } from '@mysten/seal';
import type { SealCompatibleClient } from '@mysten/seal';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionKeyManager } from '../../src/encryption/session-key-manager.js';

/** Minimal mock client for SessionKey.import() — no network calls needed. */
const mockSuiClient = {} as SealCompatibleClient;

/** Create a real SessionKey via import() with the given TTL. */
function createSessionKey(opts: { ttlMin?: number } = {}): SessionKey {
	const keypair = Ed25519Keypair.generate();
	return SessionKey.import(
		{
			address: keypair.getPublicKey().toSuiAddress(),
			packageId: '0x' + '00'.repeat(32),
			creationTimeMs: Date.now(),
			ttlMin: opts.ttlMin ?? 30,
			sessionKey: keypair.getSecretKey(),
		},
		mockSuiClient,
	);
}

describe('SessionKeyManager', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should return current key when not expired', async () => {
		const key = createSessionKey({ ttlMin: 30 });
		const mgr = new SessionKeyManager({ sessionKey: key, refreshBufferMs: 0 });

		const result = await mgr.getValidSessionKey();
		expect(result).toBe(key);
	});

	it('should report needsRefresh for expired key', () => {
		const key = createSessionKey({ ttlMin: 1 });
		const mgr = new SessionKeyManager({ sessionKey: key, refreshBufferMs: 0 });

		// Advance past TTL
		vi.advanceTimersByTime(2 * 60_000);

		expect(mgr.needsRefresh()).toBe(true);
	});

	it('should report needsRefresh when within buffer window', () => {
		// Key with 1 minute TTL, buffer of 2 minutes → stale immediately
		const key = createSessionKey({ ttlMin: 1 });
		const mgr = new SessionKeyManager({ sessionKey: key, refreshBufferMs: 120_000 });

		expect(mgr.needsRefresh()).toBe(true);
	});

	it('should not need refresh when outside buffer window', () => {
		// Key with 30 minute TTL, buffer of 1 minute → still fresh
		const key = createSessionKey({ ttlMin: 30 });
		const mgr = new SessionKeyManager({ sessionKey: key, refreshBufferMs: 60_000 });

		expect(mgr.needsRefresh()).toBe(false);
	});

	it('should throw if key expired and no onRefresh callback', async () => {
		const key = createSessionKey({ ttlMin: 1 });
		const mgr = new SessionKeyManager({ sessionKey: key, refreshBufferMs: 0 });

		// Advance past TTL
		vi.advanceTimersByTime(2 * 60_000);

		await expect(mgr.getValidSessionKey()).rejects.toThrow('Session key expired');
	});

	it('should call onRefresh and update key', async () => {
		const oldKey = createSessionKey({ ttlMin: 1 });
		const newKey = createSessionKey({ ttlMin: 30 });

		const mgr = new SessionKeyManager({
			sessionKey: oldKey,
			onRefresh: async () => newKey,
			refreshBufferMs: 0,
		});

		// Advance past TTL of old key
		vi.advanceTimersByTime(2 * 60_000);

		const result = await mgr.getValidSessionKey();
		expect(result).toBe(newKey);
		expect(mgr.sessionKey).toBe(newKey);
	});

	it('should coalesce concurrent refresh calls', async () => {
		const oldKey = createSessionKey({ ttlMin: 1 });
		const newKey = createSessionKey({ ttlMin: 30 });

		let callCount = 0;
		const mgr = new SessionKeyManager({
			sessionKey: oldKey,
			onRefresh: async () => {
				callCount++;
				return newKey;
			},
			refreshBufferMs: 0,
		});

		// Advance past TTL of old key
		vi.advanceTimersByTime(2 * 60_000);

		const [r1, r2, r3] = await Promise.all([
			mgr.getValidSessionKey(),
			mgr.getValidSessionKey(),
			mgr.getValidSessionKey(),
		]);

		expect(callCount).toBe(1);
		expect(r1).toBe(newKey);
		expect(r2).toBe(newKey);
		expect(r3).toBe(newKey);
	});

	it('should allow manual key replacement via setSessionKey', () => {
		const oldKey = createSessionKey({ ttlMin: 1 });
		const mgr = new SessionKeyManager({ sessionKey: oldKey, refreshBufferMs: 0 });

		// Expire the old key
		vi.advanceTimersByTime(2 * 60_000);
		expect(mgr.needsRefresh()).toBe(true);

		// Replace with fresh key
		const newKey = createSessionKey({ ttlMin: 30 });
		mgr.setSessionKey(newKey);

		expect(mgr.sessionKey).toBe(newKey);
		expect(mgr.needsRefresh()).toBe(false);
	});
});
