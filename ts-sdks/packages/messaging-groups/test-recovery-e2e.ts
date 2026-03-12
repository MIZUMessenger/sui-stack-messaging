/**
 * E2E test for WalrusRecoveryTransport.
 *
 * Prerequisites:
 * - Discovery Indexer running on http://localhost:3001 with discovered patches
 * - (Run `cd e2e && npm run test:messages` first to populate data)
 *
 * This script tests the recovery transport against whatever patches the indexer
 * has already discovered, including DELETED patches (to verify Walrus read + conversion).
 *
 * Run: npx tsx test-recovery-e2e.ts
 */

import { WalrusRecoveryTransport } from './examples/recovery-transport/walrus-recovery-transport.js';
import type { RelayerMessage, FetchMessagesResult } from './src/relayer/types.js';

const INDEXER_URL = 'http://localhost:3001';
const AGGREGATOR_URL = 'https://aggregator.walrus-testnet.walrus.space';

async function main() {
	console.log('=== WalrusRecoveryTransport E2E Test ===\n');

	// 1. Check indexer
	console.log('1. Checking indexer...');
	const healthRes = await fetch(`${INDEXER_URL}/health`).catch(() => null);
	if (!healthRes) {
		console.error('ERROR: Indexer not running on', INDEXER_URL);
		process.exit(1);
	}
	const health = await healthRes.json() as any;
	console.log(`   Indexer: OK (${health.totalGroups} groups, ${health.totalPatches} patches)\n`);

	if (health.totalPatches === 0) {
		console.error('ERROR: No patches in indexer. Run e2e/test:messages first to generate data.');
		process.exit(1);
	}

	// 2. Find a group with patches
	console.log('2. Finding test data...');
	const summary = await fetch(`${INDEXER_URL}/v1/patches`).then((r) => r.json()) as any;
	const groupIds = Object.keys(summary.groups || {});

	if (groupIds.length === 0) {
		console.error('ERROR: No groups found in indexer');
		process.exit(1);
	}

	// Pick the group with the most patches (most likely to have active data)
	let testGroupId = groupIds[0];
	let maxCount = 0;
	for (const gid of groupIds) {
		const count = summary.groups[gid]?.count ?? 0;
		if (count > maxCount) {
			maxCount = count;
			testGroupId = gid;
		}
	}
	const indexerRes = await fetch(`${INDEXER_URL}/v1/groups/${testGroupId}/patches`).then((r) => r.json()) as any;
	const allPatches = indexerRes.patches || [];
	const activePatches = allPatches.filter((p: any) => p.syncStatus !== 'DELETED' && p.syncStatus !== 'DELETE_PENDING');

	console.log(`   Group: ${testGroupId}`);
	console.log(`   Total patches: ${allPatches.length}`);
	console.log(`   Active patches: ${activePatches.length}`);
	console.log(`   Patch statuses: ${allPatches.map((p: any) => p.syncStatus).join(', ')}`);

	// 3. Set up recovery transport
	console.log('\n3. Testing WalrusRecoveryTransport...\n');

	const recovery = new WalrusRecoveryTransport({
		indexerUrl: INDEXER_URL,
		aggregatorUrl: AGGREGATOR_URL,
		onError: (err) => console.error(`   [recovery error] ${err.message}`),
	});

	let allPass = true;
	const fail = (msg: string) => { console.error(`   FAIL: ${msg}`); allPass = false; };
	const pass = (msg: string) => { console.log(`   PASS: ${msg}`); };

	// --- Test 1: recoverMessages (normal — filters out DELETED) ---
	console.log('   --- recoverMessages() ---');
	const result = await recovery.recoverMessages({ groupId: testGroupId });
	console.log(`   Returned ${result.messages.length} messages (active only), hasNext: ${result.hasNext}`);

	if (result.messages.length === activePatches.length) {
		pass(`Got expected ${activePatches.length} active messages`);
	} else if (activePatches.length === 0 && result.messages.length === 0) {
		pass('Correctly returned 0 messages (all patches are DELETED)');
	} else {
		fail(`Expected ${activePatches.length} active messages, got ${result.messages.length}`);
	}

	// Validate message structure for any returned messages
	for (const msg of result.messages) {
		validateMessage(msg, testGroupId, pass, fail);
	}

	// --- Test 2: Direct aggregator read test (bypass DELETED filter) ---
	// If all patches are DELETED, we still want to verify we can read from the aggregator.
	if (allPatches.length > 0 && activePatches.length === 0) {
		console.log('\n   --- Direct aggregator read (DELETED patch) ---');
		console.log('   All patches are DELETED. Testing aggregator read directly...');

		const testPatch = allPatches[0];
		try {
			// List patches in the quilt to get the quilt patch ID
			const patchList = await fetch(`${AGGREGATOR_URL}/v1/quilts/${testPatch.blobId}/patches`).then(r => r.json()) as any[];
			const matchingPatch = patchList.find((p: any) => p.identifier === testPatch.identifier);
			if (!matchingPatch) {
				fail('Patch not found in quilt');
			} else {
				// Read raw content via the aggregator by-quilt-patch-id endpoint
				const patchRes = await fetch(`${AGGREGATOR_URL}/v1/blobs/by-quilt-patch-id/${matchingPatch.patch_id}`);
				const rawText = await patchRes.text();
				console.log(`   Raw text: ${rawText.length} chars`);
				const wire = JSON.parse(rawText) as any;

				console.log(`   Raw Walrus message fields: ${Object.keys(wire).join(', ')}`);
				console.log(`   id: ${wire.id}`);
				console.log(`   sync_status: ${wire.sync_status}`);

				// Verify the wire format matches our expectations
				if (typeof wire.id !== 'string') fail('id should be string');
				else pass('id is string (UUID)');

				if (!Array.isArray(wire.encrypted_msg)) fail('encrypted_msg should be number[]');
				else pass(`encrypted_msg is number[] (${wire.encrypted_msg.length} bytes)`);

				if (!Array.isArray(wire.nonce)) fail('nonce should be number[]');
				else pass(`nonce is number[] (${wire.nonce.length} bytes)`);

				if (typeof wire.created_at !== 'string' || !wire.created_at.includes('T'))
					fail('created_at should be ISO 8601 string');
				else pass('created_at is ISO 8601 string');

				if (typeof wire.key_version !== 'number') fail('key_version should be number');
				else pass('key_version is number');

				const decoded = new TextDecoder().decode(new Uint8Array(wire.encrypted_msg));
				console.log(`   decoded text: "${decoded}"`);
				pass('Successfully read and parsed message from aggregator');
			}
		} catch (err: any) {
			fail(`Failed to read from aggregator: ${err.message}`);
		}
	}

	// --- Test 3: Empty group returns empty ---
	console.log('\n   --- recoverMessages() for non-existent group ---');
	const empty = await recovery.recoverMessages({ groupId: '0x0000000000000000000000000000000000000000000000000000000000000000' });
	if (empty.messages.length === 0) {
		pass('Empty group returns 0 messages');
	} else {
		fail(`Expected 0 messages for non-existent group, got ${empty.messages.length}`);
	}

	// Result
	console.log('\n' + '='.repeat(50));
	if (allPass) {
		console.log('ALL TESTS PASSED');
	} else {
		console.log('SOME TESTS FAILED');
		process.exit(1);
	}
}

function validateMessage(msg: RelayerMessage, expectedGroupId: string, pass: (s: string) => void, fail: (s: string) => void) {
	console.log(`\n   Message: ${msg.messageId}`);
	console.log(`     order: ${msg.order}, sender: ${msg.senderAddress}`);
	console.log(`     encryptedText: Uint8Array(${msg.encryptedText.length})`);
	console.log(`     nonce: Uint8Array(${msg.nonce.length})`);
	console.log(`     keyVersion: ${msg.keyVersion}, syncStatus: ${msg.syncStatus}`);
	console.log(`     isEdited: ${msg.isEdited}, isDeleted: ${msg.isDeleted}`);
	console.log(`     decoded: "${new TextDecoder().decode(msg.encryptedText)}"`);

	if (typeof msg.messageId !== 'string' || msg.messageId.length === 0) fail('Invalid messageId');
	if (msg.groupId !== expectedGroupId) fail(`Wrong groupId: ${msg.groupId}`);
	if (!(msg.encryptedText instanceof Uint8Array) || msg.encryptedText.length === 0) fail('Invalid encryptedText');
	if (!(msg.nonce instanceof Uint8Array)) fail('Invalid nonce');
	if (typeof msg.keyVersion !== 'bigint') fail('keyVersion should be bigint');
	if (typeof msg.createdAt !== 'number' || msg.createdAt === 0) fail('Invalid createdAt');
	if (typeof msg.isEdited !== 'boolean') fail('isEdited should be boolean');
	if (typeof msg.isDeleted !== 'boolean') fail('isDeleted should be boolean');
	if (!Array.isArray(msg.attachments)) fail('attachments should be array');
}

main().catch((err) => {
	console.error('Test failed with error:', err);
	process.exit(1);
});
