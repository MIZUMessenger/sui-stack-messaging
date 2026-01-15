#[test_only]
module groups::permissions_group_tests;

use groups::permissions_group::{
    Self,
    PermissionsGroup,
    CorePermissionsManager,
    ExtensionPermissionsManager
};
use std::unit_test::destroy;
use sui::test_scenario as ts;

// === Test Addresses ===

const ALICE: address = @0xA11CE;
const BOB: address = @0xB0B;
const CHARLIE: address = @0xC4A1E;

// === Test Witness ===

/// Package witness for testing.
public struct TestWitness() has drop;

/// Extension permission for testing.
public struct CustomPermission() has drop;

// === Test Derivation Key ===

/// Derivation key for testing new_derived.
public struct TestDerivationKey(u64) has copy, drop, store;

// === Test Namespace ===

/// Shared object used as namespace for deriving group addresses in tests.
public struct TestNamespace has key {
    id: UID,
}

// === new tests ===

#[test]
fun new_creates_group_with_creator_as_core_manager() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let group = permissions_group::new<TestWitness>(ts.ctx());

    // Creator should have all core permissions
    assert!(group.has_permission<TestWitness, CorePermissionsManager>(ALICE));
    assert!(group.has_permission<TestWitness, ExtensionPermissionsManager>(ALICE));
    assert!(group.is_member(ALICE));
    assert!(group.creator<TestWitness>() == ALICE);
    assert!(group.core_managers_count<TestWitness>() == 1);

    destroy(group);
    ts.end();
}

// === grant_permission tests ===

#[test]
fun grant_permission_adds_new_member() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Alice grants CustomPermission to Bob (Bob doesn't exist yet)
    group.grant_permission<TestWitness, CustomPermission>(BOB, ts.ctx());

    assert!(group.is_member(BOB));
    assert!(group.has_permission<TestWitness, CustomPermission>(BOB));

    destroy(group);
    ts.end();
}

#[test]
fun grant_permission_to_existing_member() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Add Bob with CustomPermission
    group.grant_permission<TestWitness, CustomPermission>(BOB, ts.ctx());

    // Grant CorePermissionsManager to Bob (already a member)
    group.grant_permission<TestWitness, CorePermissionsManager>(BOB, ts.ctx());

    assert!(group.is_member(BOB));
    assert!(group.has_permission<TestWitness, CustomPermission>(BOB));
    assert!(group.has_permission<TestWitness, CorePermissionsManager>(BOB));
    assert!(group.core_managers_count<TestWitness>() == 2);

    destroy(group);
    ts.end();
}

#[test]
fun grant_core_manager_increments_count() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    assert!(group.core_managers_count<TestWitness>() == 1);

    group.grant_permission<TestWitness, CorePermissionsManager>(BOB, ts.ctx());
    assert!(group.core_managers_count<TestWitness>() == 2);

    destroy(group);
    ts.end();
}

#[test]
fun extension_manager_can_grant_custom_permission() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Grant ExtensionPermissionsManager to Bob
    group.grant_permission<TestWitness, ExtensionPermissionsManager>(BOB, ts.ctx());
    transfer::public_share_object(group);

    // Bob grants CustomPermission to Charlie
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    group.grant_permission<TestWitness, CustomPermission>(CHARLIE, ts.ctx());

    assert!(group.has_permission<TestWitness, CustomPermission>(CHARLIE));

    ts::return_shared(group);
    ts.end();
}

#[test, expected_failure(abort_code = permissions_group::ENotPermitted)]
fun extension_manager_cannot_grant_core_manager() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Grant only ExtensionPermissionsManager to Bob
    group.grant_permission<TestWitness, ExtensionPermissionsManager>(BOB, ts.ctx());
    transfer::public_share_object(group);

    // Bob tries to grant CorePermissionsManager to Charlie (should fail)
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    group.grant_permission<TestWitness, CorePermissionsManager>(CHARLIE, ts.ctx());

    abort
}

#[test, expected_failure(abort_code = permissions_group::ENotPermitted)]
fun non_manager_cannot_grant_permission() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Grant CustomPermission to Bob (not a manager permission)
    group.grant_permission<TestWitness, CustomPermission>(BOB, ts.ctx());
    transfer::public_share_object(group);

    // Bob tries to grant permission to Charlie (should fail)
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    group.grant_permission<TestWitness, CustomPermission>(CHARLIE, ts.ctx());

    abort
}

// === revoke_permission tests ===

#[test]
fun revoke_permission_keeps_member_if_has_other_permissions() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Grant Bob both CustomPermission and ExtensionPermissionsManager
    group.grant_permission<TestWitness, CustomPermission>(BOB, ts.ctx());
    group.grant_permission<TestWitness, ExtensionPermissionsManager>(BOB, ts.ctx());

    // Revoke CustomPermission
    group.revoke_permission<TestWitness, CustomPermission>(BOB, ts.ctx());

    // Bob should still be a member with ExtensionPermissionsManager
    assert!(group.is_member(BOB));
    assert!(!group.has_permission<TestWitness, CustomPermission>(BOB));
    assert!(group.has_permission<TestWitness, ExtensionPermissionsManager>(BOB));

    destroy(group);
    ts.end();
}

#[test]
fun revoke_last_permission_removes_member() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Grant Bob only CustomPermission
    group.grant_permission<TestWitness, CustomPermission>(BOB, ts.ctx());
    assert!(group.is_member(BOB));

    // Revoke Bob's only permission
    group.revoke_permission<TestWitness, CustomPermission>(BOB, ts.ctx());

    // Bob should no longer be a member
    assert!(!group.is_member(BOB));

    destroy(group);
    ts.end();
}

#[test]
fun revoke_core_manager_decrements_count() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Grant Bob CorePermissionsManager
    group.grant_permission<TestWitness, CorePermissionsManager>(BOB, ts.ctx());
    assert!(group.core_managers_count<TestWitness>() == 2);

    // Revoke CorePermissionsManager from Bob
    group.revoke_permission<TestWitness, CorePermissionsManager>(BOB, ts.ctx());
    assert!(group.core_managers_count<TestWitness>() == 1);

    destroy(group);
    ts.end();
}

#[test, expected_failure(abort_code = permissions_group::ELastPermissionsManager)]
fun revoke_last_core_manager_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Try to revoke Alice's CorePermissionsManager (she's the only one)
    group.revoke_permission<TestWitness, CorePermissionsManager>(ALICE, ts.ctx());

    abort
}

#[test]
fun extension_manager_can_revoke_custom_permission() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Grant permissions
    group.grant_permission<TestWitness, ExtensionPermissionsManager>(BOB, ts.ctx());
    group.grant_permission<TestWitness, CustomPermission>(CHARLIE, ts.ctx());
    transfer::public_share_object(group);

    // Bob revokes Charlie's CustomPermission
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    group.revoke_permission<TestWitness, CustomPermission>(CHARLIE, ts.ctx());

    assert!(!group.is_member(CHARLIE));

    ts::return_shared(group);
    ts.end();
}

#[test, expected_failure(abort_code = permissions_group::ENotPermitted)]
fun extension_manager_cannot_revoke_core_manager() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Grant ExtensionPermissionsManager to Bob and CorePermissionsManager to Charlie
    group.grant_permission<TestWitness, ExtensionPermissionsManager>(BOB, ts.ctx());
    group.grant_permission<TestWitness, CorePermissionsManager>(CHARLIE, ts.ctx());
    transfer::public_share_object(group);

    // Bob tries to revoke CorePermissionsManager from Charlie (should fail)
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    group.revoke_permission<TestWitness, CorePermissionsManager>(CHARLIE, ts.ctx());

    abort
}

#[test, expected_failure(abort_code = permissions_group::EMemberNotFound)]
fun revoke_permission_from_non_member_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Try to revoke permission from Bob who is not a member
    group.revoke_permission<TestWitness, CustomPermission>(BOB, ts.ctx());

    abort
}

// === remove_member tests ===

#[test]
fun remove_member_removes_member() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Add Bob with CustomPermission
    group.grant_permission<TestWitness, CustomPermission>(BOB, ts.ctx());
    assert!(group.is_member(BOB));

    // Remove Bob
    group.remove_member<TestWitness>(BOB, ts.ctx());
    assert!(!group.is_member(BOB));

    destroy(group);
    ts.end();
}

#[test]
fun remove_core_manager_decrements_count() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Grant Bob CorePermissionsManager
    group.grant_permission<TestWitness, CorePermissionsManager>(BOB, ts.ctx());
    assert!(group.core_managers_count<TestWitness>() == 2);

    // Remove Bob
    group.remove_member<TestWitness>(BOB, ts.ctx());
    assert!(group.core_managers_count<TestWitness>() == 1);

    destroy(group);
    ts.end();
}

#[test, expected_failure(abort_code = permissions_group::ELastPermissionsManager)]
fun remove_last_core_manager_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Try to remove Alice (only CorePermissionsManager)
    group.remove_member<TestWitness>(ALICE, ts.ctx());

    abort
}

#[test, expected_failure(abort_code = permissions_group::ENotPermitted)]
fun remove_member_without_permission_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Grant Bob only ExtensionPermissionsManager
    group.grant_permission<TestWitness, ExtensionPermissionsManager>(BOB, ts.ctx());
    group.grant_permission<TestWitness, CustomPermission>(CHARLIE, ts.ctx());
    transfer::public_share_object(group);

    // Bob tries to remove Charlie (should fail - needs CorePermissionsManager)
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    group.remove_member<TestWitness>(CHARLIE, ts.ctx());

    abort
}

#[test, expected_failure(abort_code = permissions_group::EMemberNotFound)]
fun remove_non_member_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Try to remove Bob who is not a member
    group.remove_member<TestWitness>(BOB, ts.ctx());

    abort
}

// === grant_core_permissions tests ===

#[test]
fun grant_core_permissions_grants_all_core() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Grant core permissions to Bob
    group.grant_core_permissions<TestWitness>(BOB, ts.ctx());

    assert!(group.is_member(BOB));
    assert!(group.has_permission<TestWitness, CorePermissionsManager>(BOB));
    assert!(group.has_permission<TestWitness, ExtensionPermissionsManager>(BOB));
    assert!(group.core_managers_count<TestWitness>() == 2);

    destroy(group);
    ts.end();
}

#[test, expected_failure(abort_code = permissions_group::ENotPermitted)]
fun grant_core_permissions_without_core_manager_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Grant only ExtensionPermissionsManager to Bob
    group.grant_permission<TestWitness, ExtensionPermissionsManager>(BOB, ts.ctx());
    transfer::public_share_object(group);

    // Bob tries to grant core permissions to Charlie (should fail)
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    group.grant_core_permissions<TestWitness>(CHARLIE, ts.ctx());

    abort
}

// === revoke_core_permissions tests ===

#[test]
fun revoke_core_permissions_revokes_all_core() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Grant core permissions and custom permission to Bob
    group.grant_core_permissions<TestWitness>(BOB, ts.ctx());
    group.grant_permission<TestWitness, CustomPermission>(BOB, ts.ctx());

    // Revoke core permissions
    group.revoke_core_permissions<TestWitness>(BOB, ts.ctx());

    // Bob should still be a member but only have CustomPermission
    assert!(group.is_member(BOB));
    assert!(!group.has_permission<TestWitness, CorePermissionsManager>(BOB));
    assert!(!group.has_permission<TestWitness, ExtensionPermissionsManager>(BOB));
    assert!(group.has_permission<TestWitness, CustomPermission>(BOB));
    assert!(group.core_managers_count<TestWitness>() == 1);

    destroy(group);
    ts.end();
}

#[test, expected_failure(abort_code = permissions_group::ELastPermissionsManager)]
fun revoke_core_permissions_last_manager_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Try to revoke Alice's core permissions (she's the only CorePermissionsManager)
    group.revoke_core_permissions<TestWitness>(ALICE, ts.ctx());

    abort
}

#[test, expected_failure(abort_code = permissions_group::ENotPermitted)]
fun revoke_core_permissions_without_permission_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Grant permissions to Bob and Charlie
    group.grant_permission<TestWitness, ExtensionPermissionsManager>(BOB, ts.ctx());
    group.grant_core_permissions<TestWitness>(CHARLIE, ts.ctx());
    transfer::public_share_object(group);

    // Bob tries to revoke Charlie's core permissions (should fail)
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionsGroup<TestWitness>>();
    group.revoke_core_permissions<TestWitness>(CHARLIE, ts.ctx());

    abort
}

#[test, expected_failure(abort_code = permissions_group::EMemberNotFound)]
fun revoke_core_permissions_non_member_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    // Try to revoke core permissions from Bob who is not a member
    group.revoke_core_permissions<TestWitness>(BOB, ts.ctx());

    abort
}

// === Getters tests ===

#[test]
fun has_permission_returns_correct_value() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());
    group.grant_permission<TestWitness, CustomPermission>(BOB, ts.ctx());

    assert!(group.has_permission<TestWitness, CorePermissionsManager>(ALICE));
    assert!(group.has_permission<TestWitness, CustomPermission>(BOB));
    assert!(!group.has_permission<TestWitness, CorePermissionsManager>(BOB));

    destroy(group);
    ts.end();
}

#[test]
fun is_member_returns_correct_value() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());
    group.grant_permission<TestWitness, CustomPermission>(BOB, ts.ctx());

    assert!(group.is_member(ALICE));
    assert!(group.is_member(BOB));
    assert!(!group.is_member(CHARLIE));

    destroy(group);
    ts.end();
}

#[test]
fun creator_returns_correct_address() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let group = permissions_group::new<TestWitness>(ts.ctx());

    assert!(group.creator<TestWitness>() == ALICE);

    destroy(group);
    ts.end();
}

#[test]
fun core_managers_count_returns_correct_value() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissions_group::new<TestWitness>(ts.ctx());

    assert!(group.core_managers_count<TestWitness>() == 1);

    group.grant_permission<TestWitness, CorePermissionsManager>(BOB, ts.ctx());
    assert!(group.core_managers_count<TestWitness>() == 2);

    group.grant_permission<TestWitness, CorePermissionsManager>(CHARLIE, ts.ctx());
    assert!(group.core_managers_count<TestWitness>() == 3);

    destroy(group);
    ts.end();
}

// === new_derived tests ===

#[test]
fun new_derived_creates_group_with_deterministic_address() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let namespace = TestNamespace {
        id: object::new(ts.ctx()),
    };
    transfer::share_object(namespace);

    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<TestNamespace>();
    let group = permissions_group::new_derived<TestWitness, TestDerivationKey>(
        &mut namespace.id,
        TestDerivationKey(1),
        ts.ctx(),
    );

    // Creator should have all core permissions
    assert!(group.has_permission<TestWitness, CorePermissionsManager>(ALICE));
    assert!(group.has_permission<TestWitness, ExtensionPermissionsManager>(ALICE));
    assert!(group.is_member(ALICE));
    assert!(group.creator<TestWitness>() == ALICE);
    assert!(group.core_managers_count<TestWitness>() == 1);

    destroy(group);
    ts::return_shared(namespace);
    ts.end();
}

#[test, expected_failure(abort_code = permissions_group::EPermissionsGroupAlreadyExists)]
fun new_derived_duplicate_key_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let namespace = TestNamespace {
        id: object::new(ts.ctx()),
    };
    transfer::share_object(namespace);

    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<TestNamespace>();

    // Create first group with key 1
    let _group1 = permissions_group::new_derived<TestWitness, TestDerivationKey>(
        &mut namespace.id,
        TestDerivationKey(1),
        ts.ctx(),
    );

    // Try to create second group with same key (should fail)
    let _group2 = permissions_group::new_derived<TestWitness, TestDerivationKey>(
        &mut namespace.id,
        TestDerivationKey(1),
        ts.ctx(),
    );

    abort
}
