// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Signer } from '@mysten/sui/cryptography';
import { parseSerializedSignature } from '@mysten/sui/cryptography';
import { fromHex, toHex } from '@mysten/sui/utils';

import type { Attachment } from '../attachments/types.js';
import type { HttpClientConfig } from '../http/types.js';
import { DEFAULT_HTTP_TIMEOUT } from '../http/types.js';
import { HttpTimeoutError } from '../http/errors.js';
import type { RelayerTransport } from './transport.js';
import type {
	DeleteMessageParams,
	FetchMessageParams,
	FetchMessagesParams,
	FetchMessagesResult,
	RelayerMessage,
	RelayerTransportConfig,
	SendMessageParams,
	SendMessageResult,
	SubscribeParams,
	SyncStatus,
	UpdateMessageParams,
} from './types.js';
import { RelayerTransportError } from './types.js';

/** Configuration for the HTTP polling transport. */
export interface HTTPRelayerTransportConfig extends RelayerTransportConfig, HttpClientConfig {
	pollingIntervalMs?: number;
}

/** Raw attachment JSON shape from the relayer API (snake_case). */
interface WireAttachment {
	storage_id: string;
	nonce: string;
	encrypted_metadata: string;
	metadata_nonce: string;
}

interface WireMessageResponse {
	message_id: string;
	group_id: string;
	order: number;
	encrypted_text: string | null;
	nonce: string | null;
	key_version: number;
	sender_address: string;
	created_at: number;
	updated_at: number;
	attachments: WireAttachment[] | null;
	is_edited: boolean;
	is_deleted: boolean;
	sync_status: string;
	quilt_patch_id: string | null;
}

interface WireMessagesListResponse {
	messages: WireMessageResponse[];
	hasNext: boolean;
}

interface WireCreateMessageResponse {
	message_id: string;
}

interface WireErrorResponse {
	error: string;
	code?: string;
}

/** Convert a wire attachment to a domain Attachment. */
function fromWireAttachment(wire: WireAttachment): Attachment {
	return {
		storageId: wire.storage_id,
		nonce: wire.nonce,
		encryptedMetadata: wire.encrypted_metadata,
		metadataNonce: wire.metadata_nonce,
	};
}

/** Convert a domain Attachment to the wire shape for POST/PUT payloads. */
function toWireAttachment(attachment: Attachment): WireAttachment {
	return {
		storage_id: attachment.storageId,
		nonce: attachment.nonce,
		encrypted_metadata: attachment.encryptedMetadata,
		metadata_nonce: attachment.metadataNonce,
	};
}

/** Convert a relayer JSON message to a RelayerMessage domain object. */
function fromWireMessage(wire: WireMessageResponse): RelayerMessage {
	return {
		messageId: wire.message_id,
		groupId: wire.group_id,
		order: wire.order,
		encryptedText: wire.encrypted_text ? fromHex(wire.encrypted_text) : new Uint8Array(),
		nonce: wire.nonce ? fromHex(wire.nonce) : new Uint8Array(),
		keyVersion: BigInt(wire.key_version ?? 0),
		senderAddress: wire.sender_address,
		createdAt: wire.created_at,
		updatedAt: wire.updated_at,
		attachments: wire.attachments?.map(fromWireAttachment) ?? [],
		isEdited: wire.is_edited,
		isDeleted: wire.is_deleted,
		syncStatus: wire.sync_status as SyncStatus,
		quiltPatchId: wire.quilt_patch_id,
	};
}

function extractRawSignature(serializedSignature: string): Uint8Array {
	const parsed = parseSerializedSignature(serializedSignature);
	if (!parsed.signature) {
		throw new Error(
			'Unsupported signature scheme: only keypair signatures (Ed25519, Secp256k1, Secp256r1) are supported',
		);
	}
	return parsed.signature;
}

function getPublicKeyHex(signer: Signer): string {
	return toHex(signer.getPublicKey().toSuiBytes());
}

async function signAndCreateAuthHeaders(
	signer: Signer,
	messageBytes: Uint8Array,
): Promise<Record<string, string>> {
	const { signature } = await signer.signPersonalMessage(messageBytes);
	const rawSig = extractRawSignature(signature);
	// getPublicKey() is called after signPersonalMessage() so that signers which
	// lazily resolve their key from the first signature (e.g. wallets that don't
	// expose publicKey upfront) have it available by this point.
	return {
		'x-signature': toHex(rawSig),
		'x-public-key': getPublicKeyHex(signer),
	};
}

/**
 * Create body-based auth for POST/PUT requests.
 * Adds sender_address and timestamp to the payload, signs the full JSON body.
 */
async function createBodyAuth(
	signer: Signer,
	payload: Record<string, unknown>,
): Promise<{ body: Record<string, unknown>; headers: Record<string, string> }> {
	const timestamp = Math.floor(Date.now() / 1000);
	const body = {
		...payload,
		sender_address: signer.toSuiAddress(),
		timestamp,
	};
	const bodyStr = JSON.stringify(body);
	const bodyBytes = new TextEncoder().encode(bodyStr);
	const headers = await signAndCreateAuthHeaders(signer, bodyBytes);
	return { body, headers };
}

/**
 * Create header-based auth for GET/DELETE requests.
 * Signs the canonical string "timestamp:senderAddress:groupId".
 */
async function createHeaderAuth(signer: Signer, groupId: string): Promise<Record<string, string>> {
	const timestamp = Math.floor(Date.now() / 1000);
	const senderAddress = signer.toSuiAddress();
	const canonical = `${timestamp}:${senderAddress}:${groupId}`;
	const canonicalBytes = new TextEncoder().encode(canonical);
	const authHeaders = await signAndCreateAuthHeaders(signer, canonicalBytes);
	return {
		...authHeaders,
		'x-sender-address': senderAddress,
		'x-timestamp': timestamp.toString(),
		'x-group-id': groupId,
	};
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal?.aborted) {
			resolve();
			return;
		}
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true },
		);
	});
}

const DEFAULT_POLLING_INTERVAL_MS = 3000;

/**
 * HTTP REST transport for communicating with the off-chain relayer.
 *
 * @example
 * ```ts
 * const transport = new HTTPRelayerTransport({
 *   relayerUrl: 'https://relayer.example.com',
 *   signer: Ed25519Keypair.generate(),
 * });
 *
 * const { messageId } = await transport.sendMessage({
 *   groupId: '0x...',
 *   encryptedText: ciphertext,
 *   nonce: nonce,
 *   keyVersion: 0n,
 * });
 * ```
 */
export class HTTPRelayerTransport implements RelayerTransport {
	readonly #relayerUrl: string;
	readonly #signer: Signer;
	readonly #pollingIntervalMs: number;
	readonly #fetch: typeof globalThis.fetch;
	readonly #timeout: number;
	readonly #onError?: (error: Error) => void;
	#disconnected = false;
	#abortController = new AbortController();

	/** Cache signed auth headers per groupId to avoid re-signing on every poll. */
	readonly #headerAuthCache = new Map<string, { headers: Record<string, string>; createdAt: number }>();
	/** Reuse cached headers for 2 minutes (relayer TTL is 5 minutes). */
	static readonly #HEADER_AUTH_CACHE_TTL_MS = 120_000;

	constructor(config: HTTPRelayerTransportConfig) {
		this.#relayerUrl = config.relayerUrl.replace(/\/+$/, '');
		this.#signer = config.signer;
		this.#pollingIntervalMs = config.pollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS;
		this.#fetch = config.fetch ?? globalThis.fetch.bind(globalThis);
		this.#timeout = config.timeout ?? DEFAULT_HTTP_TIMEOUT;
		this.#onError = config.onError;
	}

	async #cachedHeaderAuth(groupId: string): Promise<Record<string, string>> {
		const cached = this.#headerAuthCache.get(groupId);
		if (cached && Date.now() - cached.createdAt < HTTPRelayerTransport.#HEADER_AUTH_CACHE_TTL_MS) {
			return cached.headers;
		}
		const headers = await createHeaderAuth(this.#signer, groupId);
		this.#headerAuthCache.set(groupId, { headers, createdAt: Date.now() });
		return headers;
	}

	async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
		const wirePayload = {
			group_id: params.groupId,
			encrypted_text: toHex(params.encryptedText),
			nonce: toHex(params.nonce),
			key_version: Number(params.keyVersion),
			attachments: params.attachments?.map(toWireAttachment) ?? [],
		};

		const { body, headers } = await createBodyAuth(this.#signer, wirePayload);
		const response = await this.#request<WireCreateMessageResponse>('/messages', {
			method: 'POST',
			headers: { ...headers, 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});

		return { messageId: response.message_id };
	}

	async fetchMessages(params: FetchMessagesParams): Promise<FetchMessagesResult> {
		const headers = await this.#cachedHeaderAuth(params.groupId);

		const queryParams = new URLSearchParams({ group_id: params.groupId });
		if (params.afterOrder !== undefined) {
			queryParams.set('after_order', params.afterOrder.toString());
		}
		if (params.beforeOrder !== undefined) {
			queryParams.set('before_order', params.beforeOrder.toString());
		}
		if (params.limit !== undefined) {
			queryParams.set('limit', params.limit.toString());
		}

		const wireResponse = await this.#request<WireMessagesListResponse>(
			`/messages?${queryParams.toString()}`,
			{ method: 'GET', headers },
		);

		return {
			messages: wireResponse.messages.map(fromWireMessage),
			hasNext: wireResponse.hasNext,
		};
	}

	async fetchMessage(params: FetchMessageParams): Promise<RelayerMessage> {
		const headers = await this.#cachedHeaderAuth(params.groupId);

		const queryParams = new URLSearchParams({
			message_id: params.messageId,
			group_id: params.groupId,
		});

		const wireResponse = await this.#request<WireMessageResponse>(
			`/messages?${queryParams.toString()}`,
			{ method: 'GET', headers },
		);

		return fromWireMessage(wireResponse);
	}

	async updateMessage(params: UpdateMessageParams): Promise<void> {
		const wirePayload = {
			message_id: params.messageId,
			group_id: params.groupId,
			encrypted_text: toHex(params.encryptedText),
			nonce: toHex(params.nonce),
			key_version: Number(params.keyVersion),
			attachments: params.attachments?.map(toWireAttachment) ?? [],
		};

		const { body, headers } = await createBodyAuth(this.#signer, wirePayload);
		await this.#request('/messages', {
			method: 'PUT',
			headers: { ...headers, 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
	}

	async deleteMessage(params: DeleteMessageParams): Promise<void> {
		const headers = await this.#cachedHeaderAuth(params.groupId);

		await this.#request(`/messages/${params.messageId}`, {
			method: 'DELETE',
			headers,
		});
	}

	async *subscribe(params: SubscribeParams): AsyncIterable<RelayerMessage> {
		let lastOrder = params.afterOrder;

		while (!this.#disconnected && !params.signal?.aborted) {
			try {
				const result = await this.fetchMessages({
					groupId: params.groupId,
					afterOrder: lastOrder,
					limit: params.limit,
				});

				for (const message of result.messages) {
					if (this.#disconnected || params.signal?.aborted) return;
					yield message;
					lastOrder = message.order;
				}

				if (result.messages.length === 0) {
					await delay(this.#pollingIntervalMs, params.signal);
				}
			} catch (error) {
				if (this.#disconnected || params.signal?.aborted) return;
				// Client errors (4xx) are not retryable — throw immediately
				if (error instanceof RelayerTransportError && error.status >= 400 && error.status < 500) {
					throw error;
				}
				await delay(this.#pollingIntervalMs, params.signal);
			}
		}
	}

	disconnect(): void {
		this.#disconnected = true;
		this.#abortController.abort();
		this.#headerAuthCache.clear();
	}

	/**
	 * Make an HTTP request and parse the JSON response.
	 */
	async #request<T>(path: string, init: RequestInit): Promise<T> {
		if (this.#disconnected) {
			throw new RelayerTransportError('Transport is disconnected', 0);
		}

		const url = `${this.#relayerUrl}${path}`;
		const timeoutSignal = AbortSignal.timeout(this.#timeout);
		const combinedSignal = AbortSignal.any([timeoutSignal, this.#abortController.signal]);

		try {
			const response = await this.#fetch(url, {
				...init,
				signal: init.signal ? AbortSignal.any([combinedSignal, init.signal]) : combinedSignal,
			});

			if (!response.ok) {
				await this.#handleErrorResponse(response);
			}

			return response.json() as Promise<T>;
		} catch (error) {
			if (error instanceof Error && error.name === 'TimeoutError') {
				const timeoutError = new HttpTimeoutError(url, this.#timeout);
				this.#onError?.(timeoutError);
				throw timeoutError;
			}
			if (error instanceof Error) {
				this.#onError?.(error);
			}
			throw error;
		}
	}

	/**
	 * Parse an error response from the relayer and throw a RelayerTransportError.
	 * The relayer returns two error shapes:
	 */
	async #handleErrorResponse(response: Response): Promise<never> {
		try {
			const body = (await response.json()) as WireErrorResponse;
			throw new RelayerTransportError(body.error, response.status, body.code);
		} catch (error) {
			if (error instanceof RelayerTransportError) throw error;
			throw new RelayerTransportError(response.statusText, response.status);
		}
	}
}
