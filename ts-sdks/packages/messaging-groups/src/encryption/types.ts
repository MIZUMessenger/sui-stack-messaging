// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Re-export types from encryption submodules for convenience.

export type { CryptoPrimitives } from './crypto-primitives.js';
export type { SealIdentity, GeneratedDEK, DEKManagerConfig } from './dek-manager.js';
export type {
	SessionKeyManagerConfig,
	RefreshSessionKeyCallback,
} from './session-key-manager.js';
export type {
	EnvelopeEncryptionConfig,
	EncryptedEnvelope,
	SealApproveBuilder,
} from './envelope-encryption.js';

export { IDENTITY_BYTES_LENGTH, DEK_LENGTH, NONCE_LENGTH } from './dek-manager.js';
