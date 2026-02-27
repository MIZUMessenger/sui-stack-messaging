// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export type {
	RelayerMessage,
	SyncStatus,
	SendMessageParams,
	SendMessageResult,
	FetchMessagesParams,
	FetchMessagesResult,
	FetchMessageParams,
	UpdateMessageParams,
	DeleteMessageParams,
	SubscribeParams,
	RelayerTransportConfig,
	RelayerClientConfig,
} from './types.js';

export { RelayerTransportError } from './types.js';

export type { RelayerTransport } from './transport.js';

export { HTTPRelayerTransport, type HTTPRelayerTransportConfig } from './http-transport.js';

export { RelayerClient } from './client.js';
export type {
	DecryptedMessage,
	SendMessageOptions,
	GetMessageOptions,
	GetMessagesOptions,
	GetMessagesResult,
	EditMessageOptions,
	DeleteMessageOptions,
	SubscribeOptions,
} from './client.js';
