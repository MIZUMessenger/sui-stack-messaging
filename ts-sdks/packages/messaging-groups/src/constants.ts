// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MessagingGroupsPackageConfig } from './types.js';

export const TESTNET_MESSAGING_GROUPS_PACKAGE_CONFIG = {
	packageId: '0xTBD',
	namespaceId: '0xTBD',
} satisfies MessagingGroupsPackageConfig;

export const MAINNET_MESSAGING_GROUPS_PACKAGE_CONFIG = {
	packageId: '0xTBD',
	namespaceId: '0xTBD',
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
 * Returns full Move type paths for all messaging-specific permissions.
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
	} as const;
}
