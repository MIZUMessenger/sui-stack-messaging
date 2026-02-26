// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { EnvelopeEncryption } from '../encryption/envelope-encryption.js';
import { AttachmentsManager } from './attachments-manager.js';
import type { AttachmentsConfig } from './types.js';

/**
 * Factory for creating an `attachments` client extension.
 *
 * Usage:
 * ```typescript
 * const withAttachments = client.$extend(
 *   attachments({
 *     encryption: client.messaging.encryption,
 *     storageAdapter: new WalrusHttpStorageAdapter({ ... }),
 *   }),
 * );
 * // withAttachments.attachments.upload(files, groupRef)
 * // withAttachments.attachments.resolve({ manifestId, ... })
 * ```
 *
 * `encryption` is injected directly rather than looked up by extension name.
 * This decouples attachments from how the encryption layer is composed —
 * it works whether encryption lives inside `messagingGroups` or is standalone.
 */
export function attachments<TApproveContext = void, const Name = 'attachments'>({
	name = 'attachments' as Name,
	encryption,
	...config
}: {
	name?: Name;
	encryption: EnvelopeEncryption<TApproveContext>;
} & AttachmentsConfig) {
	return {
		name,
		register: () => {
			return new AttachmentsManager<TApproveContext>(encryption, config);
		},
	};
}
