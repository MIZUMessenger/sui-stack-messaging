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
