#[test_only]
module example_app::custom_seal_policy_tests;

use permissioned_groups::permissioned_group::PermissionedGroup;
use messaging::messaging::{Self, Messaging, MessagingNamespace};
use sui::vec_set;
use example_app::custom_seal_policy;
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario::{Self as ts, Scenario};
use std::unit_test::destroy;

const ALICE: address = @0xA11CE;
const SERVICE_FEE: u64 = 10;
const SERVICE_TTL: u64 = 1000;

/// Sets up a messaging group and returns its ID.
/// Uses the real create_group flow with MessagingNamespace and EncryptionHistory.
fun setup_group(ts: &mut Scenario): ID {
    // Initialize the messaging module (creates MessagingNamespace)
    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    // Alice creates group using the real flow
    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<MessagingNamespace>();
    let (group, encryption_history) = messaging::create_group(
        &mut namespace,
        b"test_encrypted_dek",
        vec_set::empty(),
        ts.ctx(),
    );
    let group_id = object::id(&group);
    transfer::public_share_object(group);
    transfer::public_share_object(encryption_history);
    ts::return_shared(namespace);

    group_id
}

#[test]
fun seal_approve_valid_subscription() {
    let mut ts = ts::begin(ALICE);
    let group_id = setup_group(&mut ts);

    // Create service and subscribe
    ts.next_tx(ALICE);
    let clock = clock::create_for_testing(ts.ctx());
    let service = custom_seal_policy::create_service<SUI>(group_id, SERVICE_FEE, SERVICE_TTL, ts.ctx());
    let payment = coin::mint_for_testing<SUI>(SERVICE_FEE, ts.ctx());
    let sub = custom_seal_policy::subscribe(&service, payment, &clock, ts.ctx());

    // Build test ID with service namespace
    let mut test_id = object::id(&service).to_bytes();
    test_id.push_back(42); // nonce

    // Get group for seal_approve
    let group = ts.take_shared<PermissionedGroup<Messaging>>();

    // Should pass at time 0
    custom_seal_policy::seal_approve(test_id, &sub, &service, &group, &clock, ts.ctx());

    // Cleanup
    ts::return_shared(group);
    destroy(service);
    destroy(sub);
    destroy(clock);
    ts.end();
}

#[test]
fun seal_approve_within_ttl() {
    let mut ts = ts::begin(ALICE);
    let group_id = setup_group(&mut ts);

    ts.next_tx(ALICE);
    let mut clock = clock::create_for_testing(ts.ctx());
    let service = custom_seal_policy::create_service<SUI>(group_id, SERVICE_FEE, SERVICE_TTL, ts.ctx());
    let payment = coin::mint_for_testing<SUI>(SERVICE_FEE, ts.ctx());
    let sub = custom_seal_policy::subscribe(&service, payment, &clock, ts.ctx());

    let mut test_id = object::id(&service).to_bytes();
    test_id.push_back(42);

    let group = ts.take_shared<PermissionedGroup<Messaging>>();

    // Should pass at time 500 (within TTL)
    clock.increment_for_testing(500);
    custom_seal_policy::seal_approve(test_id, &sub, &service, &group, &clock, ts.ctx());

    ts::return_shared(group);
    destroy(service);
    destroy(sub);
    destroy(clock);
    ts.end();
}

#[test]
fun seal_approve_at_ttl_boundary() {
    let mut ts = ts::begin(ALICE);
    let group_id = setup_group(&mut ts);

    ts.next_tx(ALICE);
    let mut clock = clock::create_for_testing(ts.ctx());
    let service = custom_seal_policy::create_service<SUI>(group_id, SERVICE_FEE, SERVICE_TTL, ts.ctx());
    let payment = coin::mint_for_testing<SUI>(SERVICE_FEE, ts.ctx());
    let sub = custom_seal_policy::subscribe(&service, payment, &clock, ts.ctx());

    let mut test_id = object::id(&service).to_bytes();
    test_id.push_back(42);

    let group = ts.take_shared<PermissionedGroup<Messaging>>();

    // Should pass at time 1000 (exactly at TTL boundary)
    clock.increment_for_testing(1000);
    custom_seal_policy::seal_approve(test_id, &sub, &service, &group, &clock, ts.ctx());

    ts::return_shared(group);
    destroy(service);
    destroy(sub);
    destroy(clock);
    ts.end();
}

#[test, expected_failure(abort_code = custom_seal_policy::ENoAccess)]
fun seal_approve_expired_subscription() {
    let mut ts = ts::begin(ALICE);
    let group_id = setup_group(&mut ts);

    ts.next_tx(ALICE);
    let mut clock = clock::create_for_testing(ts.ctx());
    let service = custom_seal_policy::create_service<SUI>(group_id, SERVICE_FEE, SERVICE_TTL, ts.ctx());
    let payment = coin::mint_for_testing<SUI>(SERVICE_FEE, ts.ctx());
    let sub = custom_seal_policy::subscribe(&service, payment, &clock, ts.ctx());

    let mut test_id = object::id(&service).to_bytes();
    test_id.push_back(42);

    let group = ts.take_shared<PermissionedGroup<Messaging>>();

    // Should fail at time 1001 (expired)
    clock.increment_for_testing(1001);
    custom_seal_policy::seal_approve(test_id, &sub, &service, &group, &clock, ts.ctx());

    abort // will differ from ENoAccess
}

#[test, expected_failure(abort_code = custom_seal_policy::ENoAccess)]
fun seal_approve_wrong_namespace() {
    let mut ts = ts::begin(ALICE);
    let group_id = setup_group(&mut ts);

    ts.next_tx(ALICE);
    let clock = clock::create_for_testing(ts.ctx());
    let service = custom_seal_policy::create_service<SUI>(group_id, SERVICE_FEE, SERVICE_TTL, ts.ctx());
    let payment = coin::mint_for_testing<SUI>(SERVICE_FEE, ts.ctx());
    let sub = custom_seal_policy::subscribe(&service, payment, &clock, ts.ctx());

    let group = ts.take_shared<PermissionedGroup<Messaging>>();

    // Test with wrong namespace prefix
    let wrong_id = vector[1, 2, 3, 4];
    custom_seal_policy::seal_approve(wrong_id, &sub, &service, &group, &clock, ts.ctx());

    abort // will differ from ENoAccess
}

#[test, expected_failure(abort_code = custom_seal_policy::ENoAccess)]
fun seal_approve_wrong_group() {
    let mut ts = ts::begin(ALICE);

    // Initialize messaging
    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    // Create two groups
    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<MessagingNamespace>();
    let (group1, encryption_history1) = messaging::create_group(
        &mut namespace,
        b"test_encrypted_dek_1",
        vec_set::empty(),
        ts.ctx(),
    );
    let group1_id = object::id(&group1);
    let group2_id: ID;
    transfer::public_share_object(group1);
    transfer::public_share_object(encryption_history1);

    let (group2, encryption_history2) = messaging::create_group(
        &mut namespace,
        b"test_encrypted_dek_2",
        vec_set::empty(),
        ts.ctx(),
    );
    group2_id = object::id(&group2);
    transfer::public_share_object(group2);
    transfer::public_share_object(encryption_history2);
    ts::return_shared(namespace);

    // Service is linked to group1
    ts.next_tx(ALICE);
    let clock = clock::create_for_testing(ts.ctx());
    let service = custom_seal_policy::create_service<SUI>(group1_id, SERVICE_FEE, SERVICE_TTL, ts.ctx());
    let payment = coin::mint_for_testing<SUI>(SERVICE_FEE, ts.ctx());
    let sub = custom_seal_policy::subscribe(&service, payment, &clock, ts.ctx());

    // Build test ID with service namespace
    let mut test_id = object::id(&service).to_bytes();
    test_id.push_back(42);

    // Get group2 (wrong group) by ID
    ts.next_tx(ALICE);
    let group2 = ts.take_shared_by_id<PermissionedGroup<Messaging>>(group2_id);

    // Should fail when passing group2 instead of group1
    custom_seal_policy::seal_approve(test_id, &sub, &service, &group2, &clock, ts.ctx());

    abort // will differ from ENoAccess
}
