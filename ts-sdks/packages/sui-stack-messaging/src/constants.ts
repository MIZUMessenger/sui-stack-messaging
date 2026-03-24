// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SuiStackMessagingPackageConfig } from './types.js';

export const TESTNET_SUI_STACK_MESSAGING_PACKAGE_CONFIG = {
	originalPackageId: '0xd56dfe01c3f658368db54b2d87b31d5b05493ebb5005476aff296bb48bcaf273',
	latestPackageId: '0xd56dfe01c3f658368db54b2d87b31d5b05493ebb5005476aff296bb48bcaf273',
	namespaceId: '0xc2c3da35be0bbf6d6a3f99be07a492b4e62e1de09f92c318d4ac9b8ebccb5d81',
	versionId: '0x2c1bfb8fe43231981762475b2df0b69e4d42e95c430febe23d93f3655a40d2aa',
} satisfies SuiStackMessagingPackageConfig;

export const MAINNET_SUI_STACK_MESSAGING_PACKAGE_CONFIG = {
	originalPackageId: '0xTBD',
	latestPackageId: '0xTBD',
	namespaceId: '0xTBD',
	versionId: '0xTBD',
} satisfies SuiStackMessagingPackageConfig;

/**
 * Schema version for the Metadata dynamic field key.
 * Must match `METADATA_SCHEMA_VERSION` in `metadata.move`.
 */
export const METADATA_SCHEMA_VERSION = 1n;

/**
 * Returns the full Move type path for the `MetadataKey` struct.
 * Used to derive the dynamic field ID for Metadata on a group.
 *
 * @param packageId - The **original (V1)** messaging package ID.
 */
export function metadataKeyType(packageId: string): string {
	return `${packageId}::metadata::MetadataKey`;
}

/**
 * The derivation key used by `group_leaver.move` to derive the `GroupLeaver` singleton
 * from `MessagingNamespace`. Must match the Move constant `GROUP_LEAVER_DERIVATION_KEY`.
 *
 * NOTE: To avoid hardcoding this constant (and needing to keep it in sync with Move),
 * a future improvement could add a `view.ts` method that calls `group_leaver::derivation_key()`
 * via devInspect and caches the result. Deemed overengineering for now.
 */
export const GROUP_LEAVER_DERIVATION_KEY = 'group_leaver';

/**
 * The derivation key used by `group_manager.move` to derive the `GroupManager` singleton
 * from `MessagingNamespace`. Must match the Move constant `GROUP_MANAGER_DERIVATION_KEY`.
 */
export const GROUP_MANAGER_DERIVATION_KEY = 'group_manager';

// === SuiNS Configuration ===

/**
 * Configuration for the SuiNS shared object (needed for reverse lookup operations).
 *
 * - `suinsPackageId`: The published SuiNS package (contains `controller` module).
 * - `suinsObjectId`: The shared `SuiNS` object ID.
 */
export type SuinsConfig = {
	suinsPackageId: string;
	suinsObjectId: string;
};

export const TESTNET_SUINS_CONFIG = {
	suinsPackageId: '0x22fa05f21b1ad71442491220bb9338f7b7095fe35000ef88d5400d28523bdd93',
	suinsObjectId: '0x300369e8909b9a6464da265b9a5a9ab6fe2158a040e84e808628cde7a07ee5a3',
} satisfies SuinsConfig;

export const MAINNET_SUINS_CONFIG = {
	suinsPackageId: '0xd22b24490e0bae52676651b4f56660a5ff8022a2576e0089f79b3c88d44e08f0',
	suinsObjectId: '0x6e0ddefc0ad98889c04bab9639e512c21766c5e6366f89e696956d9be6952871',
} satisfies SuinsConfig;

/**
 * Returns full Move type paths for all messaging-specific permissions.
 *
 * @param packageId - The **original (V1)** package ID. The TypeNames stored in the
 *   PermissionsTable always use V1 addresses (via `type_name::with_original_ids`).
 *
 * @example
 * ```ts
 * const perms = messagingPermissionTypes('0xabc...');
 * // perms.MessagingSender === '0xabc...::messaging::MessagingSender'
 *
 * await client.groups.grantPermission({
 *   groupId, member, signer,
 *   permissionType: perms.MessagingSender,
 * });
 * ```
 */
export function messagingPermissionTypes(packageId: string) {
	return {
		MessagingSender: `${packageId}::messaging::MessagingSender`,
		MessagingReader: `${packageId}::messaging::MessagingReader`,
		MessagingEditor: `${packageId}::messaging::MessagingEditor`,
		MessagingDeleter: `${packageId}::messaging::MessagingDeleter`,
		EncryptionKeyRotator: `${packageId}::encryption_history::EncryptionKeyRotator`,
		SuiNsAdmin: `${packageId}::messaging::SuiNsAdmin`,
		MetadataAdmin: `${packageId}::messaging::MetadataAdmin`,
	} as const;
}

/**
 * Returns the baseline messaging permissions for a regular group member.
 *
 * Includes the four core messaging capabilities: send, read, edit, and delete.
 * Does **not** include group-management permissions (`EncryptionKeyRotator`,
 * `SuiNsAdmin`, `MetadataAdmin`) — grant those selectively to trusted members.
 *
 * @param packageId - The **original (V1)** messaging package ID.
 */
export function defaultMemberPermissionTypes(packageId: string) {
	const types = messagingPermissionTypes(packageId);
	return {
		MessagingSender: types.MessagingSender,
		MessagingReader: types.MessagingReader,
		MessagingEditor: types.MessagingEditor,
		MessagingDeleter: types.MessagingDeleter,
	} as const;
}
