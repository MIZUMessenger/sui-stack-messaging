// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiGroupsClient } from '@mysten/sui-groups';
import type { SealClient, SessionKey } from '@mysten/seal';
import type { Signer } from '@mysten/sui/cryptography';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import type { TransactionArgument } from '@mysten/sui/transactions';

import type { AttachmentsConfig } from './attachments/types.js';
import type { SuinsConfig } from './constants.js';
import type { CryptoPrimitives } from './encryption/crypto-primitives.js';
import type { SealPolicy } from './encryption/seal-policy.js';
import type { RelayerConfig } from './relayer/types.js';
import type { RecoveryTransport } from './recovery/transport.js';

// === Package Configuration ===

/**
 * Configuration for the messaging Move package.
 * This is managed by us and provided in constants for testnet/mainnet.
 *
 * See {@link SuiGroupsPackageConfig} for a detailed explanation of
 * the `originalPackageId` / `latestPackageId` split.
 */
export type SuiStackMessagingPackageConfig = {
	/** The original (V1) package ID. Used for TypeName strings, BCS, Seal namespace, and deriveObjectID. */
	originalPackageId: string;
	/** The latest (current) package ID. Used for moveCall targets. Equals originalPackageId before any upgrade. */
	latestPackageId: string;
	/** The MessagingNamespace shared object ID */
	namespaceId: string;
	/** The Version shared object ID (used for contract upgrade version gating) */
	versionId: string;
};

/**
 * A client that has been extended with the SuiGroupsClient and SealClient.
 * The messaging client requires both extensions to be present.
 *
 * The generic parameters allow consumers to use custom extension names
 * (e.g., `suiGroups({ name: 'permissions' })` or registering
 * SealClient under a name other than `'seal'`).
 */
export type SuiStackMessagingCompatibleClient<
	GroupsName extends string = 'groups',
	SealName extends string = 'seal',
> = ClientWithCoreApi & {
	[K in GroupsName]: SuiGroupsClient;
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
	| ({
			address: string;
			onSign: (message: Uint8Array) => Promise<string>;
	  } & SessionKeySharedOptions)
	| { getSessionKey: () => Promise<SessionKey> | SessionKey };

/** Encryption-specific options for the messaging groups client. */
export interface SuiStackMessagingEncryptionOptions<TApproveContext = void> {
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

export interface SuiStackMessagingClientOptions<
	TApproveContext = void,
	GroupsName extends string = 'groups',
	SealName extends string = 'seal',
> {
	client: SuiStackMessagingCompatibleClient<GroupsName, SealName>;
	/** Name under which the SuiGroupsClient extension is registered (default: 'groups'). */
	groupsName: GroupsName;
	/** Name under which the SealClient extension is registered (default: 'seal'). */
	sealName: SealName;
	/**
	 * Custom package configuration for localnet, devnet, or custom deployments.
	 * When not provided, the config is auto-detected from the client's network.
	 */
	packageConfig?: SuiStackMessagingPackageConfig;
	/** SuiNS config for reverse lookup operations (auto-detected for testnet/mainnet). */
	suinsConfig?: SuinsConfig;
	/** Encryption configuration (required — session key config must be set at creation). */
	encryption: SuiStackMessagingEncryptionOptions<TApproveContext>;
	/** Relayer transport configuration. */
	relayer: RelayerConfig;
	/**
	 * Attachment support. When omitted, messages cannot include files,
	 * and received attachments are not resolvable.
	 */
	attachments?: AttachmentsConfig;
	/**
	 * Optional recovery transport for fetching messages from an alternative
	 * storage backend (e.g., Walrus). When provided, enables the
	 * `recoverMessages()` method on the client.
	 */
	recovery?: RecoveryTransport;
}

// === Call/Tx Options (no signer) ===

/** Options for creating a new messaging group. */
export interface CreateGroupCallOptions {
	/**
	 * UUID for deterministic address derivation of the group and encryption history.
	 * Generated internally if omitted.
	 */
	uuid?: string;
	/** Human-readable group name. */
	name: string;
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

/** Options for sharing the objects returned by `createGroup`. */
export interface ShareGroupCallOptions {
	/** The PermissionedGroup<Messaging> result from `createGroup` */
	group: TransactionArgument;
	/** The EncryptionHistory result from `createGroup` */
	encryptionHistory: TransactionArgument;
}

/** Options for leaving a messaging group. */
export interface LeaveCallOptions {
	/** Object ID or TransactionArgument for the PermissionedGroup<Messaging> */
	groupId: string | TransactionArgument;
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

/** Options for leaving a group (imperative) */
export interface LeaveOptions extends LeaveCallOptions {
	/** Signer to execute the transaction */
	signer: Signer;
}

/** Options for atomically removing members and rotating the encryption key (call-level). */
export type RemoveMembersAndRotateKeyCallOptions = GroupRef & {
	/** Addresses of the members to remove. */
	members: string[];
};

/** Options for removeMembersAndRotateKey (imperative, with signer). */
export type RemoveMembersAndRotateKeyOptions = RemoveMembersAndRotateKeyCallOptions & {
	signer: Signer;
};

/** Options for archiving a group (call-level, no signer). */
export interface ArchiveGroupCallOptions {
	/** Object ID of the PermissionedGroup<Messaging> */
	groupId: string;
}

/** Options for setting the group name (call-level, no signer). */
export interface SetGroupNameCallOptions {
	/** Object ID of the PermissionedGroup<Messaging> */
	groupId: string;
	/** The new human-readable name for the group */
	name: string;
}

/** Options for inserting a key-value pair into group metadata (call-level, no signer). */
export interface InsertGroupDataCallOptions {
	/** Object ID of the PermissionedGroup<Messaging> */
	groupId: string;
	/** The metadata key */
	key: string;
	/** The metadata value */
	value: string;
}

/** Options for removing a key-value pair from group metadata (call-level, no signer). */
export interface RemoveGroupDataCallOptions {
	/** Object ID of the PermissionedGroup<Messaging> */
	groupId: string;
	/** The metadata key to remove */
	key: string;
}

/** Options for archiving a group (imperative, with signer). */
export interface ArchiveGroupOptions extends ArchiveGroupCallOptions {
	signer: Signer;
}

/** Options for setting the group name (imperative, with signer). */
export interface SetGroupNameOptions extends SetGroupNameCallOptions {
	signer: Signer;
}

/** Options for inserting group data (imperative, with signer). */
export interface InsertGroupDataOptions extends InsertGroupDataCallOptions {
	signer: Signer;
}

/** Options for removing group data (imperative, with signer). */
export interface RemoveGroupDataOptions extends RemoveGroupDataCallOptions {
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

// === SuiNS Reverse Lookup Options ===

/** Options for setting a SuiNS reverse lookup on a group (call-level, no signer). */
export interface SetSuinsReverseLookupCallOptions {
	/** Object ID of the PermissionedGroup<Messaging> */
	groupId: string;
	/** The SuiNS domain name to set as the reverse lookup */
	domainName: string;
}

/** Options for unsetting a SuiNS reverse lookup on a group (call-level, no signer). */
export interface UnsetSuinsReverseLookupCallOptions {
	/** Object ID of the PermissionedGroup<Messaging> */
	groupId: string;
}

/** Options for setting a SuiNS reverse lookup (imperative, with signer). */
export interface SetSuinsReverseLookupOptions extends SetSuinsReverseLookupCallOptions {
	/** Signer to execute the transaction */
	signer: Signer;
}

/** Options for unsetting a SuiNS reverse lookup (imperative, with signer). */
export interface UnsetSuinsReverseLookupOptions extends UnsetSuinsReverseLookupCallOptions {
	/** Signer to execute the transaction */
	signer: Signer;
}

// === View Options ===

/** Options for getting the encrypted key at a specific version */
export type EncryptedKeyViewOptions = EncryptionHistoryRef & {
	/** Key version (0-indexed) */
	version: bigint | number;
};
