// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { ClientWithCoreApi } from '@mysten/sui/client';
import type { Signer, SignatureScheme } from '@mysten/sui/cryptography';
import {
	parseSerializedSignature,
	SIGNATURE_FLAG_TO_SCHEME,
	toSerializedSignature,
} from '@mysten/sui/cryptography';
import { fromHex, toBase64, toHex } from '@mysten/sui/utils';
import { publicKeyFromSuiBytes, verifyPersonalMessageSignature } from '@mysten/sui/verify';

const COMPACT_SIGNATURE_SCHEMES = new Set<SignatureScheme>([
	'ED25519',
	'Secp256k1',
	'Secp256r1',
]);

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;

	for (let i = 0; i < a.length; i += 1) {
		if (a[i] !== b[i]) return false;
	}

	return true;
}

// ── Canonical message ────────────────────────────────────────────

/**
 * Build the canonical message bytes that are signed per-message.
 *
 * Format: `"{groupId}:{hex(encryptedText)}:{hex(nonce)}:{keyVersion}"`
 *
 * This matches the relayer's `verify_message_signature` canonical string.
 */
export function buildCanonicalMessage(params: {
	groupId: string;
	encryptedText: Uint8Array;
	nonce: Uint8Array;
	keyVersion: bigint;
}): Uint8Array {
	const canonical = `${params.groupId}:${toHex(params.encryptedText)}:${toHex(params.nonce)}:${params.keyVersion}`;
	return new TextEncoder().encode(canonical);
}

// ── Signing ──────────────────────────────────────────────────────

/**
 * Sign the per-message canonical content.
 * Returns hex-encoded signature bytes.
 * Keypair schemes use the raw 64-byte signature; zkLogin uses the serialized authenticator bytes.
 */
export async function signMessageContent(
	signer: Signer,
	params: {
		groupId: string;
		encryptedText: Uint8Array;
		nonce: Uint8Array;
		keyVersion: bigint;
	},
): Promise<string> {
	const canonicalBytes = buildCanonicalMessage(params);
	const { signature } = await signer.signPersonalMessage(canonicalBytes);
	const parsed = parseSerializedSignature(signature);
	if (!parsed.signature) {
		throw new Error('Unsupported signature scheme: relayer auth requires extractable signature bytes');
	}
	return toHex(parsed.signature);
}

// ── Verification ─────────────────────────────────────────────────

export interface VerifyMessageSenderParams {
	groupId: string;
	encryptedText: Uint8Array;
	nonce: Uint8Array;
	keyVersion: bigint;
	senderAddress: string;
	/** Hex-encoded signature bytes. Keypair schemes use raw 64-byte signatures; zkLogin uses serialized authenticator bytes. */
	signature: string;
	/** Hex-encoded public key with scheme flag prefix (as returned by the relayer). */
	publicKey: string;
	client?: ClientWithCoreApi;
}

/**
 * Verify that a message was signed by the claimed sender.
 *
 * Reconstructs the canonical message from the ciphertext fields,
 * rebuilds or reuses the serialized signature according to the signing scheme,
 * then verifies using `verifyPersonalMessageSignature`.
 *
 * @returns `true` if the signature is valid and the derived address matches `senderAddress`.
 */
export async function verifyMessageSender(params: VerifyMessageSenderParams): Promise<boolean> {
	try {
		const canonicalBytes = buildCanonicalMessage(params);
		const signatureBytes = fromHex(params.signature);
		const pubKeyBytes = fromHex(params.publicKey);

		const flag = pubKeyBytes[0] as keyof typeof SIGNATURE_FLAG_TO_SCHEME;
		const signatureScheme = SIGNATURE_FLAG_TO_SCHEME[flag];
		if (!signatureScheme) return false;

		const publicKey = publicKeyFromSuiBytes(pubKeyBytes, {
			address: params.senderAddress,
			client: params.client,
		});

		let serializedSignature: string;

		if (COMPACT_SIGNATURE_SCHEMES.has(signatureScheme)) {
			serializedSignature = toSerializedSignature({
				signatureScheme,
				signature: signatureBytes,
				publicKey,
			});
		} else if (signatureScheme === 'ZkLogin') {
			const parsedSignature = parseSerializedSignature(toBase64(signatureBytes));
			if (parsedSignature.signatureScheme !== 'ZkLogin') {
				return false;
			}
			if (!bytesEqual(parsedSignature.publicKey, pubKeyBytes.slice(1))) {
				return false;
			}
			serializedSignature = parsedSignature.serializedSignature;
		} else {
			return false;
		}

		const verifiedKey = await verifyPersonalMessageSignature(canonicalBytes, serializedSignature, {
			address: params.senderAddress,
			client: params.client,
		});
		return verifiedKey.toSuiAddress() === params.senderAddress;
	} catch {
		return false;
	}
}
