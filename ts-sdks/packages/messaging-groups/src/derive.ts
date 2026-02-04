// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { bcs } from '@mysten/sui/bcs';
import { deriveObjectID } from '@mysten/sui/utils';

import type { MessagingGroupsPackageConfig } from './types.js';

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
		const typeTag = `${this.#packageConfig.packageId}::encryption_history::PermissionedGroupTag`;
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
		const typeTag = `${this.#packageConfig.packageId}::encryption_history::EncryptionHistoryTag`;
		const key = bcs.string().serialize(options.uuid).toBytes();
		return deriveObjectID(this.#packageConfig.namespaceId, typeTag, key);
	}
}
