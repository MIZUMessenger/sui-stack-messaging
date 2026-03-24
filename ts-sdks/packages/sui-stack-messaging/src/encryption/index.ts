// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Types (re-exports from submodules)
export type {
	CryptoPrimitives,
	GeneratedDEK,
	DEKManagerConfig,
	EnvelopeEncryptionConfig,
	EncryptedEnvelope,
	EncryptOptions,
	DecryptOptions,
	SealPolicy,
} from './types.js';

export { DEK_LENGTH, NONCE_LENGTH } from './types.js';

// Crypto primitives
export { WebCryptoPrimitives, getDefaultCryptoPrimitives } from './crypto-primitives.js';

// DEK Manager
export { DEKManager } from './dek-manager.js';

// Seal Policy
export { DefaultSealPolicy } from './seal-policy.js';

// Envelope Encryption
export { EnvelopeEncryption, buildMessageAad } from './envelope-encryption.js';
