#[test_only]
module messaging::seal_policies_tests;

use groups::permissions_group::PermissionsGroup;
use messaging::messaging::{Self, Messaging, MessagingNamespace, MessagingReader, MessagingSender};
use messaging::seal_policies;
use sui::test_scenario as ts;
use sui::vec_set;

// === Test Addresses ===

const ALICE: address = @0xA11CE;
const BOB: address = @0xB0B;

// === Test Data ===

const TEST_ENCRYPTED_DEK: vector<u8> = b"test_encrypted_dek";
const NONCE: vector<u8> = b"unique_nonce_1";
const NONCE2: vector<u8> = b"unique_nonce_2";
const NONCE3: vector<u8> = b"unique_nonce_3";

/// Builds a valid Seal identity with the creator's address as namespace prefix.
/// Format: [creator_address (32 bytes)][nonce]
fun build_identity(creator: address, nonce: vector<u8>): vector<u8> {
    let mut id = creator.to_bytes();
    id.append(nonce);
    id
}

/// Sets up a messaging group and returns its ID.
fun setup_group(ts: &mut ts::Scenario): ID {
    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<MessagingNamespace>();
    let (group, encryption_history) = messaging::create_group(
        &mut namespace,
        TEST_ENCRYPTED_DEK,
        vec_set::empty(),
        ts.ctx(),
    );
    let group_id = object::id(&group);
    transfer::public_share_object(group);
    transfer::public_share_object(encryption_history);
    ts::return_shared(namespace);

    group_id
}

// === seal_approve_reader tests ===

#[test]
fun seal_approve_reader_valid_namespace_and_permission() {
    let mut ts = ts::begin(ALICE);
    setup_group(&mut ts);

    ts.next_tx(ALICE);
    let group = ts.take_shared<PermissionsGroup<Messaging>>();

    // Build valid identity with Alice's address as namespace
    let id = build_identity(ALICE, NONCE);

    // Alice has MessagingReader permission (granted on group creation)
    seal_policies::seal_approve_reader(id, &group, ts.ctx());

    ts::return_shared(group);
    ts.end();
}

#[test]
fun seal_approve_reader_with_different_nonces() {
    let mut ts = ts::begin(ALICE);
    setup_group(&mut ts);

    ts.next_tx(ALICE);
    let group = ts.take_shared<PermissionsGroup<Messaging>>();

    // Different nonces should all work as long as namespace prefix matches
    seal_policies::seal_approve_reader(build_identity(ALICE, NONCE), &group, ts.ctx());
    seal_policies::seal_approve_reader(build_identity(ALICE, NONCE2), &group, ts.ctx());
    seal_policies::seal_approve_reader(build_identity(ALICE, NONCE3), &group, ts.ctx());

    ts::return_shared(group);
    ts.end();
}

#[test]
fun seal_approve_reader_member_with_reader_permission() {
    let mut ts = ts::begin(ALICE);
    setup_group(&mut ts);

    // Alice grants Bob MessagingReader
    ts.next_tx(ALICE);
    let mut group = ts.take_shared<PermissionsGroup<Messaging>>();
    group.grant_permission<Messaging, MessagingReader>(BOB, ts.ctx());
    ts::return_shared(group);

    // Bob should be able to approve
    ts.next_tx(BOB);
    let group = ts.take_shared<PermissionsGroup<Messaging>>();
    let id = build_identity(group.creator<Messaging>(), NONCE);
    seal_policies::seal_approve_reader(id, &group, ts.ctx());

    ts::return_shared(group);
    ts.end();
}

#[test, expected_failure(abort_code = seal_policies::EInvalidNamespace)]
fun seal_approve_reader_invalid_namespace_fails() {
    let mut ts = ts::begin(ALICE);
    setup_group(&mut ts);

    ts.next_tx(ALICE);
    let group = ts.take_shared<PermissionsGroup<Messaging>>();

    // Build identity with wrong namespace (Bob's address instead of Alice's)
    let id = build_identity(BOB, NONCE);

    seal_policies::seal_approve_reader(id, &group, ts.ctx());

    abort
}

#[test, expected_failure(abort_code = seal_policies::EInvalidNamespace)]
fun seal_approve_reader_short_id_fails() {
    let mut ts = ts::begin(ALICE);
    setup_group(&mut ts);

    ts.next_tx(ALICE);
    let group = ts.take_shared<PermissionsGroup<Messaging>>();

    // ID shorter than 32 bytes (address length)
    let short_id = vector[1, 2, 3, 4];

    seal_policies::seal_approve_reader(short_id, &group, ts.ctx());

    abort
}

#[test, expected_failure(abort_code = seal_policies::ENotPermitted)]
fun seal_approve_reader_without_permission_fails() {
    let mut ts = ts::begin(ALICE);
    setup_group(&mut ts);

    // Alice grants Bob a permission but NOT MessagingReader
    ts.next_tx(ALICE);
    let mut group = ts.take_shared<PermissionsGroup<Messaging>>();
    group.grant_permission<Messaging, MessagingSender>(BOB, ts.ctx());
    ts::return_shared(group);

    // Bob tries to approve but doesn't have MessagingReader
    ts.next_tx(BOB);
    let group = ts.take_shared<PermissionsGroup<Messaging>>();
    let id = build_identity(group.creator<Messaging>(), NONCE);

    seal_policies::seal_approve_reader(id, &group, ts.ctx());

    abort
}

#[test, expected_failure]
fun seal_approve_reader_non_member_fails() {
    let mut ts = ts::begin(ALICE);
    setup_group(&mut ts);

    // Bob is not a member at all - this fails at the table lookup level
    // when has_permission tries to borrow from the permissions table
    ts.next_tx(BOB);
    let group = ts.take_shared<PermissionsGroup<Messaging>>();
    let id = build_identity(group.creator<Messaging>(), NONCE);

    seal_policies::seal_approve_reader(id, &group, ts.ctx());

    abort
}
