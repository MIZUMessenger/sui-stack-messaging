#[test_only]
module example_app::paid_join_rule_tests;

use permissioned_groups::permissioned_group::{PermissionedGroup, ExtensionPermissionsManager};
use messaging::messaging::{Self, Messaging, MessagingNamespace, MessagingReader};
use sui::vec_set;
use example_app::paid_join_rule::{Self, PaidJoinRule, FundsManager};
use std::unit_test::{assert_eq, destroy};
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario::{Self as ts, Scenario};

const ALICE: address = @0xA11CE;
const BOB: address = @0xB0B;
const CHARLIE: address = @0xC4A1E;
const FEE: u64 = 100;

/// Sets up a messaging group with a PaidJoinRule that has ExtensionPermissionsManager permission.
/// Uses the real create_group flow with MessagingNamespace and EncryptionHistory.
/// Returns the group_id for use in tests.
fun setup_for_testing(ts: &mut Scenario): ID {
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

    // Alice creates rule and shares it
    ts.next_tx(ALICE);
    let rule = paid_join_rule::new<SUI>(group_id, FEE, ts.ctx());
    let rule_address = object::id(&rule).to_address();
    paid_join_rule::share(rule);

    // Alice grants ExtensionPermissionsManager to the rule so it can add members
    // Also grants herself FundsManager permission
    ts.next_tx(ALICE);
    let mut group = ts.take_shared<PermissionedGroup<Messaging>>();
    group.grant_permission<Messaging, ExtensionPermissionsManager>(rule_address, ts.ctx());
    group.grant_permission<Messaging, FundsManager>(ALICE, ts.ctx());
    ts::return_shared(group);

    group_id
}

#[test]
fun join_with_exact_fee() {
    let mut ts = ts::begin(ALICE);
    setup_for_testing(&mut ts);

    // Bob joins by paying exact fee
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());

    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());

    assert!(group.is_member(BOB));
    assert_eq!(payment.value(), 0); // Exact fee, nothing left
    assert_eq!(paid_join_rule::balance_value(&rule), FEE);

    destroy(payment);
    ts::return_shared(rule);
    ts::return_shared(group);
    ts.end();
}

#[test]
fun join_with_excess_payment() {
    let mut ts = ts::begin(ALICE);
    setup_for_testing(&mut ts);

    // Bob pays 150, keeps 50
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(150, ts.ctx());

    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());

    assert!(group.is_member(BOB));
    assert_eq!(payment.value(), 50); // Got 50 back
    assert_eq!(paid_join_rule::balance_value(&rule), FEE);

    destroy(payment);
    ts::return_shared(rule);
    ts::return_shared(group);
    ts.end();
}

#[test, expected_failure(abort_code = paid_join_rule::EInsufficientPayment)]
fun join_with_insufficient_payment() {
    let mut ts = ts::begin(ALICE);
    setup_for_testing(&mut ts);

    // Bob pays only 50 (insufficient)
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(50, ts.ctx());

    // This call aborts with EInsufficientPayment
    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());

    abort // will differ from EInsufficientPayment
}

#[test, expected_failure(abort_code = sui::dynamic_field::EFieldDoesNotExist)]
fun join_rule_not_member() {
    let mut ts = ts::begin(ALICE);

    // Initialize messaging module
    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    // Create group without setting up the rule with permissions
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

    // Create rule but DON'T add it as a member at all
    ts.next_tx(ALICE);
    let rule = paid_join_rule::new<SUI>(group_id, FEE, ts.ctx());
    paid_join_rule::share(rule);

    // Bob tries to join but rule is not a member of the group
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());

    // This call aborts because rule is not in the group's permissions table
    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());

    abort
}

#[test, expected_failure(abort_code = permissioned_groups::permissioned_group::ENotPermitted)]
fun join_rule_without_manager_permission() {
    let mut ts = ts::begin(ALICE);

    // Initialize messaging module
    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    // Create group
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

    // Create rule
    ts.next_tx(ALICE);
    let rule = paid_join_rule::new<SUI>(group_id, FEE, ts.ctx());
    let rule_address = object::id(&rule).to_address();
    paid_join_rule::share(rule);

    // Grant rule only MessagingReader (not ExtensionPermissionsManager)
    ts.next_tx(ALICE);
    let mut group = ts.take_shared<PermissionedGroup<Messaging>>();
    group.grant_permission<Messaging, MessagingReader>(rule_address, ts.ctx());
    ts::return_shared(group);

    // Bob tries to join but rule only has MessagingReader, not ExtensionPermissionsManager
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());

    // This call aborts with ENotPermitted because rule lacks ExtensionPermissionsManager
    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());

    abort
}

#[test, expected_failure(abort_code = sui::vec_set::EKeyAlreadyExists)]
fun join_twice_fails() {
    let mut ts = ts::begin(ALICE);
    setup_for_testing(&mut ts);

    // Bob joins first time
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());
    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());
    destroy(payment);
    ts::return_shared(rule);
    ts::return_shared(group);

    // Bob tries to join again - should fail (already has MessagingReader permission)
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());

    // This call aborts because Bob already has MessagingReader permission
    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());

    abort
}

#[test]
fun withdraw_funds() {
    let mut ts = ts::begin(ALICE);
    setup_for_testing(&mut ts);

    // Bob joins, paying the fee
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());
    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());
    destroy(payment);
    ts::return_shared(rule);
    ts::return_shared(group);

    // Alice (FundsManager) withdraws the accumulated funds
    ts.next_tx(ALICE);
    let group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();

    assert_eq!(paid_join_rule::balance_value(&rule), FEE);
    let withdrawn = paid_join_rule::withdraw(&mut rule, &group, FEE, ts.ctx());
    assert_eq!(withdrawn.value(), FEE);
    assert_eq!(paid_join_rule::balance_value(&rule), 0);

    destroy(withdrawn);
    ts::return_shared(rule);
    ts::return_shared(group);
    ts.end();
}

#[test]
fun withdraw_all_funds() {
    let mut ts = ts::begin(ALICE);
    setup_for_testing(&mut ts);

    // Bob and Charlie join, each paying the fee
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());
    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());
    destroy(payment);
    ts::return_shared(rule);
    ts::return_shared(group);

    ts.next_tx(CHARLIE);
    let mut group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());
    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());
    destroy(payment);
    ts::return_shared(rule);
    ts::return_shared(group);

    // Alice withdraws all accumulated funds (2 * FEE)
    ts.next_tx(ALICE);
    let group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();

    assert_eq!(paid_join_rule::balance_value(&rule), 2 * FEE);
    let withdrawn = paid_join_rule::withdraw_all(&mut rule, &group, ts.ctx());
    assert_eq!(withdrawn.value(), 2 * FEE);
    assert_eq!(paid_join_rule::balance_value(&rule), 0);

    destroy(withdrawn);
    ts::return_shared(rule);
    ts::return_shared(group);
    ts.end();
}

#[test, expected_failure(abort_code = paid_join_rule::ENotPermitted)]
fun withdraw_without_permission() {
    let mut ts = ts::begin(ALICE);
    setup_for_testing(&mut ts);

    // Bob joins, paying the fee
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());
    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());
    destroy(payment);
    ts::return_shared(rule);
    ts::return_shared(group);

    // Bob (not FundsManager) tries to withdraw - should fail
    ts.next_tx(BOB);
    let group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();

    // This call aborts with ENotPermitted
    let _withdrawn = paid_join_rule::withdraw(&mut rule, &group, FEE, ts.ctx());

    abort // will differ from ENotPermitted
}

#[test, expected_failure(abort_code = paid_join_rule::EInsufficientBalance)]
fun withdraw_insufficient_balance() {
    let mut ts = ts::begin(ALICE);
    setup_for_testing(&mut ts);

    // Bob joins, paying the fee
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());
    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());
    destroy(payment);
    ts::return_shared(rule);
    ts::return_shared(group);

    // Alice tries to withdraw more than available
    ts.next_tx(ALICE);
    let group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();

    // This call aborts with EInsufficientBalance
    let _withdrawn = paid_join_rule::withdraw(&mut rule, &group, FEE + 1, ts.ctx());

    abort // will differ from EInsufficientBalance
}

#[test, expected_failure(abort_code = paid_join_rule::EGroupMismatch)]
fun join_wrong_group() {
    let mut ts = ts::begin(ALICE);

    // Initialize messaging module
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
    transfer::public_share_object(group1);
    transfer::public_share_object(encryption_history1);

    let (group2, encryption_history2) = messaging::create_group(
        &mut namespace,
        b"test_encrypted_dek_2",
        vec_set::empty(),
        ts.ctx(),
    );
    let group2_id = object::id(&group2);
    transfer::public_share_object(group2);
    transfer::public_share_object(encryption_history2);
    ts::return_shared(namespace);

    // Create rule for group1
    ts.next_tx(ALICE);
    let rule = paid_join_rule::new<SUI>(group1_id, FEE, ts.ctx());
    let rule_address = object::id(&rule).to_address();
    paid_join_rule::share(rule);

    // Grant ExtensionPermissionsManager to the rule on group1
    ts.next_tx(ALICE);
    let mut group1 = ts.take_shared_by_id<PermissionedGroup<Messaging>>(group1_id);
    group1.grant_permission<Messaging, ExtensionPermissionsManager>(rule_address, ts.ctx());
    ts::return_shared(group1);

    // Bob tries to join group2 using rule that's for group1 - should fail
    ts.next_tx(BOB);
    let mut group2 = ts.take_shared_by_id<PermissionedGroup<Messaging>>(group2_id);
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());

    // This call aborts with EGroupMismatch
    paid_join_rule::join(&mut rule, &mut group2, &mut payment, ts.ctx());

    abort
}
