// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { PermissionedGroupsNotImplementedError } from './error.js';
import type {
	HasPermissionViewOptions,
	IsMemberViewOptions,
	PermissionedGroupsCompatibleClient,
	PermissionedGroupsPackageConfig,
} from './types.js';

export interface PermissionedGroupsViewOptions {
	packageConfig: PermissionedGroupsPackageConfig;
	witnessType: string;
	client: PermissionedGroupsCompatibleClient;
}

/**
 * View methods for querying permissioned group state.
 *
 * These methods will use transaction simulation to read on-chain state
 * without requiring a signature or spending gas.
 *
 * Note: Fields like `creator` and `administrators_count` are available
 * directly on the PermissionedGroup object when fetched via getObject.
 *
 * @example
 * ```ts
 * const hasPerm = await client.groups.view.hasPermission({
 *   groupId: '0x456...',
 *   member: '0x789...',
 *   permissionType: '0xabc::my_app::Editor',
 * });
 *
 * const isMember = await client.groups.view.isMember({
 *   groupId: '0x456...',
 *   member: '0x789...',
 * });
 * ```
 */
export class PermissionedGroupsView {
	// Options stored for future use when the core API supports simulateTransaction.
	// eslint-disable-next-line @typescript-eslint/no-useless-constructor, @typescript-eslint/no-unused-vars
	constructor(_options: PermissionedGroupsViewOptions) {}

	/**
	 * Checks if the given address has the specified permission.
	 *
	 * @param options.groupId - Object ID of the PermissionedGroup
	 * @param options.member - Address to check
	 * @param options.permissionType - The permission type to check (e.g., '0xabc::my_app::Editor')
	 * @returns `true` if the address has the permission, `false` otherwise
	 *
	 * @throws {PermissionedGroupsNotImplementedError} This method is not yet implemented.
	 */
	async hasPermission(_options: HasPermissionViewOptions): Promise<boolean> {
		throw new PermissionedGroupsNotImplementedError(
			'hasPermission',
			'The core client API (ClientWithCoreApi) does not yet implement devInspectTransactionBlock. ' +
				'This will be implemented when simulateTransaction is added to the core API, ' +
				'which will provide commandResults containing Move function return values.',
		);
	}

	/**
	 * Checks if the given address is a member of the group.
	 * A member is any address that has at least one permission.
	 *
	 * @param options.groupId - Object ID of the PermissionedGroup
	 * @param options.member - Address to check
	 * @returns `true` if the address is a member, `false` otherwise
	 *
	 * @throws {PermissionedGroupsNotImplementedError} This method is not yet implemented.
	 */
	async isMember(_options: IsMemberViewOptions): Promise<boolean> {
		throw new PermissionedGroupsNotImplementedError(
			'isMember',
			'The core client API (ClientWithCoreApi) does not yet implement devInspectTransactionBlock. ' +
				'This will be implemented when simulateTransaction is added to the core API, ' +
				'which will provide commandResults containing Move function return values.',
		);
	}
}
