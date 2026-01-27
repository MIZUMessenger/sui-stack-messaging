// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export class MessagingGroupsClientError extends Error {}

/**
 * Error thrown when a feature is not yet implemented.
 * This is used for features that are planned but blocked by upstream dependencies.
 */
export class MessagingGroupsNotImplementedError extends Error {
	constructor(feature: string, reason: string) {
		super(`${feature} is not yet implemented: ${reason}`);
		this.name = 'MessagingGroupsNotImplementedError';
	}
}
