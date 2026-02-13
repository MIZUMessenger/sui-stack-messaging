// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { PermissionedGroupsClient } from '@mysten/permissioned-groups';
import type { SealClient, SessionKey } from '@mysten/seal';
import type { Signer } from '@mysten/sui/cryptography';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import type { TransactionArgument } from '@mysten/sui/transactions';

import type { CryptoPrimitives } from './encryption/crypto-primitives.js';
import type { SealPolicy } from './encryption/seal-policy.js';

// === Package Configuration ===

/**
 * Configuration for the messaging Move package.
 * This is managed by us and provided in constants for testnet/mainnet.
 */
export type MessagingGroupsPackageConfig = {
	/** The messaging package ID */
	packageId: string;
	/** The MessagingNamespace shared object ID */
	namespaceId: string;
};

/**
 * A client that has been extended with the PermissionedGroupsClient and SealClient.
 * The messaging client requires both extensions to be present.
 *
 * The generic parameters allow consumers to use custom extension names
 * (e.g., `permissionedGroups({ name: 'permissions' })` or registering
 * SealClient under a name other than `'seal'`).
 */
export type MessagingGroupsCompatibleClient<
	GroupsName extends string = 'groups',
	SealName extends string = 'seal',
> = ClientWithCoreApi & {
	[K in GroupsName]: PermissionedGroupsClient;
} & {
	[K in SealName]: SealClient;
};

// === Session Key Configuration ===

/** Shared options for SDK-managed session key creation (Tier 1 & 2). */
interface SessionKeySharedOptions {
	/** Session key TTL in minutes (default: 10). */
	ttlMin?: number;
	/** MVR name for Seal (optional). */
	mvrName?: string;
	/** Refresh session key this many ms before expiry (default: 60_000). */
	refreshBufferMs?: number;
}

/**
 * How the SDK obtains Seal session keys. Required at client creation.
 *
 * **Tier 1 — Signer-based** (dapp-kit-next `CurrentAccountSigner`, `Keypair`, Enoki):
 * SDK derives address via `signer.toSuiAddress()`, passes signer to
 * `SessionKey.create()`, and calls `getCertificate()`. Fully automatic.
 *
 * **Tier 2 — Callback-based** (current dapp-kit without Signer abstraction):
 * Consumer provides address + signing callback. SDK calls `SessionKey.create()`
 * without signer, then `getPersonalMessage()` → `onSign()` → `setPersonalMessageSignature()`.
 *
 * **Tier 3 — Full manual control** (power users, custom persistence, exotic flows):
 * Consumer manages the entire `SessionKey` lifecycle. SDK calls `getSessionKey()`
 * whenever it needs a key.
 */
export type SessionKeyConfig =
	| ({ signer: Signer } & SessionKeySharedOptions)
	| ({ address: string; onSign: (message: Uint8Array) => Promise<string> } & SessionKeySharedOptions)
	| { getSessionKey: () => Promise<SessionKey> | SessionKey };

/** Encryption-specific options for the messaging groups client. */
export interface MessagingGroupsEncryptionOptions<TApproveContext = void> {
	/** How session keys are obtained. Required. */
	sessionKey: SessionKeyConfig;
	/** Custom crypto primitives (default: Web Crypto). */
	cryptoPrimitives?: CryptoPrimitives;
	/** Seal threshold for DEK encryption (default: 2). */
	sealThreshold?: number;
	/**
	 * Custom Seal policy for `seal_approve` transaction building.
	 *
	 * When not provided, {@link DefaultSealPolicy} is used — targeting the messaging
	 * package's `seal_approve_reader`.
	 *
	 * Identity bytes are always `[groupId (32 bytes)][keyVersion (8 bytes LE u64)]`
	 * regardless of policy. Provide a custom policy to use a different package or
	 * access control logic (e.g., subscription-gated, NFT-gated, payment-based).
	 *
	 * The `TApproveContext` generic flows through to encrypt/decrypt operations —
	 * when `void` (default), no extra context is required.
	 */
	sealPolicy?: SealPolicy<TApproveContext>;
}

export interface MessagingGroupsClientOptions<
	TApproveContext = void,
	GroupsName extends string = 'groups',
	SealName extends string = 'seal',
> {
	client: MessagingGroupsCompatibleClient<GroupsName, SealName>;
	/** Name under which the PermissionedGroupsClient extension is registered (default: 'groups'). */
	groupsName: GroupsName;
	/** Name under which the SealClient extension is registered (default: 'seal'). */
	sealName: SealName;
	/**
	 * Custom package configuration for localnet, devnet, or custom deployments.
	 * When not provided, the config is auto-detected from the client's network.
	 */
	packageConfig?: MessagingGroupsPackageConfig;
	/** Encryption configuration (required — session key config must be set at creation). */
	encryption: MessagingGroupsEncryptionOptions<TApproveContext>;
}

// === Call/Tx Options (no signer) ===

/** Options for creating a new messaging group. */
export interface CreateGroupCallOptions {
	/**
	 * UUID for deterministic address derivation of the group and encryption history.
	 * Generated internally if omitted.
	 */
	uuid?: string;
	/**
	 * Addresses to grant MessagingReader permission on creation.
	 * The creator is automatically granted all permissions and should not be included.
	 */
	initialMembers?: string[];
}

/**
 * Options for rotating the encryption key.
 * The new DEK is generated and Seal-encrypted internally.
 *
 * Accepts either explicit `groupId` + `encryptionHistoryId`, or a `uuid`
 * (which derives both IDs internally).
 */
export type RotateEncryptionKeyCallOptions = GroupRef;

/** Options for granting all messaging permissions to a member */
export interface GrantAllMessagingPermissionsCallOptions {
	/** Object ID or TransactionArgument for the PermissionedGroup<Messaging> */
	groupId: string | TransactionArgument;
	/** Address of the member to grant permissions to */
	member: string | TransactionArgument;
}

/** Options for granting all permissions (admin + messaging) to a member */
export interface GrantAllPermissionsCallOptions {
	/** Object ID or TransactionArgument for the PermissionedGroup<Messaging> */
	groupId: string | TransactionArgument;
	/** Address of the member to grant permissions to */
	member: string | TransactionArgument;
}

// === Top-level Imperative Options (add signer) ===

/** Options for creating a group (imperative) */
export interface CreateGroupOptions extends CreateGroupCallOptions {
	/** Signer to execute the transaction */
	signer: Signer;
}

/** Options for rotating encryption key (imperative) */
export type RotateEncryptionKeyOptions = RotateEncryptionKeyCallOptions & {
	/** Signer to execute the transaction */
	signer: Signer;
};

/** Options for granting all messaging permissions (imperative) */
export interface GrantAllMessagingPermissionsOptions extends GrantAllMessagingPermissionsCallOptions {
	/** Signer to execute the transaction */
	signer: Signer;
}

/** Options for granting all permissions (imperative) */
export interface GrantAllPermissionsOptions extends GrantAllPermissionsCallOptions {
	/** Signer to execute the transaction */
	signer: Signer;
}

// === Shared Reference Types ===

/**
 * Reference to an EncryptionHistory — by object ID or by UUID (which derives the ID).
 * Exactly one must be provided.
 */
export type EncryptionHistoryRef =
	| { encryptionHistoryId: string; uuid?: never }
	| { uuid: string; encryptionHistoryId?: never };

/**
 * Reference to a group + encryption history pair — by explicit IDs or by UUID.
 *
 * Since both the `PermissionedGroup<Messaging>` and `EncryptionHistory` are derived
 * from the same UUID, providing a UUID derives both IDs internally.
 */
export type GroupRef =
	| { groupId: string; encryptionHistoryId: string; uuid?: never }
	| { uuid: string; groupId?: never; encryptionHistoryId?: never };

// === View Options ===

/** Options for getting the encrypted key at a specific version */
export type EncryptedKeyViewOptions = EncryptionHistoryRef & {
	/** Key version (0-indexed) */
	version: bigint | number;
};
