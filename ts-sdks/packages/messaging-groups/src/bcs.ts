// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { BcsType } from '@mysten/bcs';

import type { MessagingGroupsPackageConfig } from './types.js';

// Messaging module types
import {
	Messaging,
	MessagingNamespace,
	MessagingSender,
	MessagingReader,
	MessagingEditor,
	MessagingDeleter,
} from './contracts/messaging/messaging.js';

// Encryption history module types
import {
	EncryptionHistory,
	EncryptionHistoryCreated,
	EncryptionKeyRotated,
	EncryptionKeyRotator,
	EncryptionHistoryTag,
	PermissionedGroupTag,
} from './contracts/messaging/encryption_history.js';

// Parsed type exports
export type ParsedMessagingNamespace = (typeof MessagingNamespace)['$inferType'];
export type ParsedMessaging = (typeof Messaging)['$inferType'];
export type ParsedMessagingSender = (typeof MessagingSender)['$inferType'];
export type ParsedMessagingReader = (typeof MessagingReader)['$inferType'];
export type ParsedMessagingEditor = (typeof MessagingEditor)['$inferType'];
export type ParsedMessagingDeleter = (typeof MessagingDeleter)['$inferType'];
export type ParsedEncryptionHistory = (typeof EncryptionHistory)['$inferType'];
export type ParsedEncryptionHistoryCreated = (typeof EncryptionHistoryCreated)['$inferType'];
export type ParsedEncryptionKeyRotated = (typeof EncryptionKeyRotated)['$inferType'];
export type ParsedEncryptionKeyRotator = (typeof EncryptionKeyRotator)['$inferType'];
export type ParsedEncryptionHistoryTag = (typeof EncryptionHistoryTag)['$inferType'];
export type ParsedPermissionedGroupTag = (typeof PermissionedGroupTag)['$inferType'];

export interface MessagingGroupsBCSOptions {
	packageConfig: MessagingGroupsPackageConfig;
}

/**
 * BCS type definitions for the messaging-groups package.
 *
 * Each instance creates transformed copies of the generated BCS types
 * with the correct package ID in the type name, ensuring multiple SDK
 * instances with different package configurations don't interfere.
 *
 * @example
 * ```ts
 * const bcs = new MessagingGroupsBCS({
 *   packageConfig: { packageId: '0x123...', namespaceId: '0x456...' }
 * });
 *
 * const namespace = bcs.MessagingNamespace.parse(namespaceObject.content);
 * const history = bcs.EncryptionHistory.parse(historyObject.content);
 * ```
 */
export class MessagingGroupsBCS {
	// === Messaging module types ===

	/** Package witness type for scoping permissions */
	readonly Messaging: BcsType<ParsedMessaging, unknown>;
	/** Shared singleton for namespace management */
	readonly MessagingNamespace: BcsType<ParsedMessagingNamespace, unknown>;
	/** Permission witness: send messages */
	readonly MessagingSender: BcsType<ParsedMessagingSender, unknown>;
	/** Permission witness: read/decrypt messages */
	readonly MessagingReader: BcsType<ParsedMessagingReader, unknown>;
	/** Permission witness: edit messages */
	readonly MessagingEditor: BcsType<ParsedMessagingEditor, unknown>;
	/** Permission witness: delete messages */
	readonly MessagingDeleter: BcsType<ParsedMessagingDeleter, unknown>;

	// === Encryption history module types ===

	/** Encryption history struct storing versioned DEKs */
	readonly EncryptionHistory: BcsType<ParsedEncryptionHistory, unknown>;
	/** Event emitted when encryption history is created */
	readonly EncryptionHistoryCreated: BcsType<ParsedEncryptionHistoryCreated, unknown>;
	/** Event emitted when encryption key is rotated */
	readonly EncryptionKeyRotated: BcsType<ParsedEncryptionKeyRotated, unknown>;
	/** Permission witness: rotate encryption keys */
	readonly EncryptionKeyRotator: BcsType<ParsedEncryptionKeyRotator, unknown>;
	/** Derivation key for EncryptionHistory address */
	readonly EncryptionHistoryTag: BcsType<ParsedEncryptionHistoryTag, unknown>;
	/** Derivation key for PermissionedGroup address */
	readonly PermissionedGroupTag: BcsType<ParsedPermissionedGroupTag, unknown>;

	constructor(options: MessagingGroupsBCSOptions) {
		const messagingModule = `${options.packageConfig.originalPackageId}::messaging`;
		const encryptionHistoryModule = `${options.packageConfig.originalPackageId}::encryption_history`;

		// Messaging module types
		this.Messaging = Messaging.transform({
			name: `${messagingModule}::Messaging`,
		});
		this.MessagingNamespace = MessagingNamespace.transform({
			name: `${messagingModule}::MessagingNamespace`,
		});
		this.MessagingSender = MessagingSender.transform({
			name: `${messagingModule}::MessagingSender`,
		});
		this.MessagingReader = MessagingReader.transform({
			name: `${messagingModule}::MessagingReader`,
		});
		this.MessagingEditor = MessagingEditor.transform({
			name: `${messagingModule}::MessagingEditor`,
		});
		this.MessagingDeleter = MessagingDeleter.transform({
			name: `${messagingModule}::MessagingDeleter`,
		});

		// Encryption history module types
		this.EncryptionHistory = EncryptionHistory.transform({
			name: `${encryptionHistoryModule}::EncryptionHistory`,
		});
		this.EncryptionHistoryCreated = EncryptionHistoryCreated.transform({
			name: `${encryptionHistoryModule}::EncryptionHistoryCreated`,
		});
		this.EncryptionKeyRotated = EncryptionKeyRotated.transform({
			name: `${encryptionHistoryModule}::EncryptionKeyRotated`,
		});
		this.EncryptionKeyRotator = EncryptionKeyRotator.transform({
			name: `${encryptionHistoryModule}::EncryptionKeyRotator`,
		});
		this.EncryptionHistoryTag = EncryptionHistoryTag.transform({
			name: `${encryptionHistoryModule}::EncryptionHistoryTag`,
		});
		this.PermissionedGroupTag = PermissionedGroupTag.transform({
			name: `${encryptionHistoryModule}::PermissionedGroupTag`,
		});
	}
}
