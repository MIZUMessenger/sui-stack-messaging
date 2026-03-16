// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SealClient, SessionKey } from '@mysten/seal';
import { EncryptedObject, NoAccessError } from '@mysten/seal';
import { bcs } from '@mysten/sui/bcs';
import type { ClientCache, ClientWithCoreApi } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex, isValidSuiAddress } from '@mysten/sui/utils';

import type { MessagingGroupsDerive } from '../derive.js';
import { EncryptionAccessDeniedError } from '../error.js';
import type { GroupRef, MessagingGroupsEncryptionOptions } from '../types.js';
import type { MessagingGroupsView } from '../view.js';
import type { CryptoPrimitives } from './crypto-primitives.js';
import { getDefaultCryptoPrimitives } from './crypto-primitives.js';
import { DEKManager, NONCE_LENGTH, type GeneratedDEK } from './dek-manager.js';
import { DefaultSealPolicy, type SealPolicy } from './seal-policy.js';
import { SessionKeyManager } from './session-key-manager.js';

// === AAD (Additional Authenticated Data) ===

/** BCS layout for message AAD: binds ciphertext to its group, key version, and sender. */
const MessageAAD = bcs.struct('MessageAAD', {
	groupId: bcs.Address,
	keyVersion: bcs.u64(),
	senderAddress: bcs.Address,
});

/**
 * Build the AAD bytes for AES-GCM message encryption.
 *
 * The AAD is never stored — both sender and receiver reconstruct it from
 * context they already know. If any field mismatches, AES-GCM decryption fails.
 *
 * Layout: `[groupId (32 bytes)][keyVersion (8 bytes LE u64)][senderAddress (32 bytes)]`
 */
export function buildMessageAad(params: {
	groupId: string;
	keyVersion: bigint;
	senderAddress: string;
}): Uint8Array {
	if (!isValidSuiAddress(params.groupId)) {
		throw new Error(`Invalid groupId: expected a valid Sui address, got "${params.groupId}"`);
	}
	if (!isValidSuiAddress(params.senderAddress)) {
		throw new Error(
			`Invalid senderAddress: expected a valid Sui address, got "${params.senderAddress}"`,
		);
	}
	return MessageAAD.serialize(params).toBytes();
}

/** The result of encrypting data with envelope encryption. */
export interface EncryptedEnvelope {
	/** AES-256-GCM ciphertext (with 16-byte auth tag appended). */
	ciphertext: Uint8Array;
	/** 12-byte nonce used for AES-GCM. */
	nonce: Uint8Array;
	/** Key version used for encryption. */
	keyVersion: bigint;
	/** Optional additional authenticated data. */
	aad?: Uint8Array;
}

/** Base options for encrypt(). */
type EncryptOptionsBase = GroupRef & {
	data: Uint8Array;
	/** Key version to use. Default: latest from chain. */
	keyVersion?: bigint;
	aad?: Uint8Array;
};

/** Base options for decrypt(). */
type DecryptOptionsBase = GroupRef & {
	envelope: EncryptedEnvelope;
};

/**
 * Conditionally adds `sealApproveContext` when `TApproveContext` is not `void`.
 * When `TApproveContext` is `void`, the base type is returned unchanged —
 * keeping the API transparent for the default case.
 */
type WithApproveContext<TBase, TApproveContext> = TApproveContext extends void
	? TBase
	: TBase & { sealApproveContext: TApproveContext };

/** Options for encrypt(). When a custom SealPolicy has TApproveContext, `sealApproveContext` is required. */
export type EncryptOptions<TApproveContext = void> = WithApproveContext<
	EncryptOptionsBase,
	TApproveContext
>;

/** Options for decrypt(). When a custom SealPolicy has TApproveContext, `sealApproveContext` is required. */
export type DecryptOptions<TApproveContext = void> = WithApproveContext<
	DecryptOptionsBase,
	TApproveContext
>;

/** Internal options for DEK resolution (after GroupRef is resolved). */
interface DEKResolutionOptions<TApproveContext = void> {
	groupId: string;
	encryptionHistoryId: string;
	keyVersion: bigint;
	sessionKey: SessionKey;
	sealApproveContext: TApproveContext;
}

export interface EnvelopeEncryptionConfig<TApproveContext = void> {
	/** Seal client for threshold encryption of DEKs. */
	sealClient: SealClient;
	/** Sui client for building seal_approve transactions. */
	suiClient: ClientWithCoreApi;
	/** View layer for fetching encrypted keys from EncryptionHistory. */
	view: MessagingGroupsView;
	/** Derive layer for deterministic ID derivation. */
	derive: MessagingGroupsDerive;
	/** Original (V1) package ID for Seal encryption namespace and SessionKey creation. */
	originalPackageId: string;
	/** Latest (current) package ID for seal_approve moveCall target. */
	latestPackageId: string;
	/** Version shared object ID (for seal_approve transactions). */
	versionId: string;
	/** Encryption options (session key config, crypto, threshold, seal policy). */
	encryption: MessagingGroupsEncryptionOptions<TApproveContext>;
}

/**
 * Top-level envelope encryption orchestrator.
 *
 * Coordinates the full E2EE lifecycle:
 * - **Encrypt:** resolve DEK (fetch + Seal-decrypt, with cache) → AES-GCM encrypt data
 * - **Decrypt:** resolve DEK (from cache or fetch + Seal-decrypt) → AES-GCM decrypt data
 * - **Generate DEK:** for group creation / key rotation (separate from encrypt/decrypt)
 *
 * Session keys are managed internally via {@link SessionKeyManager} — consumers
 * never pass session keys to individual operations.
 *
 * Seal identity bytes and `seal_approve` transaction building are delegated
 * to the configured {@link SealPolicy}. When no custom policy is provided,
 * {@link DefaultSealPolicy} is used (messaging package's `seal_approve_reader`).
 *
 * Decrypted DEKs are cached via {@link ClientCache} (scoped under `dek`)
 * so repeated operations for the same group/version don't re-invoke Seal.
 */
export class EnvelopeEncryption<TApproveContext = void> {
	readonly #dekManager: DEKManager;
	readonly #sealPolicy: SealPolicy<TApproveContext>;
	readonly #crypto: CryptoPrimitives;
	readonly #suiClient: ClientWithCoreApi;
	readonly #view: MessagingGroupsView;
	readonly #derive: MessagingGroupsDerive;
	readonly #dekCache: ClientCache;
	readonly #sessionKeyManager: SessionKeyManager;

	constructor(config: EnvelopeEncryptionConfig<TApproveContext>) {
		this.#suiClient = config.suiClient;
		this.#view = config.view;
		this.#derive = config.derive;
		this.#sealPolicy = (config.encryption.sealPolicy ??
			new DefaultSealPolicy(
				config.originalPackageId,
				config.latestPackageId,
				config.versionId,
			)) as SealPolicy<TApproveContext>;
		this.#crypto = config.encryption.cryptoPrimitives ?? getDefaultCryptoPrimitives();
		this.#dekCache = config.suiClient.cache.scope('dek');
		this.#dekManager = new DEKManager({
			sealClient: config.sealClient,
			sealPolicy: this.#sealPolicy,
			cryptoPrimitives: config.encryption.cryptoPrimitives,
			defaultThreshold: config.encryption.sealThreshold,
		});
		this.#sessionKeyManager = new SessionKeyManager({
			sessionKeyConfig: config.encryption.sessionKey,
			packageId: config.originalPackageId,
			suiClient: config.suiClient,
		});
	}

	// === High-Level API ===

	/**
	 * Generate a UUID (if not provided), derive the group ID, and generate
	 * a Seal-encrypted DEK for the group's initial encryption key (version 0).
	 *
	 * Used by `createGroup` / `createAndShareGroup`.
	 */
	async generateGroupDEK(providedUuid?: string): Promise<{
		uuid: string;
		encryptedDek: Uint8Array;
	}> {
		const uuid = providedUuid ?? this.#crypto.generateUUID();
		const groupId = this.#derive.groupId({ uuid });
		const { encryptedDek } = await this.#generateDEK({ groupId });
		return { uuid, encryptedDek };
	}

	/**
	 * Fetch the current key version, generate a new DEK for the next version,
	 * and Seal-encrypt it.
	 *
	 * Used by `rotateEncryptionKey`.
	 *
	 * Accepts either explicit `groupId` + `encryptionHistoryId`, or a `uuid`
	 * (which derives both IDs internally).
	 */
	async generateRotationDEK(
		options: GroupRef,
	): Promise<GeneratedDEK & { groupId: string; encryptionHistoryId: string }> {
		const { groupId, encryptionHistoryId } = this.#derive.resolveGroupRef(options);

		const currentVersion = await this.#view.getCurrentKeyVersion({ encryptionHistoryId });
		const result = await this.#generateDEK({
			groupId,
			keyVersion: currentVersion + 1n,
		});
		return { ...result, groupId, encryptionHistoryId };
	}

	/**
	 * Encrypt data for a group.
	 *
	 * Resolves the group's DEK (fetching from EncryptionHistory and
	 * Seal-decrypting if not cached) and AES-GCM encrypts the data.
	 *
	 * Session key is resolved internally — never needs to be passed.
	 * Key version defaults to the latest from chain if not specified.
	 *
	 * When `TApproveContext` is not `void`, `sealApproveContext` is required.
	 */
	async encrypt(options: EncryptOptions<TApproveContext>): Promise<EncryptedEnvelope> {
		const { groupId, encryptionHistoryId } = this.#derive.resolveGroupRef(options);
		const sessionKey = await this.#sessionKeyManager.getSessionKey();

		const keyVersion =
			options.keyVersion ?? (await this.#view.getCurrentKeyVersion({ encryptionHistoryId }));

		const dek = await this.#resolveDEK({
			groupId,
			encryptionHistoryId,
			keyVersion,
			sessionKey,
			sealApproveContext: this.#extractApproveContext(options),
		});

		const nonce = this.#crypto.generateRandomBytes(NONCE_LENGTH);
		const ciphertext = await this.#crypto.aesGcmEncrypt(dek, options.data, nonce, options.aad);

		return {
			ciphertext,
			nonce,
			keyVersion,
			aad: options.aad,
		};
	}

	/**
	 * Decrypt data for a group.
	 *
	 * Resolves the group's DEK (from cache or fetch + Seal-decrypt)
	 * and AES-GCM decrypts the envelope.
	 *
	 * Session key is resolved internally. Key version comes from the envelope.
	 *
	 * When `TApproveContext` is not `void`, `sealApproveContext` is required.
	 */
	async decrypt(options: DecryptOptions<TApproveContext>): Promise<Uint8Array> {
		const { groupId, encryptionHistoryId } = this.#derive.resolveGroupRef(options);
		const sessionKey = await this.#sessionKeyManager.getSessionKey();

		const dek = await this.#resolveDEK({
			groupId,
			encryptionHistoryId,
			keyVersion: options.envelope.keyVersion,
			sessionKey,
			sealApproveContext: this.#extractApproveContext(options),
		});

		return this.#crypto.aesGcmDecrypt(
			dek,
			options.envelope.ciphertext,
			options.envelope.nonce,
			options.envelope.aad,
		);
	}

	// === Cache Management ===

	/** Clear cached DEKs — all, or only those for a specific group. */
	clearCache(groupId?: string): void {
		this.#dekCache.clear(groupId ? [groupId] : undefined);
	}

	// === Private: DEK Generation ===

	/**
	 * Generate a new DEK and Seal-encrypt it. Warms the DEK cache.
	 */
	async #generateDEK(options: {
		groupId: string;
		keyVersion?: bigint;
		threshold?: number;
	}): Promise<GeneratedDEK> {
		const result = await this.#dekManager.generateDEK(options);

		// Warm the cache so subsequent encrypt/decrypt calls skip Seal.
		const keyVersion = options.keyVersion ?? 0n;
		this.#putDEK(options.groupId, keyVersion, result.dek);

		return result;
	}

	// === Private: Approve Context Extraction ===

	/**
	 * Extract `sealApproveContext` from options when `TApproveContext` is not `void`.
	 * Returns `undefined` (cast to `TApproveContext`) for the default `void` case.
	 */
	#extractApproveContext(
		options: EncryptOptions<TApproveContext> | DecryptOptions<TApproveContext>,
	): TApproveContext {
		return (options as Record<string, unknown>).sealApproveContext as TApproveContext;
	}

	// === Private: DEK Resolution ===

	async #resolveDEK(options: DEKResolutionOptions<TApproveContext>): Promise<Uint8Array> {
		try {
			return await this.#dekCache.read(
				[options.groupId, options.keyVersion.toString()],
				async () => {
					const encryptedDek = await this.#view.encryptedKey({
						encryptionHistoryId: options.encryptionHistoryId,
						version: options.keyVersion,
					});

					const txBytes = await this.#buildSealApproveBytes({
						encryptedDek,
						groupId: options.groupId,
						encryptionHistoryId: options.encryptionHistoryId,
						sealApproveContext: options.sealApproveContext,
						senderAddress: options.sessionKey.getAddress(),
					});

					return this.#dekManager.decryptDEK({
						encryptedDek,
						sessionKey: options.sessionKey,
						txBytes,
					});
				},
			);
		} catch (error) {
			if (error instanceof NoAccessError) {
				throw new EncryptionAccessDeniedError(error);
			}
			throw error;
		}
	}

	#putDEK(groupId: string, keyVersion: bigint, dek: Uint8Array): void {
		this.#dekCache.readSync([groupId, keyVersion.toString()], () => dek);
	}

	// === Private: Seal Transaction Building ===

	async #buildSealApproveBytes(options: {
		encryptedDek: Uint8Array;
		groupId: string;
		encryptionHistoryId: string;
		sealApproveContext: TApproveContext;
		senderAddress: string;
	}): Promise<Uint8Array> {
		const encryptedObject = EncryptedObject.parse(options.encryptedDek);
		const identityBytes = fromHex(encryptedObject.id);

		// Build the variadic context args for the thunk.
		// When TApproveContext is void, contextArgs is [] (spread is a no-op).
		const contextArgs = (
			options.sealApproveContext !== undefined ? [options.sealApproveContext] : []
		) as TApproveContext extends void ? [] : [context: TApproveContext];

		const tx = new Transaction();
		// Sender is needed so the transaction resolver can look up owned objects
		// (e.g. custom seal policies that reference user-owned Subscription objects).
		tx.setSender(options.senderAddress);
		tx.add(
			this.#sealPolicy.sealApproveThunk(
				identityBytes,
				options.groupId,
				options.encryptionHistoryId,
				...contextArgs,
			),
		);

		return tx.build({ client: this.#suiClient, onlyTransactionKind: true });
	}
}
