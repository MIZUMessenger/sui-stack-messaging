// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs } from '@mysten/sui/bcs';
import { deriveDynamicFieldID } from '@mysten/sui/utils';

import { PermissionedGroup } from './contracts/permissioned_groups/permissioned_group.js';
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
 * BCS type for Table dynamic field entries.
 * A Table stores entries as dynamic fields with the key as the field name
 * and a Field<K, V> struct as the value.
 */
const TableFieldValue = bcs.struct('Field', {
	id: bcs.Address,
	name: bcs.Address,
	value: bcs.vector(
		bcs.struct('TypeName', {
			name: bcs.string(),
		}),
	),
});

/**
 * View methods for querying permissioned group state.
 *
 * These methods query on-chain state by fetching objects directly,
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
	#client: PermissionedGroupsCompatibleClient;
	/** Cache for permissions table IDs (groupId -> tableId). Table IDs never change after creation. */
	#permissionsTableIdCache = new Map<string, string>();

	constructor(options: PermissionedGroupsViewOptions) {
		this.#client = options.client;
	}

	/**
	 * Fetches and parses the permissions table ID from a PermissionedGroup object.
	 * Results are cached since the table ID never changes after group creation.
	 */
	async #getPermissionsTableId(groupId: string): Promise<string> {
		const cached = this.#permissionsTableIdCache.get(groupId);
		if (cached) {
			return cached;
		}

		const { object } = await this.#client.core.getObject({ objectId: groupId });
		const content = await object.content;
		const parsed = PermissionedGroup.parse(content);
		const tableId = parsed.permissions.id.id;

		this.#permissionsTableIdCache.set(groupId, tableId);
		return tableId;
	}

	/**
	 * Fetches a member's permissions from the group's permissions table.
	 * Returns null if the member is not in the group.
	 */
	async #getMemberPermissions(groupId: string, member: string): Promise<string[] | null> {
		const tableId = await this.#getPermissionsTableId(groupId);

		// Derive the dynamic field ID for this member's entry in the table
		// Table entries use address as the key type
		const memberBcs = bcs.Address.serialize(member).toBytes();
		const dynamicFieldId = deriveDynamicFieldID(tableId, 'address', memberBcs);

		try {
			const { object } = await this.#client.core.getObject({ objectId: dynamicFieldId });
			const content = await object.content;
			const parsed = TableFieldValue.parse(content);
			return parsed.value.map((typeName) => typeName.name);
		} catch {
			// Object doesn't exist means member is not in the group
			return null;
		}
	}

	/**
	 * Checks if the given address has the specified permission.
	 *
	 * @param options.groupId - Object ID of the PermissionedGroup
	 * @param options.member - Address to check
	 * @param options.permissionType - The permission type to check (e.g., '0xabc::my_app::Editor')
	 * @returns `true` if the address has the permission, `false` otherwise
	 */
	async hasPermission(options: HasPermissionViewOptions): Promise<boolean> {
		const permissions = await this.#getMemberPermissions(options.groupId, options.member);
		if (permissions === null) {
			return false;
		}
		// Normalize the permission type to match Move's type_name format (no 0x prefix)
		const normalizedPermissionType = options.permissionType.replace(/^0x/, '');
		return permissions.includes(normalizedPermissionType);
	}

	/**
	 * Checks if the given address is a member of the group.
	 * A member is any address that has at least one permission.
	 *
	 * @param options.groupId - Object ID of the PermissionedGroup
	 * @param options.member - Address to check
	 * @returns `true` if the address is a member, `false` otherwise
	 */
	async isMember(options: IsMemberViewOptions): Promise<boolean> {
		const permissions = await this.#getMemberPermissions(options.groupId, options.member);
		return permissions !== null;
	}
}
