// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SealClient } from '@mysten/seal';
import type { Signer } from '@mysten/sui/cryptography';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import type { Transaction } from '@mysten/sui/transactions';

import { MessagingGroupsClientError } from './error.js';
import {
	TESTNET_MESSAGING_GROUPS_PACKAGE_CONFIG,
	MAINNET_MESSAGING_GROUPS_PACKAGE_CONFIG,
	TESTNET_SUINS_CONFIG,
	MAINNET_SUINS_CONFIG,
	type SuinsConfig,
} from './constants.js';
import { AttachmentsManager } from './attachments/attachments-manager.js';
import type { Attachment, AttachmentFile, AttachmentHandle } from './attachments/types.js';
import { EnvelopeEncryption } from './encryption/envelope-encryption.js';
import type { EncryptOptions, DecryptOptions } from './encryption/envelope-encryption.js';
import { HTTPRelayerTransport } from './relayer/http-transport.js';
import type { RelayerTransport } from './relayer/transport.js';
import type { RelayerConfig, RelayerMessage } from './relayer/types.js';
import type {
	DecryptedMessage,
	DeleteMessageOptions,
	EditMessageOptions,
	GetMessageOptions,
	GetMessagesOptions,
	GetMessagesResult,
	SendMessageOptions,
	SubscribeOptions,
} from './messaging-types.js';
import type {
	ArchiveGroupOptions,
	CreateGroupOptions,
	InsertGroupDataOptions,
	LeaveOptions,
	MessagingGroupsClientOptions,
	MessagingGroupsCompatibleClient,
	MessagingGroupsEncryptionOptions,
	MessagingGroupsPackageConfig,
	RemoveGroupDataOptions,
	RotateEncryptionKeyOptions,
	SetGroupNameOptions,
	SetSuinsReverseLookupOptions,
	UnsetSuinsReverseLookupOptions,
} from './types.js';
import { MessagingGroupsCall } from './call.js';
import { MessagingGroupsTransactions } from './transactions.js';
import { MessagingGroupsBCS } from './bcs.js';
import { MessagingGroupsDerive } from './derive.js';
import { MessagingGroupsView } from './view.js';

/**
 * Client extension factory for messaging groups.
 *
 * Requires the base client to already have `permissionedGroups` and `seal`
 * extensions registered. For a simpler setup that handles all extensions
 * automatically, see {@link createMessagingGroupsClient}.
 *
 * @example
 * ```ts
 * // Use a single $extend call with all extensions
 * const client = new SuiClient({ url: 'https://...' }).$extend(
 *   permissionedGroups({ witnessType: `${pkg}::messaging::Messaging`, packageConfig }),
 *   messagingGroups({ packageConfig, encryption: { sessionKey }, relayer: { relayerUrl, signer } }),
 * );
 *
 * // Send a message
 * await client.messaging.sendMessage({ groupRef: { uuid: 'my-group' }, text: 'Hello!' });
 * ```
 */
export function messagingGroups<
	TApproveContext = void,
	const Name = 'messaging',
	const GroupsName extends string = 'groups',
	const SealName extends string = 'seal',
>({
	name = 'messaging' as Name,
	groupsName = 'groups' as GroupsName,
	sealName = 'seal' as SealName,
	packageConfig,
	encryption,
	suinsConfig,
	relayer,
	attachments,
}: {
	name?: Name;
	/** Name under which the PermissionedGroupsClient extension is registered (default: 'groups'). */
	groupsName?: GroupsName;
	/** Name under which the SealClient extension is registered (default: 'seal'). */
	sealName?: SealName;
	packageConfig?: MessagingGroupsPackageConfig;
	encryption: MessagingGroupsEncryptionOptions<TApproveContext>;
	/** SuiNS config for reverse lookup operations (auto-detected for testnet/mainnet). */
	suinsConfig?: SuinsConfig;
	/** Relayer transport configuration. */
	relayer: RelayerConfig;
	/** Attachment support. When omitted, messages cannot include files. */
	attachments?: MessagingGroupsClientOptions<TApproveContext>['attachments'];
}) {
	return {
		name,
		register: (client: MessagingGroupsCompatibleClient<GroupsName, SealName>) => {
			return new MessagingGroupsClient<TApproveContext>({
				client,
				groupsName,
				sealName,
				packageConfig,
				suinsConfig,
				encryption,
				relayer,
				attachments,
			});
		},
	};
}

/**
 * Client for interacting with messaging groups.
 *
 * Provides on-chain group management (`call`, `tx`), view functions (`view`),
 * BCS parsing (`bcs`), and high-level E2EE messaging via the relayer transport.
 *
 * Requires a SuiClient extended with PermissionedGroupsClient and SealClient.
 *
 * @example
 * ```ts
 * // Send a message
 * const { messageId } = await client.messaging.sendMessage({
 *   groupRef: { uuid: 'my-group' },
 *   text: 'Hello!',
 * });
 *
 * // Subscribe to new messages
 * for await (const msg of client.messaging.subscribe({
 *   groupRef: { uuid: 'my-group' },
 *   signal: controller.signal,
 * })) {
 *   console.log(msg.text, msg.attachments);
 * }
 *
 * // For fine-grained permissions, use the groups extension:
 * await client.groups.grantPermission({ ... });
 * ```
 */
export class MessagingGroupsClient<TApproveContext = void> {
	#packageConfig: MessagingGroupsPackageConfig;
	#client: ClientWithCoreApi;
	#attachments: AttachmentsManager<TApproveContext> | undefined;
	readonly #textEncoder = new TextEncoder();
	readonly #textDecoder = new TextDecoder();

	call: MessagingGroupsCall;
	tx: MessagingGroupsTransactions;
	view: MessagingGroupsView;
	bcs: MessagingGroupsBCS;
	derive: MessagingGroupsDerive;
	encryption: EnvelopeEncryption<TApproveContext>;
	/** Low-level transport for direct relayer access. Use `sendMessage()`, `getMessage()`, etc. for the high-level API. */
	transport: RelayerTransport;

	constructor(options: MessagingGroupsClientOptions<TApproveContext, string, string>) {
		if (!options.client) {
			throw new MessagingGroupsClientError('client must be provided');
		}
		this.#client = options.client;

		// Use custom packageConfig if provided, otherwise determine from network
		let suinsConfig: SuinsConfig | undefined = options.suinsConfig;

		if (options.packageConfig) {
			this.#packageConfig = options.packageConfig;
		} else {
			const network = options.client.network;
			switch (network) {
				case 'testnet':
					this.#packageConfig = TESTNET_MESSAGING_GROUPS_PACKAGE_CONFIG;
					suinsConfig ??= TESTNET_SUINS_CONFIG;
					break;
				case 'mainnet':
					this.#packageConfig = MAINNET_MESSAGING_GROUPS_PACKAGE_CONFIG;
					suinsConfig ??= MAINNET_SUINS_CONFIG;
					break;
				default:
					throw new MessagingGroupsClientError(
						`Unsupported network: ${network}. Provide a custom packageConfig for localnet/devnet.`,
					);
			}
		}

		// Resolve extension dependencies by their registered names
		const groupsExt = options.client[options.groupsName];
		const sealExt = options.client[options.sealName] as SealClient;

		// Build order matters: bcs → derive → view → encryption → call → tx
		this.bcs = new MessagingGroupsBCS({ packageConfig: this.#packageConfig });
		this.derive = new MessagingGroupsDerive({ packageConfig: this.#packageConfig });
		this.view = new MessagingGroupsView({
			packageConfig: this.#packageConfig,
			client: this.#client,
			derive: this.derive,
			bcs: this.bcs,
		});
		this.encryption = new EnvelopeEncryption({
			sealClient: sealExt,
			suiClient: this.#client,
			view: this.view,
			derive: this.derive,
			originalPackageId: this.#packageConfig.originalPackageId,
			latestPackageId: this.#packageConfig.latestPackageId,
			versionId: this.#packageConfig.versionId,
			encryption: options.encryption,
		});
		this.call = new MessagingGroupsCall({
			packageConfig: this.#packageConfig,
			encryption: this.encryption,
			derive: this.derive,
			permissionedGroupTypeName: groupsExt.bcs.PermissionedGroup.name,
			encryptionHistoryTypeName: this.bcs.EncryptionHistory.name,
			suinsConfig,
		});
		this.tx = new MessagingGroupsTransactions({
			call: this.call,
		});

		this.#attachments = options.attachments
			? new AttachmentsManager(this.encryption, options.attachments)
			: undefined;

		this.transport = options.relayer.transport
			? options.relayer.transport
			: new HTTPRelayerTransport({
					relayerUrl: options.relayer.relayerUrl,
					signer: options.relayer.signer,
					pollingIntervalMs: options.relayer.pollingIntervalMs,
					fetch: options.relayer.fetch,
					timeout: options.relayer.timeout,
					onError: options.relayer.onError,
				});
	}

	// === Private Helpers ===

	/**
	 * Executes a transaction with the given signer and waits for confirmation.
	 * @throws {MessagingGroupsClientError} if the transaction fails
	 */
	async #executeTransaction(transaction: Transaction, signer: Signer, action: string) {
		transaction.setSenderIfNotSet(signer.toSuiAddress());

		const result = await signer.signAndExecuteTransaction({
			transaction,
			client: this.#client,
		});

		const tx = result.Transaction ?? result.FailedTransaction;
		if (!tx) {
			throw new MessagingGroupsClientError(`Failed to ${action}: no transaction result`);
		}

		if (!tx.status.success) {
			throw new MessagingGroupsClientError(
				`Failed to ${action} (${tx.digest}): ${tx.status.error}`,
			);
		}

		await this.#client.core.waitForTransaction({ result });

		return { digest: tx.digest, effects: tx.effects };
	}

	// === Messaging Methods ===

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

		const { groupId, encryptionHistoryId } = this.derive.resolveGroupRef(options.groupRef);
		const approveContext = this.#approveContextSpread(options);

		// 1. Encrypt text (empty string for attachment-only messages).
		const textBytes = this.#textEncoder.encode(options.text ?? '');
		const envelope = await this.encryption.encrypt({
			groupId,
			encryptionHistoryId,
			data: textBytes,
			...approveContext,
		} as EncryptOptions<TApproveContext>);

		// 2. Upload attachments if present.
		const attachmentRefs = await this.#uploadAttachments(
			options.files,
			{ groupId, encryptionHistoryId },
			approveContext,
		);

		// 3. Send via transport.
		const result = await this.transport.sendMessage({
			groupId,
			encryptedText: envelope.ciphertext,
			nonce: envelope.nonce,
			keyVersion: envelope.keyVersion,
			attachments: attachmentRefs.length > 0 ? attachmentRefs : undefined,
		});

		return { messageId: result.messageId };
	}

	/**
	 * Fetch and decrypt a single message.
	 */
	async getMessage(options: GetMessageOptions<TApproveContext>): Promise<DecryptedMessage> {
		const { groupId, encryptionHistoryId } = this.derive.resolveGroupRef(options.groupRef);
		const approveContext = this.#approveContextSpread(options);

		const raw = await this.transport.fetchMessage({
			messageId: options.messageId,
			groupId,
		});

		return this.#decryptMessage(raw, { groupId, encryptionHistoryId }, approveContext);
	}

	/**
	 * Fetch and decrypt a paginated list of messages.
	 */
	async getMessages(options: GetMessagesOptions<TApproveContext>): Promise<GetMessagesResult> {
		const { groupId, encryptionHistoryId } = this.derive.resolveGroupRef(options.groupRef);
		const approveContext = this.#approveContextSpread(options);

		const result = await this.transport.fetchMessages({
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

	/**
	 * Encrypt and update an existing message.
	 * Only the original sender can edit their messages.
	 *
	 * When `attachments` is provided, the SDK computes the final attachment list
	 * from the diff and attempts best-effort storage cleanup for removed entries.
	 * When omitted, attachments are left unchanged.
	 */
	async editMessage(options: EditMessageOptions<TApproveContext>): Promise<void> {
		const { groupId, encryptionHistoryId } = this.derive.resolveGroupRef(options.groupRef);
		const approveContext = this.#approveContextSpread(options);

		// 1. Encrypt new text.
		const textBytes = this.#textEncoder.encode(options.text);
		const envelope = await this.encryption.encrypt({
			groupId,
			encryptionHistoryId,
			data: textBytes,
			...approveContext,
		} as EncryptOptions<TApproveContext>);

		// 2. Compute attachment changes if requested.
		let finalAttachments: Attachment[] | undefined;
		let removedStorageIds: string[] | undefined;

		if (options.attachments) {
			const { current, remove, new: newFiles } = options.attachments;
			const removeSet = new Set(remove ?? []);

			// Keep current attachments that are not in the remove set.
			const kept =
				removeSet.size > 0 ? current.filter((a) => !removeSet.has(a.storageId)) : current;

			// Upload new files.
			const uploaded = await this.#uploadAttachments(
				newFiles,
				{ groupId, encryptionHistoryId },
				approveContext,
			);

			finalAttachments = [...kept, ...uploaded];
			if (removeSet.size > 0) {
				removedStorageIds = [...removeSet];
			}
		}

		// 3. Update via transport.
		await this.transport.updateMessage({
			messageId: options.messageId,
			groupId,
			encryptedText: envelope.ciphertext,
			nonce: envelope.nonce,
			keyVersion: envelope.keyVersion,
			attachments: finalAttachments,
		});

		// 4. Best-effort storage cleanup for removed attachments.
		if (removedStorageIds && this.#attachments) {
			this.#attachments.deleteStorageEntries(removedStorageIds).catch(() => {});
		}
	}

	/**
	 * Soft-delete a message.
	 * Only the original sender can delete their messages.
	 */
	async deleteMessage(options: DeleteMessageOptions): Promise<void> {
		const { groupId } = this.derive.resolveGroupRef(options.groupRef);

		await this.transport.deleteMessage({
			messageId: options.messageId,
			groupId,
		});
	}

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
	 * for await (const msg of client.messaging.subscribe({
	 *   groupRef: { uuid: '...' },
	 *   signal: controller.signal,
	 * })) {
	 *   console.log(msg.text, msg.attachments);
	 * }
	 * ```
	 *
	 * @yields Decrypted messages as they arrive from the transport.
	 */
	async *subscribe(options: SubscribeOptions<TApproveContext>): AsyncIterable<DecryptedMessage> {
		const { groupId, encryptionHistoryId } = this.derive.resolveGroupRef(options.groupRef);
		const approveContext = this.#approveContextSpread(options);

		for await (const raw of this.transport.subscribe({
			groupId,
			afterOrder: options.afterOrder,
			signal: options.signal,
		})) {
			yield this.#decryptMessage(raw, { groupId, encryptionHistoryId }, approveContext);
		}
	}

	/** Disconnect the underlying transport. Active subscriptions will complete. */
	disconnect(): void {
		this.transport.disconnect();
	}

	// === Private: sealApproveContext ===

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

	// === Private: Decryption ===

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
			};
		}

		// Decrypt text.
		const plaintext = await this.encryption.decrypt({
			...groupIds,
			...approveContext,
			envelope: {
				ciphertext: raw.encryptedText,
				nonce: raw.nonce,
				keyVersion: raw.keyVersion,
			},
		} as DecryptOptions<TApproveContext>);

		const text = this.#textDecoder.decode(plaintext);

		// Resolve attachments.
		const attachments = await this.#resolveAttachments(
			raw.attachments,
			groupIds,
			raw.keyVersion,
			approveContext,
		);

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
		};
	}

	// === Private: Attachments ===

	async #uploadAttachments(
		files: AttachmentFile[] | undefined,
		groupIds: { groupId: string; encryptionHistoryId: string },
		approveContext: Record<string, unknown>,
	): Promise<Attachment[]> {
		if (!files || files.length === 0) return [];

		if (!this.#attachments) {
			throw new MessagingGroupsClientError(
				'Attachments support is not configured. Provide `attachments` ' +
					'with a StorageAdapter when creating the messaging groups client.',
			);
		}

		return this.#attachments.upload(
			files,
			groupIds,
			approveContext as Omit<EncryptOptions<TApproveContext>, 'data'>,
		);
	}

	async #resolveAttachments(
		rawAttachments: Attachment[],
		groupIds: { groupId: string; encryptionHistoryId: string },
		keyVersion: bigint,
		approveContext: Record<string, unknown>,
	): Promise<AttachmentHandle[]> {
		if (rawAttachments.length === 0) return [];
		if (!this.#attachments) return [];

		return this.#attachments.resolve(
			rawAttachments,
			groupIds,
			keyVersion,
			approveContext as Omit<DecryptOptions<TApproveContext>, 'envelope'>,
		);
	}

	// === Private: Validation ===

	#validateSendInput(options: { text?: string; files?: AttachmentFile[] }): void {
		const hasText = options.text !== undefined && options.text !== '';
		const hasFiles = options.files !== undefined && options.files.length > 0;

		if (!hasText && !hasFiles) {
			throw new MessagingGroupsClientError(
				'sendMessage requires at least one of `text` or `files`.',
			);
		}
	}

	// === Top-Level Imperative Methods ===

	/**
	 * Creates a new messaging group.
	 * Returns a tuple of (PermissionedGroup<Messaging>, EncryptionHistory).
	 * The objects are NOT shared - use createAndShareGroup for shared groups.
	 */
	async createGroup(options: CreateGroupOptions) {
		const { signer, ...callOptions } = options;
		const transaction = this.tx.createGroup(callOptions);
		return this.#executeTransaction(transaction, signer, 'create group');
	}

	/**
	 * Creates a new messaging group and shares both objects.
	 * The transaction sender automatically becomes the creator with all permissions.
	 */
	async createAndShareGroup(options: CreateGroupOptions) {
		const { signer, ...callOptions } = options;
		const transaction = this.tx.createAndShareGroup(callOptions);
		return this.#executeTransaction(transaction, signer, 'create and share group');
	}

	/**
	 * Rotates the encryption key for a group.
	 * Requires EncryptionKeyRotator permission.
	 */
	async rotateEncryptionKey(options: RotateEncryptionKeyOptions) {
		const { signer, ...callOptions } = options;
		const transaction = this.tx.rotateEncryptionKey(callOptions);
		return this.#executeTransaction(transaction, signer, 'rotate encryption key');
	}

	/**
	 * Removes the transaction sender from a messaging group.
	 */
	async leave(options: LeaveOptions) {
		const { signer, ...callOptions } = options;
		const transaction = this.tx.leave(callOptions);
		return this.#executeTransaction(transaction, signer, 'leave group');
	}

	// === Archive Methods ===

	/**
	 * Permanently archives a messaging group.
	 * Requires `PermissionsAdmin` permission.
	 *
	 * After this call the group is paused and cannot be mutated.
	 */
	async archiveGroup(options: ArchiveGroupOptions) {
		const { signer, ...callOptions } = options;
		const transaction = this.tx.archiveGroup(callOptions);
		return this.#executeTransaction(transaction, signer, 'archive group');
	}

	// === Metadata Methods ===

	/**
	 * Sets the group name.
	 * Requires `MetadataAdmin` permission.
	 */
	async setGroupName(options: SetGroupNameOptions) {
		const { signer, ...callOptions } = options;
		const transaction = this.tx.setGroupName(callOptions);
		return this.#executeTransaction(transaction, signer, 'set group name');
	}

	/**
	 * Inserts a key-value pair into the group's metadata data map.
	 * Requires `MetadataAdmin` permission.
	 */
	async insertGroupData(options: InsertGroupDataOptions) {
		const { signer, ...callOptions } = options;
		const transaction = this.tx.insertGroupData(callOptions);
		return this.#executeTransaction(transaction, signer, 'insert group data');
	}

	/**
	 * Removes a key-value pair from the group's metadata data map.
	 * Requires `MetadataAdmin` permission.
	 */
	async removeGroupData(options: RemoveGroupDataOptions) {
		const { signer, ...callOptions } = options;
		const transaction = this.tx.removeGroupData(callOptions);
		return this.#executeTransaction(transaction, signer, 'remove group data');
	}

	// === SuiNS Reverse Lookup Methods ===

	/**
	 * Sets a SuiNS reverse lookup on a messaging group.
	 * Requires `ExtensionPermissionsAdmin` permission on the group.
	 */
	async setSuinsReverseLookup(options: SetSuinsReverseLookupOptions) {
		const { signer, ...callOptions } = options;
		const transaction = this.tx.setSuinsReverseLookup(callOptions);
		return this.#executeTransaction(transaction, signer, 'set SuiNS reverse lookup');
	}

	/**
	 * Unsets a SuiNS reverse lookup on a messaging group.
	 * Requires `ExtensionPermissionsAdmin` permission on the group.
	 */
	async unsetSuinsReverseLookup(options: UnsetSuinsReverseLookupOptions) {
		const { signer, ...callOptions } = options;
		const transaction = this.tx.unsetSuinsReverseLookup(callOptions);
		return this.#executeTransaction(transaction, signer, 'unset SuiNS reverse lookup');
	}
}
