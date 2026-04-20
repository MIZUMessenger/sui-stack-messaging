// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { ClientWithCoreApi } from '@mysten/sui/client';
import { parseSerializedSignature } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { toHex } from '@mysten/sui/utils';
import type { PublicKey, Signer } from '@mysten/sui/cryptography';
import { getZkLoginSignature, toZkLoginPublicIdentifier } from '@mysten/sui/zklogin';
import { describe, expect, it, vi } from 'vitest';

import {
	buildCanonicalMessage,
	signMessageContent,
	verifyMessageSender,
} from '../../src/verification.js';

const MOCK_GROUP_ID = '0x' + 'ab'.repeat(32);
const ZKLOGIN_ISS = 'https://accounts.google.com';
const ZKLOGIN_ADDRESS_SEED = 1n;
const ZKLOGIN_ISS_DETAILS = {
	value: 'CJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLC',
	indexMod4: 1,
};

function makeMessageParams() {
	return {
		groupId: MOCK_GROUP_ID,
		encryptedText: new Uint8Array([0xca, 0xfe, 0xba, 0xbe]),
		nonce: new Uint8Array(12).fill(0x42),
		keyVersion: 3n,
	};
}

function createMockClient(verifyResult = true) {
	const verifyZkLoginSignature = vi.fn().mockResolvedValue({
		success: verifyResult,
		errors: [],
	});

	return {
		client: {
			core: {
				verifyZkLoginSignature,
			},
		} as unknown as ClientWithCoreApi,
		verifyZkLoginSignature,
	};
}

function createZkLoginFixture() {
	const publicKey = toZkLoginPublicIdentifier(ZKLOGIN_ADDRESS_SEED, ZKLOGIN_ISS, {
		legacyAddress: false,
	});
	const serializedSignature = getZkLoginSignature({
		inputs: {
			proofPoints: {
				a: ['1', '2', '3'],
				b: [
					['4', '5'],
					['6', '7'],
				],
				c: ['8', '9', '10'],
			},
			issBase64Details: ZKLOGIN_ISS_DETAILS,
			headerBase64: 'eyJhbGciOiJSUzI1NiJ9',
			addressSeed: ZKLOGIN_ADDRESS_SEED.toString(),
		},
		maxEpoch: 10n,
		userSignature: new Uint8Array(64).fill(7),
	});

	const signer = {
		async signPersonalMessage(bytes: Uint8Array) {
			return {
				bytes: Buffer.from(bytes).toString('base64'),
				signature: serializedSignature,
			};
		},
		getPublicKey(): PublicKey {
			return publicKey;
		},
		toSuiAddress() {
			return publicKey.toSuiAddress();
		},
	} as unknown as Signer;
	const parsedSignature = parseSerializedSignature(serializedSignature);

	if (!parsedSignature.signature) {
		throw new Error('Expected serialized zkLogin signature bytes');
	}

	return {
		signer,
		publicKey,
		serializedSignature,
		signatureBytes: parsedSignature.signature,
		senderAddress: publicKey.toSuiAddress(),
	};
}

describe('buildCanonicalMessage', () => {
	it('produces deterministic output for the same inputs', () => {
		const params = makeMessageParams();
		const a = buildCanonicalMessage(params);
		const b = buildCanonicalMessage(params);
		expect(a).toEqual(b);
	});

	it('produces the expected format: groupId:hex(encryptedText):hex(nonce):keyVersion', () => {
		const params = makeMessageParams();
		const bytes = buildCanonicalMessage(params);
		const str = new TextDecoder().decode(bytes);

		expect(str).toBe(
			`${MOCK_GROUP_ID}:${toHex(params.encryptedText)}:${toHex(params.nonce)}:${params.keyVersion}`,
		);
	});

	it('changes output when any field differs', () => {
		const base = makeMessageParams();
		const baseBytes = buildCanonicalMessage(base);

		// Different groupId
		const diffGroup = buildCanonicalMessage({
			...base,
			groupId: '0x' + 'cd'.repeat(32),
		});
		expect(diffGroup).not.toEqual(baseBytes);

		// Different encryptedText
		const diffText = buildCanonicalMessage({
			...base,
			encryptedText: new Uint8Array([0xde, 0xad]),
		});
		expect(diffText).not.toEqual(baseBytes);

		// Different nonce
		const diffNonce = buildCanonicalMessage({
			...base,
			nonce: new Uint8Array(12).fill(0x99),
		});
		expect(diffNonce).not.toEqual(baseBytes);

		// Different keyVersion
		const diffVersion = buildCanonicalMessage({ ...base, keyVersion: 99n });
		expect(diffVersion).not.toEqual(baseBytes);
	});
});

describe('signMessageContent', () => {
	it('returns a 64-byte hex-encoded signature for Ed25519 signers', async () => {
		const keypair = Ed25519Keypair.generate();
		const sig = await signMessageContent(keypair, makeMessageParams());

		// 64 bytes = 128 hex chars
		expect(sig).toHaveLength(128);
		// Should be valid hex
		expect(/^[0-9a-f]+$/.test(sig)).toBe(true);
	});

	it('produces different signatures for different messages', async () => {
		const keypair = Ed25519Keypair.generate();
		const sig1 = await signMessageContent(keypair, makeMessageParams());
		const sig2 = await signMessageContent(keypair, {
			...makeMessageParams(),
			keyVersion: 999n,
		});

		expect(sig1).not.toBe(sig2);
	});

	it('returns the full serialized zkLogin signature bytes as hex', async () => {
		const { signer, signatureBytes } = createZkLoginFixture();

		const sig = await signMessageContent(signer, makeMessageParams());

		expect(sig).toBe(toHex(signatureBytes));
		expect(sig.length).toBeGreaterThan(128);
	});
});

describe('verifyMessageSender', () => {
	it('returns true for a valid sign-then-verify roundtrip', async () => {
		const keypair = Ed25519Keypair.generate();
		const params = makeMessageParams();

		const signature = await signMessageContent(keypair, params);
		const publicKey = toHex(keypair.getPublicKey().toSuiBytes());

		const result = await verifyMessageSender({
			...params,
			senderAddress: keypair.toSuiAddress(),
			signature,
			publicKey,
		});

		expect(result).toBe(true);
	});

	it('returns false when encryptedText is tampered', async () => {
		const keypair = Ed25519Keypair.generate();
		const params = makeMessageParams();

		const signature = await signMessageContent(keypair, params);
		const publicKey = toHex(keypair.getPublicKey().toSuiBytes());

		const result = await verifyMessageSender({
			...params,
			encryptedText: new Uint8Array([0xde, 0xad]), // tampered
			senderAddress: keypair.toSuiAddress(),
			signature,
			publicKey,
		});

		expect(result).toBe(false);
	});

	it('returns false when nonce is tampered', async () => {
		const keypair = Ed25519Keypair.generate();
		const params = makeMessageParams();

		const signature = await signMessageContent(keypair, params);
		const publicKey = toHex(keypair.getPublicKey().toSuiBytes());

		const result = await verifyMessageSender({
			...params,
			nonce: new Uint8Array(12).fill(0xff), // tampered
			senderAddress: keypair.toSuiAddress(),
			signature,
			publicKey,
		});

		expect(result).toBe(false);
	});

	it('returns false when keyVersion is tampered', async () => {
		const keypair = Ed25519Keypair.generate();
		const params = makeMessageParams();

		const signature = await signMessageContent(keypair, params);
		const publicKey = toHex(keypair.getPublicKey().toSuiBytes());

		const result = await verifyMessageSender({
			...params,
			keyVersion: 999n, // tampered
			senderAddress: keypair.toSuiAddress(),
			signature,
			publicKey,
		});

		expect(result).toBe(false);
	});

	it('returns false when senderAddress does not match the signer', async () => {
		const keypair = Ed25519Keypair.generate();
		const otherKeypair = Ed25519Keypair.generate();
		const params = makeMessageParams();

		const signature = await signMessageContent(keypair, params);
		const publicKey = toHex(keypair.getPublicKey().toSuiBytes());

		const result = await verifyMessageSender({
			...params,
			senderAddress: otherKeypair.toSuiAddress(), // wrong sender
			signature,
			publicKey,
		});

		expect(result).toBe(false);
	});

	it('returns false when signature is from a different keypair', async () => {
		const keypair = Ed25519Keypair.generate();
		const otherKeypair = Ed25519Keypair.generate();
		const params = makeMessageParams();

		// Sign with otherKeypair but present keypair's publicKey
		const signature = await signMessageContent(otherKeypair, params);
		const publicKey = toHex(keypair.getPublicKey().toSuiBytes());

		const result = await verifyMessageSender({
			...params,
			senderAddress: keypair.toSuiAddress(),
			signature,
			publicKey,
		});

		expect(result).toBe(false);
	});

	it('returns false for garbage signature hex', async () => {
		const keypair = Ed25519Keypair.generate();
		const params = makeMessageParams();
		const publicKey = toHex(keypair.getPublicKey().toSuiBytes());

		const result = await verifyMessageSender({
			...params,
			senderAddress: keypair.toSuiAddress(),
			signature: '00'.repeat(64),
			publicKey,
		});

		expect(result).toBe(false);
	});

	it('returns false for invalid publicKey hex', async () => {
		const keypair = Ed25519Keypair.generate();
		const params = makeMessageParams();
		const signature = await signMessageContent(keypair, params);

		const result = await verifyMessageSender({
			...params,
			senderAddress: keypair.toSuiAddress(),
			signature,
			publicKey: 'not-valid-hex',
		});

		expect(result).toBe(false);
	});

	it('verifies zkLogin signatures when a client is available', async () => {
		const params = makeMessageParams();
		const { signer, publicKey, senderAddress, signatureBytes, serializedSignature } =
			createZkLoginFixture();
		const { client, verifyZkLoginSignature } = createMockClient(true);

		const signature = await signMessageContent(signer, params);
		expect(signature).toBe(toHex(signatureBytes));

		const result = await verifyMessageSender({
			...params,
			senderAddress,
			signature,
			publicKey: toHex(publicKey.toSuiBytes()),
			client,
		});

		expect(result).toBe(true);
		expect(verifyZkLoginSignature).toHaveBeenCalledOnce();
		expect(verifyZkLoginSignature).toHaveBeenCalledWith({
			address: senderAddress,
			bytes: Buffer.from(buildCanonicalMessage(params)).toString('base64'),
			signature: serializedSignature,
			intentScope: 'PersonalMessage',
		});
	});

	it('returns false for zkLogin signatures when no client is available', async () => {
		const params = makeMessageParams();
		const { signer, publicKey, senderAddress } = createZkLoginFixture();
		const signature = await signMessageContent(signer, params);

		const result = await verifyMessageSender({
			...params,
			senderAddress,
			signature,
			publicKey: toHex(publicKey.toSuiBytes()),
		});

		expect(result).toBe(false);
	});
});
