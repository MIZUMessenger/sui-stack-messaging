// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Re-export types from encryption submodules for convenience.

export type { CryptoPrimitives } from './crypto-primitives.js';
export type { GeneratedDEK, DEKManagerConfig } from './dek-manager.js';
export type {
	EnvelopeEncryptionConfig,
	EncryptedEnvelope,
	EncryptOptions,
	DecryptOptions,
} from './envelope-encryption.js';
export type { SealPolicy } from './seal-policy.js';

export { DEK_LENGTH, NONCE_LENGTH } from './dek-manager.js';
