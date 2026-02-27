// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs } from '@mysten/sui/bcs';
import { deriveObjectID } from '@mysten/sui/utils';

import { GROUP_LEAVER_DERIVATION_KEY, GROUP_MANAGER_DERIVATION_KEY } from './constants.js';
import type { GroupRef, MessagingGroupsPackageConfig } from './types.js';

export interface MessagingGroupsDeriveOptions {
	packageConfig: MessagingGroupsPackageConfig;
}

/**
 * Deterministic address derivation for messaging group objects.
 *
 * Given a UUID and the namespace configuration, derives the on-chain object IDs
 * for both the `PermissionedGroup<Messaging>` and `EncryptionHistory` objects.
 *
 * These derivations are pure and synchronous — no network calls needed.
 *
 * @example
 * ```ts
 * const uuid = crypto.randomUUID();
 * const groupId = client.messaging.derive.groupId({ uuid });
 * const encryptionHistoryId = client.messaging.derive.encryptionHistoryId({ uuid });
 * ```
 */
export class MessagingGroupsDerive {
	#packageConfig: MessagingGroupsPackageConfig;

	constructor(options: MessagingGroupsDeriveOptions) {
		this.#packageConfig = options.packageConfig;
	}

	/**
	 * Derive the `PermissionedGroup<Messaging>` object ID from a UUID.
	 *
	 * @param options.uuid - The client-provided UUID used at group creation
	 * @returns The deterministic object ID for the PermissionedGroup
	 */
	groupId(options: { uuid: string }): string {
		const typeTag = `${this.#packageConfig.originalPackageId}::encryption_history::PermissionedGroupTag`;
		const key = bcs.string().serialize(options.uuid).toBytes();
		return deriveObjectID(this.#packageConfig.namespaceId, typeTag, key);
	}

	/**
	 * Derive the `EncryptionHistory` object ID from a UUID.
	 *
	 * @param options.uuid - The client-provided UUID used at group creation
	 * @returns The deterministic object ID for the EncryptionHistory
	 */
	encryptionHistoryId(options: { uuid: string }): string {
		const typeTag = `${this.#packageConfig.originalPackageId}::encryption_history::EncryptionHistoryTag`;
		const key = bcs.string().serialize(options.uuid).toBytes();
		return deriveObjectID(this.#packageConfig.namespaceId, typeTag, key);
	}

	/**
	 * Resolve a {@link GroupRef} to explicit `groupId` and `encryptionHistoryId`.
	 *
	 * When the ref contains a `uuid`, both IDs are derived deterministically.
	 * When explicit IDs are provided, they are returned as-is.
	 */
	resolveGroupRef(ref: GroupRef): { groupId: string; encryptionHistoryId: string } {
		if ('uuid' in ref && ref.uuid) {
			return {
				groupId: this.groupId({ uuid: ref.uuid }),
				encryptionHistoryId: this.encryptionHistoryId({ uuid: ref.uuid }),
			};
		}
		return {
			groupId: (ref as { groupId: string }).groupId,
			encryptionHistoryId: (ref as { encryptionHistoryId: string }).encryptionHistoryId,
		};
	}

	/**
	 * Derive the `GroupLeaver` singleton object ID.
	 *
	 * `GroupLeaver` is derived from `MessagingNamespace` with the fixed string key
	 * `GROUP_LEAVER_DERIVATION_KEY`. This matches the Move constant in `group_leaver.move`.
	 *
	 * @returns The deterministic object ID for the GroupLeaver shared object
	 */
	groupLeaverId(): string {
		const key = bcs.string().serialize(GROUP_LEAVER_DERIVATION_KEY).toBytes();
		return deriveObjectID(this.#packageConfig.namespaceId, '0x1::string::String', key);
	}

	/**
	 * Derive the `GroupManager` singleton object ID.
	 *
	 * `GroupManager` is derived from `MessagingNamespace` with the fixed string key
	 * `GROUP_MANAGER_DERIVATION_KEY`. This matches the Move constant in `group_manager.move`.
	 *
	 * @returns The deterministic object ID for the GroupManager shared object
	 */
	groupManagerId(): string {
		const key = bcs.string().serialize(GROUP_MANAGER_DERIVATION_KEY).toBytes();
		return deriveObjectID(this.#packageConfig.namespaceId, '0x1::string::String', key);
	}
}
