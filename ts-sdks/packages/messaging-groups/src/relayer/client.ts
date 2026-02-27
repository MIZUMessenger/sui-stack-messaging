// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { AttachmentsManager } from '../attachments/attachments-manager.js';
import type { AttachmentFile, AttachmentHandle } from '../attachments/types.js';
import type { EnvelopeEncryption } from '../encryption/envelope-encryption.js';
import type { MessagingGroupsDerive } from '../derive.js';
import { MessagingGroupsClientError } from '../error.js';
import type { GroupRef } from '../types.js';
import type { RelayerTransport } from './transport.js';
import type { RelayerMessage, SyncStatus } from './types.js';

// ── Conditional sealApproveContext ────────────────────────────────

/**
 * Conditionally adds `sealApproveContext` when `TApproveContext` is not `void`.
 * Mirrors the pattern in {@link EnvelopeEncryption}.
 */
type WithApproveContext<TBase, TApproveContext> = TApproveContext extends void
	? TBase
	: TBase & { sealApproveContext: TApproveContext };

// ── Public types ─────────────────────────────────────────────────

/** A decrypted message returned by {@link RelayerClient} methods. */
export interface DecryptedMessage {
	messageId: string;
	groupId: string;
	order: number;
	/** Decrypted plaintext. Empty string for deleted or attachment-only messages. */
	text: string;
	senderAddress: string;
	createdAt: number;
	updatedAt: number;
	isEdited: boolean;
	isDeleted: boolean;
	syncStatus: SyncStatus;
	/** Resolved attachment handles with lazy data download. Empty when no attachments or not configured. */
	attachments: AttachmentHandle[];
	/** Raw attachment references from the relayer. Useful when attachments support is not configured. */
	rawAttachments: string[];
}

// ── Options types ────────────────────────────────────────────────

interface SendMessageOptionsBase {
	groupRef: GroupRef;
	/** Message text. At least one of `text` or `files` must be provided. */
	text?: string;
	/** Files to attach. Requires attachments support to be configured. */
	files?: AttachmentFile[];
}

/** Options for {@link RelayerClient.sendMessage}. */
export type SendMessageOptions<TApproveContext = void> = WithApproveContext<
	SendMessageOptionsBase,
	TApproveContext
>;

interface GetMessageOptionsBase {
	groupRef: GroupRef;
	messageId: string;
}

/** Options for {@link RelayerClient.getMessage}. */
export type GetMessageOptions<TApproveContext = void> = WithApproveContext<
	GetMessageOptionsBase,
	TApproveContext
>;

interface GetMessagesOptionsBase {
	groupRef: GroupRef;
	afterOrder?: number;
	beforeOrder?: number;
	limit?: number;
}

/** Options for {@link RelayerClient.getMessages}. */
export type GetMessagesOptions<TApproveContext = void> = WithApproveContext<
	GetMessagesOptionsBase,
	TApproveContext
>;

/** Result of {@link RelayerClient.getMessages}. */
export interface GetMessagesResult {
	messages: DecryptedMessage[];
	hasNext: boolean;
}

interface EditMessageOptionsBase {
	groupRef: GroupRef;
	messageId: string;
	/** New message text. */
	text: string;
	/** New files to attach (replaces all existing attachments). */
	files?: AttachmentFile[];
}

/** Options for {@link RelayerClient.editMessage}. */
export type EditMessageOptions<TApproveContext = void> = WithApproveContext<
	EditMessageOptionsBase,
	TApproveContext
>;

/** Options for {@link RelayerClient.deleteMessage}. No encryption involved. */
export interface DeleteMessageOptions {
	groupRef: GroupRef;
	messageId: string;
}

interface SubscribeOptionsBase {
	groupRef: GroupRef;
	afterOrder?: number;
	signal?: AbortSignal;
}

/** Options for {@link RelayerClient.subscribe}. */
export type SubscribeOptions<TApproveContext = void> = WithApproveContext<
	SubscribeOptionsBase,
	TApproveContext
>;

// ── Internal config ──────────────────────────────────────────────

/** @internal Created by {@link MessagingGroupsClient}, not by end users. */
export interface RelayerClientInternalConfig<TApproveContext = void> {
	transport: RelayerTransport;
	encryption: EnvelopeEncryption<TApproveContext>;
	derive: MessagingGroupsDerive;
	attachments?: AttachmentsManager<TApproveContext>;
}

// ── Implementation ───────────────────────────────────────────────

/**
 * High-level client for sending and receiving E2EE messages via the relayer.
 *
 * Orchestrates encryption ({@link EnvelopeEncryption}), attachment handling
 * ({@link AttachmentsManager}), and transport dispatch ({@link RelayerTransport}).
 *
 * Created internally by {@link MessagingGroupsClient} when relayer config is
 * provided. Access via `client.messaging.relayer`.
 *
 * @example
 * ```ts
 * // Send a message
 * const { messageId } = await client.messaging.relayer.sendMessage({
 *   groupRef: { uuid: 'my-group' },
 *   text: 'Hello!',
 * });
 *
 * // Subscribe to new messages
 * for await (const msg of client.messaging.relayer.subscribe({
 *   groupRef: { uuid: 'my-group' },
 *   signal: controller.signal,
 * })) {
 *   console.log(msg.text, msg.attachments);
 * }
 * ```
 */
export class RelayerClient<TApproveContext = void> {
	readonly #transport: RelayerTransport;
	readonly #encryption: EnvelopeEncryption<TApproveContext>;
	readonly #derive: MessagingGroupsDerive;
	readonly #attachments: AttachmentsManager<TApproveContext> | undefined;
	readonly #textEncoder = new TextEncoder();
	readonly #textDecoder = new TextDecoder();

	constructor(config: RelayerClientInternalConfig<TApproveContext>) {
		this.#transport = config.transport;
		this.#encryption = config.encryption;
		this.#derive = config.derive;
		this.#attachments = config.attachments;
	}

	// ── Send ─────────────────────────────────────────────────────

	/**
	 * Encrypt and send a message to a group.
	 *
	 * At least one of `text` or `files` must be provided.
	 * When `files` is provided, attachments support must be configured.
	 *
	 * @returns The relayer-assigned message ID.
	 */
	async sendMessage(options: SendMessageOptions<TApproveContext>): Promise<{ messageId: string }> {
		this.#validateSendInput(options);

		const { groupId, encryptionHistoryId } = this.#derive.resolveGroupRef(options.groupRef);
		const approveContext = this.#approveContextSpread(options);

		// 1. Encrypt text (empty string for attachment-only messages).
		const textBytes = this.#textEncoder.encode(options.text ?? '');
		const envelope = await this.#encryption.encrypt({
			groupId,
			encryptionHistoryId,
			data: textBytes,
			...approveContext,
		} as Parameters<EnvelopeEncryption<TApproveContext>['encrypt']>[0]);

		// 2. Upload attachments if present.
		const attachmentRefs = await this.#uploadAttachments(
			options.files,
			{ groupId, encryptionHistoryId },
			approveContext,
		);

		// 3. Send via transport.
		const result = await this.#transport.sendMessage({
			groupId,
			encryptedText: envelope.ciphertext,
			nonce: envelope.nonce,
			keyVersion: envelope.keyVersion,
			attachments: attachmentRefs.length > 0 ? attachmentRefs : undefined,
		});

		return { messageId: result.messageId };
	}

	// ── Get ──────────────────────────────────────────────────────

	/**
	 * Fetch and decrypt a single message.
	 */
	async getMessage(options: GetMessageOptions<TApproveContext>): Promise<DecryptedMessage> {
		const { groupId, encryptionHistoryId } = this.#derive.resolveGroupRef(options.groupRef);
		const approveContext = this.#approveContextSpread(options);

		const raw = await this.#transport.fetchMessage({
			messageId: options.messageId,
			groupId,
		});

		return this.#decryptMessage(raw, { groupId, encryptionHistoryId }, approveContext);
	}

	/**
	 * Fetch and decrypt a paginated list of messages.
	 */
	async getMessages(options: GetMessagesOptions<TApproveContext>): Promise<GetMessagesResult> {
		const { groupId, encryptionHistoryId } = this.#derive.resolveGroupRef(options.groupRef);
		const approveContext = this.#approveContextSpread(options);

		const result = await this.#transport.fetchMessages({
			groupId,
			afterOrder: options.afterOrder,
			beforeOrder: options.beforeOrder,
			limit: options.limit,
		});

		const messages = await Promise.all(
			result.messages.map((raw) =>
				this.#decryptMessage(raw, { groupId, encryptionHistoryId }, approveContext),
			),
		);

		return { messages, hasNext: result.hasNext };
	}

	// ── Edit ─────────────────────────────────────────────────────

	/**
	 * Encrypt and update an existing message.
	 * Only the original sender can edit their messages.
	 */
	async editMessage(options: EditMessageOptions<TApproveContext>): Promise<void> {
		const { groupId, encryptionHistoryId } = this.#derive.resolveGroupRef(options.groupRef);
		const approveContext = this.#approveContextSpread(options);

		// 1. Encrypt new text.
		const textBytes = this.#textEncoder.encode(options.text);
		const envelope = await this.#encryption.encrypt({
			groupId,
			encryptionHistoryId,
			data: textBytes,
			...approveContext,
		} as Parameters<EnvelopeEncryption<TApproveContext>['encrypt']>[0]);

		// 2. Upload new attachments if present.
		const attachmentRefs = await this.#uploadAttachments(
			options.files,
			{ groupId, encryptionHistoryId },
			approveContext,
		);

		// 3. Update via transport.
		await this.#transport.updateMessage({
			messageId: options.messageId,
			groupId,
			encryptedText: envelope.ciphertext,
			nonce: envelope.nonce,
			keyVersion: envelope.keyVersion,
			attachments: attachmentRefs.length > 0 ? attachmentRefs : undefined,
		});
	}

	// ── Delete ───────────────────────────────────────────────────

	/**
	 * Soft-delete a message.
	 * Only the original sender can delete their messages.
	 */
	async deleteMessage(options: DeleteMessageOptions): Promise<void> {
		const { groupId } = this.#derive.resolveGroupRef(options.groupRef);

		await this.#transport.deleteMessage({
			messageId: options.messageId,
			groupId,
		});
	}

	// ── Subscribe ────────────────────────────────────────────────

	/**
	 * Subscribe to real-time messages for a group.
	 *
	 * Wraps the transport's subscribe stream and decrypts each message.
	 * The iterable completes when the AbortSignal fires or {@link disconnect}
	 * is called.
	 *
	 * @example
	 * ```ts
	 * const controller = new AbortController();
	 * for await (const msg of client.messaging.relayer.subscribe({
	 *   groupRef: { uuid: '...' },
	 *   signal: controller.signal,
	 * })) {
	 *   console.log(msg.text, msg.attachments);
	 * }
	 * ```
	 *
	 * @yields {DecryptedMessage} Decrypted messages as they arrive from the transport.
	 */
	async *subscribe(options: SubscribeOptions<TApproveContext>): AsyncIterable<DecryptedMessage> {
		const { groupId, encryptionHistoryId } = this.#derive.resolveGroupRef(options.groupRef);
		const approveContext = this.#approveContextSpread(options);

		for await (const raw of this.#transport.subscribe({
			groupId,
			afterOrder: options.afterOrder,
			signal: options.signal,
		})) {
			yield this.#decryptMessage(raw, { groupId, encryptionHistoryId }, approveContext);
		}
	}

	// ── Disconnect ───────────────────────────────────────────────

	/** Disconnect the underlying transport. Active subscriptions will complete. */
	disconnect(): void {
		this.#transport.disconnect();
	}

	// ── Private: sealApproveContext ──────────────────────────────

	/**
	 * Build a spreadable object containing `sealApproveContext` when present.
	 * Returns `{}` for the default `void` case.
	 */
	#approveContextSpread(
		options: object & { sealApproveContext?: unknown },
	): Record<string, unknown> {
		const ctx = options.sealApproveContext;
		return ctx !== undefined ? { sealApproveContext: ctx } : {};
	}

	// ── Private: Decryption ──────────────────────────────────────

	async #decryptMessage(
		raw: RelayerMessage,
		groupIds: { groupId: string; encryptionHistoryId: string },
		approveContext: Record<string, unknown>,
	): Promise<DecryptedMessage> {
		// Deleted messages: skip decryption.
		if (raw.isDeleted) {
			return {
				messageId: raw.messageId,
				groupId: raw.groupId,
				order: raw.order,
				text: '',
				senderAddress: raw.senderAddress,
				createdAt: raw.createdAt,
				updatedAt: raw.updatedAt,
				isEdited: raw.isEdited,
				isDeleted: true,
				syncStatus: raw.syncStatus,
				attachments: [],
				rawAttachments: raw.attachments,
			};
		}

		// Decrypt text.
		const plaintext = await this.#encryption.decrypt({
			...groupIds,
			...approveContext,
			envelope: {
				ciphertext: raw.encryptedText,
				nonce: raw.nonce,
				keyVersion: raw.keyVersion,
			},
		} as Parameters<EnvelopeEncryption<TApproveContext>['decrypt']>[0]);

		const text = this.#textDecoder.decode(plaintext);

		// Resolve attachments.
		const attachments = await this.#resolveAttachments(raw.attachments, groupIds, approveContext);

		return {
			messageId: raw.messageId,
			groupId: raw.groupId,
			order: raw.order,
			text,
			senderAddress: raw.senderAddress,
			createdAt: raw.createdAt,
			updatedAt: raw.updatedAt,
			isEdited: raw.isEdited,
			isDeleted: false,
			syncStatus: raw.syncStatus,
			attachments,
			rawAttachments: raw.attachments,
		};
	}

	// ── Private: Attachments ─────────────────────────────────────

	async #uploadAttachments(
		files: AttachmentFile[] | undefined,
		groupIds: { groupId: string; encryptionHistoryId: string },
		approveContext: Record<string, unknown>,
	): Promise<string[]> {
		if (!files || files.length === 0) return [];

		if (!this.#attachments) {
			throw new MessagingGroupsClientError(
				'Attachments support is not configured. Provide `relayer.attachments` ' +
					'with a StorageAdapter when creating the messaging groups client.',
			);
		}

		const result = await this.#attachments.upload(
			files,
			groupIds,
			approveContext as Omit<Parameters<EnvelopeEncryption<TApproveContext>['encrypt']>[0], 'data'>,
		);

		// Encode manifest reference as [manifestId, manifestNonce, manifestKeyVersion].
		return [result.manifestId, result.manifestNonce, String(result.manifestKeyVersion)];
	}

	async #resolveAttachments(
		refs: string[],
		groupIds: { groupId: string; encryptionHistoryId: string },
		approveContext: Record<string, unknown>,
	): Promise<AttachmentHandle[]> {
		if (refs.length === 0) return [];

		// No attachments support configured — caller can check rawAttachments.
		if (!this.#attachments) return [];

		// Parse the 3-element reference: [manifestId, manifestNonce, manifestKeyVersion].
		const [manifestId, manifestNonce, manifestKeyVersionStr] = refs;
		if (!manifestId || !manifestNonce || !manifestKeyVersionStr) return [];

		return this.#attachments.resolve(
			{
				manifestId,
				manifestNonce,
				manifestKeyVersion: Number(manifestKeyVersionStr),
				...groupIds,
			},
			approveContext as Omit<
				Parameters<EnvelopeEncryption<TApproveContext>['decrypt']>[0],
				'envelope'
			>,
		);
	}

	// ── Private: Validation ──────────────────────────────────────

	#validateSendInput(options: SendMessageOptionsBase): void {
		const hasText = options.text !== undefined && options.text !== '';
		const hasFiles = options.files !== undefined && options.files.length > 0;

		if (!hasText && !hasFiles) {
			throw new MessagingGroupsClientError(
				'sendMessage requires at least one of `text` or `files`.',
			);
		}
	}
}
