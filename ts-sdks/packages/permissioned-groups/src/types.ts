// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { BcsType } from '@mysten/sui/bcs';
import type { Signer } from '@mysten/sui/cryptography';
import type { ClientWithCoreApi } from '@mysten/sui/experimental';
import type { TransactionArgument } from '@mysten/sui/transactions';

// === Package Configuration ===

/**
 * Configuration for the permissioned_groups Move package.
 * This is managed by us and provided in constants for testnet/mainnet.
 */
export type PermissionedGroupsPackageConfig = {
	packageId: string;
};

export interface PermissionedGroupsCompatibleClient extends ClientWithCoreApi {}

export interface PermissionedGroupsClientOptions {
	client: PermissionedGroupsCompatibleClient;
	/**
	 * The witness type from the extending package that scopes permissions.
	 * This must be the full type path including package ID and module
	 * (e.g., '0xabc::my_module::MY_WITNESS').
	 *
	 * The witness type exists in the extending Move package (not in permissioned_groups),
	 * so this must always be provided by the user/extending SDK.
	 */
	witnessType: string;
	/**
	 * Custom package configuration for localnet, devnet, or custom deployments.
	 * When not provided, the config is auto-detected from the client's network.
	 */
	packageConfig?: PermissionedGroupsPackageConfig;
}

// === Call/Tx Options (no signer) ===

/** Options for creating a derived PermissionedGroup */
export interface NewDerivedGroupCallOptions<
	DerivationKey extends BcsType<unknown> = BcsType<unknown>,
> {
	/** The type name of the derivation key (e.g., '0xabc::my_app::ChannelKey') */
	derivationKeyType: string;
	/** Object ID or TransactionArgument for the parent UID */
	derivationUid: string | TransactionArgument;
	/** The derivation key value (BCS-serializable or TransactionArgument) */
	derivationKey: DerivationKey | TransactionArgument;
}

/** Options for granting a permission to a member */
export interface GrantPermissionCallOptions {
	/** Object ID or TransactionArgument for the PermissionedGroup */
	groupId: string | TransactionArgument;
	/** Address of the member */
	member: string | TransactionArgument;
	/** The permission type to grant (e.g., '0xabc::my_app::Editor') */
	permissionType: string;
}

/** Options for granting permission via an actor object */
export interface ObjectGrantPermissionCallOptions {
	/** Object ID or TransactionArgument for the PermissionedGroup */
	groupId: string | TransactionArgument;
	/** Object ID or TransactionArgument for the actor object's UID */
	actorObjectUid: string | TransactionArgument;
	/** The permission type to grant */
	permissionType: string;
}

/** Options for revoking a permission from a member */
export interface RevokePermissionCallOptions {
	/** Object ID or TransactionArgument for the PermissionedGroup */
	groupId: string | TransactionArgument;
	/** Address of the member */
	member: string | TransactionArgument;
	/** The permission type to revoke */
	permissionType: string;
}

/** Options for revoking permission via an actor object */
export interface ObjectRevokePermissionCallOptions {
	/** Object ID or TransactionArgument for the PermissionedGroup */
	groupId: string | TransactionArgument;
	/** Object ID or TransactionArgument for the actor object's UID */
	actorObjectUid: string | TransactionArgument;
	/** The permission type to revoke */
	permissionType: string;
}

/** Options for removing a member from the group */
export interface RemoveMemberCallOptions {
	/** Object ID or TransactionArgument for the PermissionedGroup */
	groupId: string | TransactionArgument;
	/** Address of the member to remove */
	member: string | TransactionArgument;
}

/** Options for removing a member via an actor object */
export interface ObjectRemoveMemberCallOptions {
	/** Object ID or TransactionArgument for the PermissionedGroup */
	groupId: string | TransactionArgument;
	/** Object ID or TransactionArgument for the actor object's UID */
	actorObjectUid: string | TransactionArgument;
}

// === Top-level Imperative Options (add signer) ===

/** Options for creating a new group (imperative) */
export interface NewGroupOptions {
	/** Signer to execute the transaction */
	signer: Signer;
}

/** Options for creating a derived group (imperative) */
export interface NewDerivedGroupOptions extends NewDerivedGroupCallOptions {
	/** Signer to execute the transaction */
	signer: Signer;
}

/** Options for granting permission (imperative) */
export interface GrantPermissionOptions extends GrantPermissionCallOptions {
	/** Signer to execute the transaction */
	signer: Signer;
}

/** Options for granting permission via actor object (imperative) */
export interface ObjectGrantPermissionOptions extends ObjectGrantPermissionCallOptions {
	/** Signer to execute the transaction */
	signer: Signer;
}

/** Options for revoking permission (imperative) */
export interface RevokePermissionOptions extends RevokePermissionCallOptions {
	/** Signer to execute the transaction */
	signer: Signer;
}

/** Options for revoking permission via actor object (imperative) */
export interface ObjectRevokePermissionOptions extends ObjectRevokePermissionCallOptions {
	/** Signer to execute the transaction */
	signer: Signer;
}

/** Options for removing member (imperative) */
export interface RemoveMemberOptions extends RemoveMemberCallOptions {
	/** Signer to execute the transaction */
	signer: Signer;
}

/** Options for removing member via actor object (imperative) */
export interface ObjectRemoveMemberOptions extends ObjectRemoveMemberCallOptions {
	/** Signer to execute the transaction */
	signer: Signer;
}

// === View Options (use string IDs for devInspect) ===

/** Options for checking if a member has a specific permission */
export interface HasPermissionViewOptions {
	/** Object ID of the PermissionedGroup */
	groupId: string;
	/** Address to check */
	member: string;
	/** The permission type to check */
	permissionType: string;
}

/** Options for checking if an address is a member */
export interface IsMemberViewOptions {
	/** Object ID of the PermissionedGroup */
	groupId: string;
	/** Address to check */
	member: string;
}

/** Options for getting the group creator */
export interface CreatorViewOptions {
	/** Object ID of the PermissionedGroup */
	groupId: string;
}

/** Options for getting the administrators count */
export interface AdministratorsCountViewOptions {
	/** Object ID of the PermissionedGroup */
	groupId: string;
}
