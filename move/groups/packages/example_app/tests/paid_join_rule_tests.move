#[test_only]
module example_app::paid_join_rule_tests;

use groups::permissions_group::{PermissionsGroup, MemberAdder};
use messaging::messaging::{Self, Messaging, MessagingNamespace};
use example_app::paid_join_rule::{Self, PaidJoinRule, FundsManager};
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario::{Self as ts, Scenario};

const ALICE: address = @0xA11CE;
const BOB: address = @0xB0B;
const CHARLIE: address = @0xC4A1E;
const FEE: u64 = 100;

/// Sets up a messaging group with a PaidJoinRule that has MemberAdder permission.
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

    // Alice adds rule as member with MemberAdder permission
    // Also grants herself FundsManager permission
    ts.next_tx(ALICE);
    let mut group = ts.take_shared<PermissionsGroup<Messaging>>();
    group.add_member(rule_address, ts.ctx());
    group.grant_permission<Messaging, MemberAdder>(rule_address, ts.ctx());
    group.grant_permission<Messaging, FundsManager>(ALICE, ts.ctx());
    ts::return_shared(group);

    group_id
}

#[test]
fun test_join_with_exact_fee() {
    let mut ts = ts::begin(ALICE);
    setup_for_testing(&mut ts);

    // Bob joins by paying exact fee
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());

    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());

    assert!(group.is_member(BOB));
    assert!(payment.value() == 0); // Exact fee, nothing left
    assert!(paid_join_rule::balance_value(&rule) == FEE);

    payment.burn_for_testing();
    ts::return_shared(rule);
    ts::return_shared(group);
    ts.end();
}

#[test]
fun test_join_with_excess_payment() {
    let mut ts = ts::begin(ALICE);
    setup_for_testing(&mut ts);

    // Bob pays 150, keeps 50
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(150, ts.ctx());

    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());

    assert!(group.is_member(BOB));
    assert!(payment.value() == 50); // Got 50 back
    assert!(paid_join_rule::balance_value(&rule) == FEE);

    payment.burn_for_testing();
    ts::return_shared(rule);
    ts::return_shared(group);
    ts.end();
}

#[test]
#[expected_failure(abort_code = paid_join_rule::EInsufficientPayment)]
fun test_join_with_insufficient_payment() {
    let mut ts = ts::begin(ALICE);
    setup_for_testing(&mut ts);

    // Bob pays only 50 (insufficient)
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(50, ts.ctx());

    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());

    payment.burn_for_testing();
    ts::return_shared(rule);
    ts::return_shared(group);
    ts.end();
}

#[test]
#[expected_failure]
fun test_join_without_rule_permission() {
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
        ts.ctx(),
    );
    let group_id = object::id(&group);
    transfer::public_share_object(group);
    transfer::public_share_object(encryption_history);
    ts::return_shared(namespace);

    // Create rule but DON'T add it as member with permission
    ts.next_tx(ALICE);
    let rule = paid_join_rule::new<SUI>(group_id, FEE, ts.ctx());
    paid_join_rule::share(rule);

    // Bob tries to join but rule doesn't have MemberAdder permission
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());

    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());

    payment.burn_for_testing();
    ts::return_shared(rule);
    ts::return_shared(group);
    ts.end();
}

#[test]
#[expected_failure(abort_code = groups::permissions_group::EAlreadyMember)]
fun test_join_twice_fails() {
    let mut ts = ts::begin(ALICE);
    setup_for_testing(&mut ts);

    // Bob joins first time
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());
    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());
    payment.burn_for_testing();
    ts::return_shared(rule);
    ts::return_shared(group);

    // Bob tries to join again - should fail (already a member)
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());
    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());

    payment.burn_for_testing();
    ts::return_shared(rule);
    ts::return_shared(group);
    ts.end();
}

#[test]
fun test_withdraw_funds() {
    let mut ts = ts::begin(ALICE);
    setup_for_testing(&mut ts);

    // Bob joins, paying the fee
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());
    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());
    payment.burn_for_testing();
    ts::return_shared(rule);
    ts::return_shared(group);

    // Alice (FundsManager) withdraws the accumulated funds
    ts.next_tx(ALICE);
    let group = ts.take_shared<PermissionsGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();

    assert!(paid_join_rule::balance_value(&rule) == FEE);
    let withdrawn = paid_join_rule::withdraw(&mut rule, &group, FEE, ts.ctx());
    assert!(withdrawn.value() == FEE);
    assert!(paid_join_rule::balance_value(&rule) == 0);

    withdrawn.burn_for_testing();
    ts::return_shared(rule);
    ts::return_shared(group);
    ts.end();
}

#[test]
fun test_withdraw_all_funds() {
    let mut ts = ts::begin(ALICE);
    setup_for_testing(&mut ts);

    // Bob and Charlie join, each paying the fee
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());
    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());
    payment.burn_for_testing();
    ts::return_shared(rule);
    ts::return_shared(group);

    ts.next_tx(CHARLIE);
    let mut group = ts.take_shared<PermissionsGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());
    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());
    payment.burn_for_testing();
    ts::return_shared(rule);
    ts::return_shared(group);

    // Alice withdraws all accumulated funds (2 * FEE)
    ts.next_tx(ALICE);
    let group = ts.take_shared<PermissionsGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();

    assert!(paid_join_rule::balance_value(&rule) == 2 * FEE);
    let withdrawn = paid_join_rule::withdraw_all(&mut rule, &group, ts.ctx());
    assert!(withdrawn.value() == 2 * FEE);
    assert!(paid_join_rule::balance_value(&rule) == 0);

    withdrawn.burn_for_testing();
    ts::return_shared(rule);
    ts::return_shared(group);
    ts.end();
}

#[test]
#[expected_failure(abort_code = paid_join_rule::ENotPermitted)]
fun test_withdraw_without_permission() {
    let mut ts = ts::begin(ALICE);
    setup_for_testing(&mut ts);

    // Bob joins, paying the fee
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());
    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());
    payment.burn_for_testing();
    ts::return_shared(rule);
    ts::return_shared(group);

    // Bob (not FundsManager) tries to withdraw - should fail
    ts.next_tx(BOB);
    let group = ts.take_shared<PermissionsGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();

    let withdrawn = paid_join_rule::withdraw(&mut rule, &group, FEE, ts.ctx());

    withdrawn.burn_for_testing();
    ts::return_shared(rule);
    ts::return_shared(group);
    ts.end();
}

#[test]
#[expected_failure(abort_code = paid_join_rule::EInsufficientBalance)]
fun test_withdraw_insufficient_balance() {
    let mut ts = ts::begin(ALICE);
    setup_for_testing(&mut ts);

    // Bob joins, paying the fee
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());
    paid_join_rule::join(&mut rule, &mut group, &mut payment, ts.ctx());
    payment.burn_for_testing();
    ts::return_shared(rule);
    ts::return_shared(group);

    // Alice tries to withdraw more than available
    ts.next_tx(ALICE);
    let group = ts.take_shared<PermissionsGroup<Messaging>>();
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();

    let withdrawn = paid_join_rule::withdraw(&mut rule, &group, FEE + 1, ts.ctx());

    withdrawn.burn_for_testing();
    ts::return_shared(rule);
    ts::return_shared(group);
    ts.end();
}

#[test]
#[expected_failure(abort_code = paid_join_rule::EGroupMismatch)]
fun test_join_wrong_group() {
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
        ts.ctx(),
    );
    let group1_id = object::id(&group1);
    transfer::public_share_object(group1);
    transfer::public_share_object(encryption_history1);

    let (group2, encryption_history2) = messaging::create_group(
        &mut namespace,
        b"test_encrypted_dek_2",
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

    // Add rule to group1 with permission
    ts.next_tx(ALICE);
    let mut group1 = ts.take_shared_by_id<PermissionsGroup<Messaging>>(group1_id);
    group1.add_member(rule_address, ts.ctx());
    group1.grant_permission<Messaging, MemberAdder>(rule_address, ts.ctx());
    ts::return_shared(group1);

    // Bob tries to join group2 using rule that's for group1 - should fail
    ts.next_tx(BOB);
    let mut group2 = ts.take_shared_by_id<PermissionsGroup<Messaging>>(group2_id);
    let mut rule = ts.take_shared<PaidJoinRule<SUI>>();
    let mut payment = coin::mint_for_testing<SUI>(FEE, ts.ctx());

    paid_join_rule::join(&mut rule, &mut group2, &mut payment, ts.ctx());

    payment.burn_for_testing();
    ts::return_shared(rule);
    ts::return_shared(group2);
    ts.end();
}
