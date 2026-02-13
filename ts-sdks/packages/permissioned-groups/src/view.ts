// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs } from '@mysten/sui/bcs';
import { deriveDynamicFieldID, deriveObjectID } from '@mysten/sui/utils';

import { PERMISSIONS_TABLE_DERIVATION_KEY } from './constants.js';
import type {
	HasPermissionViewOptions,
	IsMemberViewOptions,
	PermissionedGroupsCompatibleClient,
	PermissionedGroupsPackageConfig,
} from './types.js';

/**
 * BCS type for dynamic field entries keyed by address with VecSet<TypeName> values.
 */
const DynamicFieldEntry = bcs.struct('Field', {
	id: bcs.Address,
	name: bcs.Address,
	value: bcs.vector(
		bcs.struct('TypeName', {
			name: bcs.string(),
		}),
	),
});

export interface PermissionedGroupsViewOptions {
	packageConfig: PermissionedGroupsPackageConfig;
	witnessType: string;
	client: PermissionedGroupsCompatibleClient;
}

/**
 * View methods for querying permissioned group state.
 *
 * These methods query on-chain state by fetching objects directly,
 * without requiring a signature or spending gas.
 *
 * Note: Fields like `creator` and `permissions_admin_count` are available
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

	constructor(options: PermissionedGroupsViewOptions) {
		this.#client = options.client;
	}

	/**
	 * Derives the PermissionsTable object ID from a PermissionedGroup ID.
	 *
	 * The PermissionsTable is a derived object from its parent PermissionedGroup,
	 * using the fixed derivation key "permissions_table" (as a Move `String`).
	 * This makes the table ID fully deterministic — no RPC call needed.
	 */
	#derivePermissionsTableId(groupId: string): string {
		const string_type =
			'0x0000000000000000000000000000000000000000000000000000000000000001::string::String';
		const keyBytes = bcs.string().serialize(PERMISSIONS_TABLE_DERIVATION_KEY).toBytes();
		return deriveObjectID(groupId, string_type, keyBytes);
	}

	/**
	 * Fetches a member's permissions from the group's permissions table.
	 * Returns null if the member is not in the group.
	 */
	async #getMemberPermissions(groupId: string, member: string): Promise<string[] | null> {
		const tableId = this.#derivePermissionsTableId(groupId);

		// Derive the dynamic field ID for this member's entry in the table.
		// Table entries use `address` as the key type.
		const memberBcs = bcs.Address.serialize(member).toBytes();
		const dynamicFieldId = deriveDynamicFieldID(tableId, 'address', memberBcs);

		try {
			const { object } = await this.#client.core.getObject({
				objectId: dynamicFieldId,
				include: { content: true },
			});
			const parsed = DynamicFieldEntry.parse(object.content);
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
