// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { PermissionedGroupsClient } from '@mysten/permissioned-groups';
import type { Signer } from '@mysten/sui/cryptography';
import type { ClientWithCoreApi } from '@mysten/sui/experimental';
import type { TransactionArgument } from '@mysten/sui/transactions';

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
 * A client that has been extended with the PermissionedGroupsClient.
 * The messaging client requires this extension to be present.
 */
export interface MessagingGroupsCompatibleClient extends ClientWithCoreApi {
	/** The permissioned-groups extension (required) */
	groups: PermissionedGroupsClient;
	// Future: seal?: SealClient;
}

export interface MessagingGroupsClientOptions {
	client: MessagingGroupsCompatibleClient;
	/**
	 * Custom package configuration for localnet, devnet, or custom deployments.
	 * When not provided, the config is auto-detected from the client's network.
	 */
	packageConfig?: MessagingGroupsPackageConfig;
}

// === Call/Tx Options (no signer) ===

/** Options for creating a new messaging group */
export interface CreateGroupCallOptions {
	/** Client-provided UUID for deterministic address derivation of the group and encryption history */
	uuid: string;
	/**
	 * Initial Seal-encrypted DEK bytes.
	 * Contains identity bytes format: [group_id (32 bytes)][key_version (8 bytes LE u64)]
	 */
	initialEncryptedDek: Uint8Array | number[];
	/**
	 * Addresses to grant MessagingReader permission on creation.
	 * The creator is automatically granted all permissions and should not be included.
	 */
	initialMembers?: string[];
}

/** Options for rotating the encryption key */
export interface RotateEncryptionKeyCallOptions {
	/** Object ID or TransactionArgument for the EncryptionHistory */
	encryptionHistoryId: string | TransactionArgument;
	/** Object ID or TransactionArgument for the PermissionedGroup<Messaging> */
	groupId: string | TransactionArgument;
	/** New Seal-encrypted DEK bytes */
	newEncryptedDek: Uint8Array | number[];
}

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
export interface RotateEncryptionKeyOptions extends RotateEncryptionKeyCallOptions {
	/** Signer to execute the transaction */
	signer: Signer;
}

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

// === View Options ===

/**
 * Reference to an EncryptionHistory — by object ID or by UUID (which derives the ID).
 * Exactly one must be provided.
 */
export type EncryptionHistoryRef =
	| { encryptionHistoryId: string; uuid?: never }
	| { uuid: string; encryptionHistoryId?: never };

/** Options for getting the encrypted key at a specific version */
export type EncryptedKeyViewOptions = EncryptionHistoryRef & {
	/** Key version (0-indexed) */
	version: bigint | number;
};
