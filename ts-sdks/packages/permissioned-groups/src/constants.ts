// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { PermissionedGroupsPackageConfig } from './types.js';

export const TESTNET_PERMISSIONED_GROUPS_PACKAGE_CONFIG = {
	packageId: '0xTBD',
} satisfies PermissionedGroupsPackageConfig;

export const MAINNET_PERMISSIONED_GROUPS_PACKAGE_CONFIG = {
	packageId: '0xTBD',
} satisfies PermissionedGroupsPackageConfig;

/**
 * The derivation key used to derive the PermissionsTable from a PermissionedGroup.
 * Must match the Move constant `PERMISSIONS_TABLE_DERIVATION_KEY_BYTES` in `permissioned_group.move`.
 */
export const PERMISSIONS_TABLE_DERIVATION_KEY = 'permissions_table';

/**
 * Returns full Move type paths for all core permissions defined in the permissioned-groups package.
 *
 * @example
 * ```ts
 * const perms = permissionTypes('0xabc...');
 * // perms.PermissionsAdmin === '0xabc...::permissioned_group::PermissionsAdmin'
 *
 * await client.groups.grantPermission({
 *   groupId, member, signer,
 *   permissionType: perms.PermissionsAdmin,
 * });
 * ```
 */
export function permissionTypes(packageId: string) {
	return {
		PermissionsAdmin: `${packageId}::permissioned_group::PermissionsAdmin`,
		ExtensionPermissionsAdmin: `${packageId}::permissioned_group::ExtensionPermissionsAdmin`,
		ObjectAdmin: `${packageId}::permissioned_group::ObjectAdmin`,
	} as const;
}

/**
 * Returns the full Move type name for `PermissionedGroup<T>`.
 *
 * @param packageId - The permissioned-groups package ID
 * @param witnessType - The witness type parameter (e.g., `0xdef::messaging::Messaging`)
 */
export function permissionedGroupType(packageId: string, witnessType: string): string {
	return `${packageId}::permissioned_group::PermissionedGroup<${witnessType}>`;
}
