// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { MessagingGroupsDerive } from '../../src/derive.js';

const MOCK_PACKAGE_ID = '0x' + 'ab'.repeat(32);
const MOCK_NAMESPACE_ID = '0x' + '99'.repeat(32);
const MOCK_VERSION_ID = '0x' + '11'.repeat(32);

function createDerive() {
	return new MessagingGroupsDerive({
		packageConfig: {
			originalPackageId: MOCK_PACKAGE_ID,
			latestPackageId: MOCK_PACKAGE_ID,
			namespaceId: MOCK_NAMESPACE_ID,
			versionId: MOCK_VERSION_ID,
		},
	});
}

describe('MessagingGroupsDerive', () => {
	describe('groupId', () => {
		it('should return a deterministic ID for a given UUID', () => {
			const derive = createDerive();
			const id = derive.groupId({ uuid: 'test-uuid' });

			expect(id).toBeDefined();
			expect(typeof id).toBe('string');
			expect(id.startsWith('0x')).toBe(true);
		});

		it('should return different IDs for different UUIDs', () => {
			const derive = createDerive();
			const id1 = derive.groupId({ uuid: 'uuid-1' });
			const id2 = derive.groupId({ uuid: 'uuid-2' });

			expect(id1).not.toBe(id2);
		});

		it('should return same ID on repeated calls (pure function)', () => {
			const derive = createDerive();
			const id1 = derive.groupId({ uuid: 'stable-uuid' });
			const id2 = derive.groupId({ uuid: 'stable-uuid' });

			expect(id1).toBe(id2);
		});
	});

	describe('groupLeaverId', () => {
		it('should return a deterministic ID', () => {
			const derive = createDerive();
			const id = derive.groupLeaverId();

			expect(id).toBeDefined();
			expect(typeof id).toBe('string');
			expect(id.startsWith('0x')).toBe(true);
		});

		it('should return same ID on repeated calls (pure function)', () => {
			const derive = createDerive();
			expect(derive.groupLeaverId()).toBe(derive.groupLeaverId());
		});

		it('should differ from groupId and encryptionHistoryId', () => {
			const derive = createDerive();
			const leaverId = derive.groupLeaverId();
			const groupId = derive.groupId({ uuid: 'any-uuid' });
			const encHistId = derive.encryptionHistoryId({ uuid: 'any-uuid' });

			expect(leaverId).not.toBe(groupId);
			expect(leaverId).not.toBe(encHistId);
		});
	});

	describe('encryptionHistoryId', () => {
		it('should return a deterministic ID for a given UUID', () => {
			const derive = createDerive();
			const id = derive.encryptionHistoryId({ uuid: 'test-uuid' });

			expect(id).toBeDefined();
			expect(typeof id).toBe('string');
			expect(id.startsWith('0x')).toBe(true);
		});

		it('should differ from groupId for the same UUID', () => {
			const derive = createDerive();
			const uuid = 'same-uuid';
			const groupId = derive.groupId({ uuid });
			const encHistId = derive.encryptionHistoryId({ uuid });

			expect(groupId).not.toBe(encHistId);
		});

		it('should return same ID on repeated calls (pure function)', () => {
			const derive = createDerive();
			const id1 = derive.encryptionHistoryId({ uuid: 'stable-uuid' });
			const id2 = derive.encryptionHistoryId({ uuid: 'stable-uuid' });

			expect(id1).toBe(id2);
		});
	});
});
