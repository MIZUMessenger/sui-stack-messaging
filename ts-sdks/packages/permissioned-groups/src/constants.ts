// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { PermissionedGroupsPackageConfig } from './types.js';

export const TESTNET_PERMISSIONED_GROUPS_PACKAGE_CONFIG = {
	originalPackageId: '0x6d030f66a03be50cbf2fca8c74b665b0111d06e48cba2265f5b4b8414e2865a3',
	latestPackageId: '0x6d030f66a03be50cbf2fca8c74b665b0111d06e48cba2265f5b4b8414e2865a3',
} satisfies PermissionedGroupsPackageConfig;

export const MAINNET_PERMISSIONED_GROUPS_PACKAGE_CONFIG = {
	originalPackageId: '0xTBD',
	latestPackageId: '0xTBD',
} satisfies PermissionedGroupsPackageConfig;

/**
 * The derivation key used to derive the PermissionsTable from a PermissionedGroup.
 * Must match the Move constant `PERMISSIONS_TABLE_DERIVATION_KEY_BYTES` in `permissioned_group.move`.
 */
export const PERMISSIONS_TABLE_DERIVATION_KEY = 'permissions_table';

/**
 * Returns the full Move type name for the `PausedMarker` struct.
 * Used to derive the dynamic field ID that indicates a paused group.
 *
 * @param packageId - The **original (V1)** permissioned-groups package ID.
 */
export function pausedMarkerType(packageId: string): string {
	return `${packageId}::permissioned_group::PausedMarker`;
}

/**
 * Returns full Move type paths for all core permissions defined in the permissioned-groups package.
 *
 * @param packageId - The **original (V1)** package ID. The TypeNames stored in the
 *   PermissionsTable always use V1 addresses (via `type_name::with_original_ids`).
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
		GroupDeleter: `${packageId}::permissioned_group::GroupDeleter`,
	} as const;
}

/**
 * Returns the full Move type name for `PermissionedGroup<T>`.
 *
 * @param packageId - The **original (V1)** permissioned-groups package ID.
 *   TypeNames on-chain always use V1 addresses (via `type_name::with_original_ids`).
 * @param witnessType - The witness type parameter (e.g., `0xdef::messaging::Messaging`)
 */
export function permissionedGroupType(packageId: string, witnessType: string): string {
	return `${packageId}::permissioned_group::PermissionedGroup<${witnessType}>`;
}
