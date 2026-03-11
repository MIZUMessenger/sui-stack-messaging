// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MessagingGroupsPackageConfig } from './types.js';

export const TESTNET_MESSAGING_GROUPS_PACKAGE_CONFIG = {
	originalPackageId: '0x018459a3a1657a2c91cfff8e275178c99b3f3a5fac4714c9f83b72b71010a12f',
	latestPackageId: '0x018459a3a1657a2c91cfff8e275178c99b3f3a5fac4714c9f83b72b71010a12f',
	namespaceId: '0x5c22ec781c04bfd1fa43cd103f5b6658956b82484c07a172b74a573163347149',
	versionId: '0x6af57f7b3c56cd1f9c3099056fc9e2831b69a43b8776b91096299386a59cbf91',
} satisfies MessagingGroupsPackageConfig;

export const MAINNET_MESSAGING_GROUPS_PACKAGE_CONFIG = {
	originalPackageId: '0xTBD',
	latestPackageId: '0xTBD',
	namespaceId: '0xTBD',
	versionId: '0xTBD',
} satisfies MessagingGroupsPackageConfig;

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
