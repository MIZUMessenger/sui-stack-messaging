// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Signer } from '@mysten/sui/cryptography';

import type { Attachment, AttachmentsConfig } from '../attachments/types.js';
import type { RelayerTransport } from './transport.js';

export type SyncStatus =
	| 'SYNC_PENDING'
	| 'SYNCED'
	| 'UPDATE_PENDING'
	| 'UPDATED'
	| 'DELETE_PENDING'
	| 'DELETED';

/**
 * A message as returned by the relayer. */
export interface RelayerMessage {
	messageId: string;
	groupId: string;
	order: number;
	encryptedText: Uint8Array;
	nonce: Uint8Array;
	keyVersion: bigint;
	senderAddress: string;
	createdAt: number;
	updatedAt: number;
	attachments: Attachment[];
	isEdited: boolean;
	isDeleted: boolean;
	syncStatus: SyncStatus;
	quiltPatchId: string | null;
}

/** Parameters for sending a new encrypted message to a group. */
export interface SendMessageParams {
	groupId: string;
	encryptedText: Uint8Array;
	nonce: Uint8Array;
	keyVersion: bigint;
	attachments?: Attachment[];
}

/** Parameters for fetching a paginated list of messages for a group.
 * Only group members can fetch messages. The relayer authenticates the requester.
 * Supports cursor-based pagination via afterOrder and beforeOrder.
 */
export interface FetchMessagesParams {
	groupId: string;
	/** Cursor: fetch messages with order > afterOrder (exclusive lower bound) */
	afterOrder?: number;
	/** Cursor: fetch messages with order < beforeOrder (exclusive upper bound) */
	beforeOrder?: number;
	/** Max messages to return (default: 50, max: 100) */
	limit?: number;
}

/** Parameters for fetching a single message by ID. */
export interface FetchMessageParams {
	messageId: string;
	groupId: string;
}

/** Parameters for updating a message with new encrypted content. */
export interface UpdateMessageParams {
	messageId: string;
	groupId: string;
	encryptedText: Uint8Array;
	nonce: Uint8Array;
	keyVersion: bigint;
	attachments?: Attachment[];
}

/** Parameters for soft-deleting a message. */
export interface DeleteMessageParams {
	messageId: string;
	groupId: string;
}

/** Parameters for subscribing to real-time messages in a group. */
export interface SubscribeParams {
	groupId: string;
	/**
	 * Resume from this order value (exclusive).
	 * Only messages with order > afterOrder will be delivered.
	 * When omitted, subscription starts from the latest messages.
	 */
	afterOrder?: number;
	/** Max messages to return per poll (default: 50, max: 100) */
	limit?: number;
	/** Signal to stop the subscription and free resources */
	signal?: AbortSignal;
}

/** Response from sendMessage. It contains the relayer-assigned message ID. */
export interface SendMessageResult {
	messageId: string;
}

/** Response from fetchMessages paginated list with cursor info. */
export interface FetchMessagesResult {
	messages: RelayerMessage[];
	hasNext: boolean;
}

/**
 * Structured error from the relayer.
 *
 * Maps to the relayer's JSON error responses:
 * - `{ "error": "..." }` for API errors (400, 404, 409, 500)
 * - `{ "error": "...", "code": "..." }` for auth errors (401, 403)
 */
export class RelayerTransportError extends Error {
	/** HTTP status code (e.g., 400, 401, 403, 404, 409, 500) */
	readonly status: number;
	/**
	 * Machine-readable error code from the relayer (e.g., "NOT_GROUP_MEMBER",
	 * "SIGNATURE_VERIFICATION_FAILED"). Only present for auth errors.
	 */
	readonly code?: string;

	constructor(message: string, status: number, code?: string) {
		super(message);
		this.name = 'RelayerTransportError';
		this.status = status;
		this.code = code;
	}
}

/** Base configuration shared by all transport implementations. */
export interface RelayerTransportConfig {
	relayerUrl: string;
	signer: Signer;
}

/** Configuration for the RelayerClient, passed via messagingGroups(). */
export interface RelayerClientConfig {
	/** Pre-configured transport instance. */
	transport: RelayerTransport;
	/**
	 * Attachment support. When omitted, messages cannot include files,
	 * and received attachment refs are not resolvable (preserved in rawAttachments).
	 */
	attachments?: AttachmentsConfig;
}
