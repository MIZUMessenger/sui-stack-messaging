#[test_only]
module groups::permissions_group_tests;

use groups::permissions_group::{
    Self,
    PermissionsGroup,
    PermissionsManager,
    MemberAdder,
    MemberRemover
};
use groups::self_service_actor as actor;
use std::unit_test::destroy;
use sui::test_scenario as ts;

// === Test Addresses ===

const ALICE: address = @0xA11CE;
const BOB: address = @0xB0B;
const CHARLIE: address = @0xC4A1E;

// === Test Witness ===

/// Package witness for testing.
public struct TestWitness() has drop;

// === new tests ===

#[test]
fun new_creates_group_with_creator_as_admin() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let group = permissions_group::new<TestWitness>(ts.ctx());

    // Creator should have all base permissions
    assert!(group.has_permission<TestWitness, PermissionsManager>(ALICE));
    assert!(group.has_permission<TestWitness, MemberAdder>(ALICE));
    assert!(group.has_permission<TestWitness, MemberRemover>(ALICE));
    assert!(group.is_member(ALICE));
    assert!(group.creator<TestWitness>() == ALICE);
    assert!(group.managers_count<TestWitness>() == 1);

    destroy(group);
    ts.end();
}

// === add_member tests ===

#[test]
fun add_member_adds_member_without_permissions() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Alice adds Bob
    group.add_member(BOB, ts.ctx());

    assert!(group.is_member(BOB));
    // Bob has no permissions initially
    assert!(!group.has_permission<TestWitness, PermissionsManager>(BOB));
    assert!(!group.has_permission<TestWitness, MemberAdder>(BOB));
    assert!(!group.has_permission<TestWitness, MemberRemover>(BOB));

    destroy(group);
    ts.end();
}

#[test, expected_failure(abort_code = permissions_group::ENotPermitted)]
fun add_member_without_permission_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());
    group.add_member(BOB, ts.ctx());
    transfer::public_share_object(group);

    // Bob tries to add Charlie without MemberAdder permission
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    group.add_member(CHARLIE, ts.ctx());

    abort
}

#[test, expected_failure(abort_code = permissions_group::EAlreadyMember)]
fun add_member_already_member_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Alice is already a member, trying to add her again fails
    group.add_member(ALICE, ts.ctx());

    abort
}

// === remove_member tests ===

#[test]
fun remove_member_removes_member() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());
    group.add_member(BOB, ts.ctx());

    assert!(group.is_member(BOB));

    // Alice removes Bob
    group.remove_member(BOB, ts.ctx());

    assert!(!group.is_member(BOB));

    destroy(group);
    ts.end();
}

#[test, expected_failure(abort_code = permissions_group::ENotPermitted)]
fun remove_member_without_permission_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());
    group.add_member(BOB, ts.ctx());
    transfer::public_share_object(group);

    // Bob tries to remove Alice without MemberRemover permission
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    group.remove_member(ALICE, ts.ctx());

    abort
}

#[test, expected_failure(abort_code = permissions_group::EMemberNotFound)]
fun remove_member_not_found_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Bob is not a member
    group.remove_member(BOB, ts.ctx());

    abort
}

#[test, expected_failure(abort_code = permissions_group::ELastPermissionsManager)]
fun remove_last_manager_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Add Bob with MemberRemover permission so he can remove Alice
    group.add_member(BOB, ts.ctx());
    group.grant_permission<TestWitness, MemberRemover>(BOB, ts.ctx());
    transfer::public_share_object(group);

    // Bob tries to remove Alice (the last PermissionsManager)
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    group.remove_member(ALICE, ts.ctx());

    abort
}

// === grant_permission tests ===

#[test]
fun grant_permission_grants_permission() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());
    group.add_member(BOB, ts.ctx());

    assert!(!group.has_permission<TestWitness, MemberAdder>(BOB));

    group.grant_permission<TestWitness, MemberAdder>(BOB, ts.ctx());

    assert!(group.has_permission<TestWitness, MemberAdder>(BOB));

    destroy(group);
    ts.end();
}

#[test]
fun grant_permissions_manager_increments_count() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());
    group.add_member(BOB, ts.ctx());

    assert!(group.managers_count<TestWitness>() == 1);

    group.grant_permission<TestWitness, PermissionsManager>(BOB, ts.ctx());

    assert!(group.managers_count<TestWitness>() == 2);
    assert!(group.has_permission<TestWitness, PermissionsManager>(BOB));

    destroy(group);
    ts.end();
}

#[test, expected_failure(abort_code = permissions_group::ENotPermitted)]
fun grant_permission_without_manager_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());
    group.add_member(BOB, ts.ctx());
    group.grant_permission<TestWitness, MemberAdder>(BOB, ts.ctx());
    transfer::public_share_object(group);

    // Bob has MemberAdder but not PermissionsManager
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    group.add_member(CHARLIE, ts.ctx()); // This works
    group.grant_permission<TestWitness, MemberAdder>(CHARLIE, ts.ctx()); // This fails

    abort
}

#[test, expected_failure(abort_code = permissions_group::EMemberNotFound)]
fun grant_permission_to_non_member_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Bob is not a member
    group.grant_permission<TestWitness, MemberAdder>(BOB, ts.ctx());

    abort
}

// === grant_base_permissions tests ===

#[test]
fun grant_base_permissions_grants_all_base() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());
    group.add_member(BOB, ts.ctx());

    assert!(group.managers_count<TestWitness>() == 1);

    group.grant_base_permissions<TestWitness>(BOB, ts.ctx());

    assert!(group.has_permission<TestWitness, PermissionsManager>(BOB));
    assert!(group.has_permission<TestWitness, MemberAdder>(BOB));
    assert!(group.has_permission<TestWitness, MemberRemover>(BOB));
    assert!(group.managers_count<TestWitness>() == 2);

    destroy(group);
    ts.end();
}

// === revoke_permission tests ===

#[test]
fun revoke_permission_revokes_permission() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());
    group.add_member(BOB, ts.ctx());
    group.grant_permission<TestWitness, MemberAdder>(BOB, ts.ctx());

    assert!(group.has_permission<TestWitness, MemberAdder>(BOB));

    group.revoke_permission<TestWitness, MemberAdder>(BOB, ts.ctx());

    // Bob is still a member, just without the permission
    assert!(group.is_member(BOB));
    assert!(!group.has_permission<TestWitness, MemberAdder>(BOB));

    destroy(group);
    ts.end();
}

#[test]
fun revoke_permission_keeps_member_with_other_permissions() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());
    group.add_member(BOB, ts.ctx());
    group.grant_permission<TestWitness, MemberAdder>(BOB, ts.ctx());
    group.grant_permission<TestWitness, MemberRemover>(BOB, ts.ctx());

    group.revoke_permission<TestWitness, MemberAdder>(BOB, ts.ctx());

    // Bob still has MemberRemover, so should still be a member
    assert!(group.is_member(BOB));
    assert!(!group.has_permission<TestWitness, MemberAdder>(BOB));
    assert!(group.has_permission<TestWitness, MemberRemover>(BOB));

    destroy(group);
    ts.end();
}

#[test]
fun revoke_permissions_manager_decrements_count() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());
    group.add_member(BOB, ts.ctx());
    group.grant_permission<TestWitness, PermissionsManager>(BOB, ts.ctx());
    group.grant_permission<TestWitness, MemberAdder>(BOB, ts.ctx()); // Keep Bob as member

    assert!(group.managers_count<TestWitness>() == 2);

    group.revoke_permission<TestWitness, PermissionsManager>(BOB, ts.ctx());

    assert!(group.managers_count<TestWitness>() == 1);

    destroy(group);
    ts.end();
}

#[test, expected_failure(abort_code = permissions_group::ELastPermissionsManager)]
fun revoke_last_permissions_manager_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Cannot revoke Alice's PermissionsManager - she's the only one
    group.revoke_permission<TestWitness, PermissionsManager>(ALICE, ts.ctx());

    abort
}

// === revoke_base_permissions tests ===

#[test]
fun revoke_base_permissions_revokes_base_permissions() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());
    group.add_member(BOB, ts.ctx());
    group.grant_base_permissions<TestWitness>(BOB, ts.ctx());

    assert!(group.managers_count<TestWitness>() == 2);

    group.revoke_base_permissions<TestWitness>(BOB, ts.ctx());

    // Bob is still a member, just without base permissions
    assert!(group.is_member(BOB));
    assert!(!group.has_permission<TestWitness, PermissionsManager>(BOB));
    assert!(!group.has_permission<TestWitness, MemberAdder>(BOB));
    assert!(!group.has_permission<TestWitness, MemberRemover>(BOB));
    assert!(group.managers_count<TestWitness>() == 1);

    destroy(group);
    ts.end();
}

// === Self-Service Actor tests ===
// These tests demonstrate the pattern of using actor objects with wrapper functions.
// The SelfServiceActor module shows how third-party contracts can wrap object_* methods.

#[test]
fun self_service_join_adds_sender() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Create an actor object and grant it MemberAdder
    let self_service = actor::create(ts.ctx());
    let actor_address = self_service.to_address();
    group.add_member(actor_address, ts.ctx());
    group.grant_permission<TestWitness, MemberAdder>(actor_address, ts.ctx());
    transfer::public_share_object(group);

    // Bob uses the actor's join() wrapper to add himself
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    actor::join<TestWitness>(&self_service, &mut group, ts.ctx());

    assert!(group.is_member(BOB));

    ts::return_shared(group);
    actor::destroy(self_service);
    ts.end();
}

#[test, expected_failure(abort_code = permissions_group::ENotPermitted)]
fun self_service_join_without_permission_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Create an actor object WITHOUT MemberAdder
    let self_service = actor::create(ts.ctx());
    let actor_address = self_service.to_address();
    group.add_member(actor_address, ts.ctx());
    transfer::public_share_object(group);

    // Bob tries to join via actor without MemberAdder - fails
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    actor::join<TestWitness>(&self_service, &mut group, ts.ctx());

    abort
}

#[test]
fun self_service_leave_removes_sender() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Create an actor object with MemberRemover
    let self_service = actor::create(ts.ctx());
    let actor_address = self_service.to_address();
    group.add_member(actor_address, ts.ctx());
    group.grant_permission<TestWitness, MemberRemover>(actor_address, ts.ctx());

    // Add Bob
    group.add_member(BOB, ts.ctx());

    assert!(group.is_member(BOB));
    transfer::public_share_object(group);

    // Bob uses the actor's leave() wrapper to remove himself
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    actor::leave<TestWitness>(&self_service, &mut group, ts.ctx());

    assert!(!group.is_member(BOB));

    ts::return_shared(group);
    actor::destroy(self_service);
    ts.end();
}

#[test]
fun self_service_grant_permission_grants_to_sender() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Create an actor object with PermissionsManager
    let self_service = actor::create(ts.ctx());
    let actor_address = self_service.to_address();
    group.add_member(actor_address, ts.ctx());
    group.grant_permission<TestWitness, PermissionsManager>(actor_address, ts.ctx());

    // Add Bob
    group.add_member(BOB, ts.ctx());
    transfer::public_share_object(group);

    // Bob uses the actor's wrapper to grant himself MemberAdder
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    actor::grant_permission<TestWitness, MemberAdder>(&self_service, &mut group, ts.ctx());

    assert!(group.has_permission<TestWitness, MemberAdder>(BOB));

    ts::return_shared(group);
    actor::destroy(self_service);
    ts.end();
}

#[test]
fun self_service_revoke_permission_revokes_from_sender() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Create an actor object with PermissionsManager
    let self_service = actor::create(ts.ctx());
    let actor_address = self_service.to_address();
    group.add_member(actor_address, ts.ctx());
    group.grant_permission<TestWitness, PermissionsManager>(actor_address, ts.ctx());

    // Add Bob with MemberAdder
    group.add_member(BOB, ts.ctx());
    group.grant_permission<TestWitness, MemberAdder>(BOB, ts.ctx());
    group.grant_permission<TestWitness, MemberRemover>(BOB, ts.ctx()); // Keep bob as member
    transfer::public_share_object(group);

    // Bob uses the actor's wrapper to revoke his own MemberAdder
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();

    assert!(group.has_permission<TestWitness, MemberAdder>(BOB));

    actor::revoke_permission<TestWitness, MemberAdder>(&self_service, &mut group, ts.ctx());

    assert!(!group.has_permission<TestWitness, MemberAdder>(BOB));
    assert!(group.is_member(BOB)); // Still has MemberRemover

    ts::return_shared(group);
    actor::destroy(self_service);
    ts.end();
}

#[test]
fun self_service_grant_base_permissions_grants_to_sender() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Create an actor object with PermissionsManager
    let self_service = actor::create(ts.ctx());
    let actor_address = self_service.to_address();
    group.add_member(actor_address, ts.ctx());
    group.grant_permission<TestWitness, PermissionsManager>(actor_address, ts.ctx());

    // Add Bob
    group.add_member(BOB, ts.ctx());

    assert!(group.managers_count<TestWitness>() == 2); // Alice + actor
    transfer::public_share_object(group);

    // Bob uses the actor's wrapper to grant himself all base permissions
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    actor::grant_base_permissions<TestWitness>(&self_service, &mut group, ts.ctx());

    assert!(group.has_permission<TestWitness, PermissionsManager>(BOB));
    assert!(group.has_permission<TestWitness, MemberAdder>(BOB));
    assert!(group.has_permission<TestWitness, MemberRemover>(BOB));
    assert!(group.managers_count<TestWitness>() == 3); // Alice + actor + Bob

    ts::return_shared(group);
    actor::destroy(self_service);
    ts.end();
}

#[test]
fun self_service_revoke_base_permissions_revokes_from_sender() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Create an actor object with PermissionsManager
    let self_service = actor::create(ts.ctx());
    let actor_address = self_service.to_address();
    group.add_member(actor_address, ts.ctx());
    group.grant_permission<TestWitness, PermissionsManager>(actor_address, ts.ctx());

    // Add Bob with base permissions
    group.add_member(BOB, ts.ctx());
    group.grant_base_permissions<TestWitness>(BOB, ts.ctx());

    assert!(group.managers_count<TestWitness>() == 3); // Alice + actor + Bob
    transfer::public_share_object(group);

    // Bob uses the actor's wrapper to revoke his own base permissions
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    actor::revoke_base_permissions<TestWitness>(&self_service, &mut group, ts.ctx());

    assert!(!group.has_permission<TestWitness, PermissionsManager>(BOB));
    assert!(!group.has_permission<TestWitness, MemberAdder>(BOB));
    assert!(!group.has_permission<TestWitness, MemberRemover>(BOB));
    assert!(group.is_member(BOB)); // Still a member
    assert!(group.managers_count<TestWitness>() == 2); // Alice + actor

    ts::return_shared(group);
    actor::destroy(self_service);
    ts.end();
}

#[test]
fun self_service_revoke_all_permissions_revokes_from_sender() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Create an actor object with PermissionsManager
    let self_service = actor::create(ts.ctx());
    let actor_address = self_service.to_address();
    group.add_member(actor_address, ts.ctx());
    group.grant_permission<TestWitness, PermissionsManager>(actor_address, ts.ctx());

    // Add Bob with base permissions
    group.add_member(BOB, ts.ctx());
    group.grant_base_permissions<TestWitness>(BOB, ts.ctx());

    assert!(group.managers_count<TestWitness>() == 3); // Alice + actor + Bob
    transfer::public_share_object(group);

    // Bob uses the actor's wrapper to revoke all his permissions
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    actor::revoke_all_permissions<TestWitness>(&self_service, &mut group, ts.ctx());

    assert!(!group.has_permission<TestWitness, PermissionsManager>(BOB));
    assert!(!group.has_permission<TestWitness, MemberAdder>(BOB));
    assert!(!group.has_permission<TestWitness, MemberRemover>(BOB));
    assert!(group.is_member(BOB)); // Still a member
    assert!(group.managers_count<TestWitness>() == 2); // Alice + actor

    ts::return_shared(group);
    actor::destroy(self_service);
    ts.end();
}

// === revoke_all_permissions tests ===

#[test]
fun revoke_all_permissions_revokes_all() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());
    group.add_member(BOB, ts.ctx());
    group.grant_base_permissions<TestWitness>(BOB, ts.ctx());

    assert!(group.managers_count<TestWitness>() == 2);
    assert!(group.has_permission<TestWitness, PermissionsManager>(BOB));
    assert!(group.has_permission<TestWitness, MemberAdder>(BOB));
    assert!(group.has_permission<TestWitness, MemberRemover>(BOB));

    group.revoke_all_permissions<TestWitness>(BOB, ts.ctx());

    // Bob is still a member, just without any permissions
    assert!(group.is_member(BOB));
    assert!(!group.has_permission<TestWitness, PermissionsManager>(BOB));
    assert!(!group.has_permission<TestWitness, MemberAdder>(BOB));
    assert!(!group.has_permission<TestWitness, MemberRemover>(BOB));
    assert!(group.managers_count<TestWitness>() == 1);

    destroy(group);
    ts.end();
}

#[test, expected_failure(abort_code = permissions_group::ELastPermissionsManager)]
fun revoke_all_permissions_last_manager_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Cannot revoke all permissions from Alice - she's the only manager
    group.revoke_all_permissions<TestWitness>(ALICE, ts.ctx());

    abort
}

// === Getters tests ===

#[test]
fun is_member_returns_correct_value() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    assert!(group.is_member(ALICE));
    assert!(!group.is_member(BOB));

    group.add_member(BOB, ts.ctx());
    assert!(group.is_member(BOB));

    destroy(group);
    ts.end();
}

#[test]
fun creator_returns_original_creator() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let group = permissions_group::new<TestWitness>(ts.ctx());

    assert!(group.creator<TestWitness>() == ALICE);

    destroy(group);
    ts.end();
}
