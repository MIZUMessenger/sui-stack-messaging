// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { MessagingGroupsNotImplementedError } from './error.js';
import type {
	EncryptedKeyViewOptions,
	EncryptionHistoryViewOptions,
	MessagingGroupsCompatibleClient,
	MessagingGroupsPackageConfig,
} from './types.js';

export interface MessagingGroupsViewOptions {
	packageConfig: MessagingGroupsPackageConfig;
	client: MessagingGroupsCompatibleClient;
}

/**
 * View methods for querying messaging group state.
 *
 * These methods will use transaction simulation to read on-chain state
 * without requiring a signature or spending gas.
 *
 * Note: For permission queries (hasPermission, isMember), use the
 * underlying permissioned-groups client: `client.groups.view.*`
 *
 * @example
 * ```ts
 * const version = await client.messaging.view.currentKeyVersion({
 *   encryptionHistoryId: '0x...',
 * });
 *
 * const encryptedDek = await client.messaging.view.currentEncryptedKey({
 *   encryptionHistoryId: '0x...',
 * });
 * ```
 */
export class MessagingGroupsView {
	// Options stored for future use when the core API supports simulateTransaction.
	// eslint-disable-next-line @typescript-eslint/no-useless-constructor, @typescript-eslint/no-unused-vars
	constructor(_options: MessagingGroupsViewOptions) {}

	/**
	 * Returns the total number of groups created via the namespace.
	 *
	 * @throws {MessagingGroupsNotImplementedError} This method is not yet implemented.
	 */
	async groupsCreated(): Promise<bigint> {
		throw new MessagingGroupsNotImplementedError(
			'groupsCreated',
			'The core client API (ClientWithCoreApi) does not yet implement devInspectTransactionBlock. ' +
				'This will be implemented when simulateTransaction is added to the core API.',
		);
	}

	/**
	 * Returns the associated group ID from an EncryptionHistory.
	 *
	 * @param options.encryptionHistoryId - Object ID of the EncryptionHistory
	 *
	 * @throws {MessagingGroupsNotImplementedError} This method is not yet implemented.
	 */
	async groupId(_options: EncryptionHistoryViewOptions): Promise<string> {
		throw new MessagingGroupsNotImplementedError(
			'groupId',
			'The core client API (ClientWithCoreApi) does not yet implement devInspectTransactionBlock. ' +
				'This will be implemented when simulateTransaction is added to the core API.',
		);
	}

	/**
	 * Returns the current key version (0-indexed) from an EncryptionHistory.
	 *
	 * @param options.encryptionHistoryId - Object ID of the EncryptionHistory
	 *
	 * @throws {MessagingGroupsNotImplementedError} This method is not yet implemented.
	 */
	async currentKeyVersion(_options: EncryptionHistoryViewOptions): Promise<bigint> {
		throw new MessagingGroupsNotImplementedError(
			'currentKeyVersion',
			'The core client API (ClientWithCoreApi) does not yet implement devInspectTransactionBlock. ' +
				'This will be implemented when simulateTransaction is added to the core API.',
		);
	}

	/**
	 * Returns the encrypted DEK for a specific version.
	 *
	 * @param options.encryptionHistoryId - Object ID of the EncryptionHistory
	 * @param options.version - Key version (0-indexed)
	 *
	 * @throws {MessagingGroupsNotImplementedError} This method is not yet implemented.
	 */
	async encryptedKey(_options: EncryptedKeyViewOptions): Promise<Uint8Array> {
		throw new MessagingGroupsNotImplementedError(
			'encryptedKey',
			'The core client API (ClientWithCoreApi) does not yet implement devInspectTransactionBlock. ' +
				'This will be implemented when simulateTransaction is added to the core API.',
		);
	}

	/**
	 * Returns the encrypted DEK for the current (latest) version.
	 *
	 * @param options.encryptionHistoryId - Object ID of the EncryptionHistory
	 *
	 * @throws {MessagingGroupsNotImplementedError} This method is not yet implemented.
	 */
	async currentEncryptedKey(_options: EncryptionHistoryViewOptions): Promise<Uint8Array> {
		throw new MessagingGroupsNotImplementedError(
			'currentEncryptedKey',
			'The core client API (ClientWithCoreApi) does not yet implement devInspectTransactionBlock. ' +
				'This will be implemented when simulateTransaction is added to the core API.',
		);
	}
}
