// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SealClient, SessionKey } from '@mysten/seal';
import { bcs } from '@mysten/sui/bcs';
import { toHex } from '@mysten/sui/utils';

import type { CryptoPrimitives } from './crypto-primitives.js';
import { getDefaultCryptoPrimitives } from './crypto-primitives.js';

/** Length of the Seal identity bytes: 32 (groupId) + 8 (keyVersion LE u64). */
export const IDENTITY_BYTES_LENGTH = 40;

/** AES-256 key length in bytes. */
export const DEK_LENGTH = 32;

/** AES-GCM standard nonce length in bytes. */
export const NONCE_LENGTH = 12;

/** BCS layout for Seal identity bytes: `[Address (32 bytes)][u64 LE (8 bytes)]`. */
const IdentityBcs = bcs.struct('SealIdentity', {
	groupId: bcs.Address,
	keyVersion: bcs.u64(),
});

/**
 * Components of a Seal identity used for DEK encryption.
 *
 * The identity encodes *which group* and *which key version* the DEK belongs to.
 */
export interface SealIdentity {
	/** 0x-prefixed hex address of the PermissionedGroup object (32 bytes). */
	groupId: string;
	/** Encryption key version (0-indexed, incremented on rotation). */
	keyVersion: bigint;
}

/**
 * Encode a {@link SealIdentity} into the 40-byte wire format expected by Seal
 * and the on-chain `seal_policies` module.
 *
 * Layout: `[group_id (32 bytes)][key_version (8 bytes LE u64)]`
 */
export function encodeIdentity(identity: SealIdentity): Uint8Array {
	return IdentityBcs.serialize(identity).toBytes();
}

/**
 * Decode 40 identity bytes back into a {@link SealIdentity}.
 *
 * @throws if `bytes.length !== 40`
 */
export function decodeIdentity(bytes: Uint8Array): SealIdentity {
	if (bytes.length !== IDENTITY_BYTES_LENGTH) {
		throw new Error(
			`Invalid identity bytes length: expected ${IDENTITY_BYTES_LENGTH}, got ${bytes.length}`,
		);
	}
	const parsed = IdentityBcs.parse(bytes);
	return { groupId: parsed.groupId, keyVersion: BigInt(parsed.keyVersion) };
}

export interface DEKManagerConfig {
	sealClient: SealClient;
	packageId: string;
	cryptoPrimitives?: CryptoPrimitives;
	defaultThreshold?: number;
}

/** Result of generating a new DEK. */
export interface GeneratedDEK {
	/** The plaintext 32-byte data encryption key. */
	dek: Uint8Array;
	/** The Seal-encrypted DEK bytes (ready to store on-chain). */
	encryptedDek: Uint8Array;
	/** The identity that was used for Seal encryption. */
	identity: SealIdentity;
}

/**
 * Handles DEK generation and decryption via Seal threshold encryption.
 *
 * This is an internal building block — use {@link EnvelopeEncryption} for the
 * top-level API.
 */
export class DEKManager {
	readonly #sealClient: SealClient;
	readonly #packageId: string;
	readonly #crypto: CryptoPrimitives;
	readonly #defaultThreshold: number;

	constructor(config: DEKManagerConfig) {
		this.#sealClient = config.sealClient;
		this.#packageId = config.packageId;
		this.#crypto = config.cryptoPrimitives ?? getDefaultCryptoPrimitives();
		this.#defaultThreshold = config.defaultThreshold ?? 2;
	}

	/** Generate an AES-256-GCM DEK and encrypt it with Seal. */
	async generateDEK(options: {
		groupId: string;
		keyVersion?: bigint;
		threshold?: number;
	}): Promise<GeneratedDEK> {
		const identity: SealIdentity = {
			groupId: options.groupId,
			keyVersion: options.keyVersion ?? 0n,
		};

		const dek = await this.#crypto.generateAesKey();
		const identityBytes = encodeIdentity(identity);

		const { encryptedObject } = await this.#sealClient.encrypt({
			threshold: options.threshold ?? this.#defaultThreshold,
			packageId: this.#packageId,
			id: toHex(identityBytes),
			data: dek,
		});

		return { dek, encryptedDek: encryptedObject, identity };
	}

	/** Decrypt a DEK from its Seal-encrypted bytes. */
	async decryptDEK(options: {
		encryptedDek: Uint8Array;
		sessionKey: SessionKey;
		txBytes: Uint8Array;
	}): Promise<Uint8Array> {
		return this.#sealClient.decrypt({
			data: options.encryptedDek,
			sessionKey: options.sessionKey,
			txBytes: options.txBytes,
		});
	}
}
