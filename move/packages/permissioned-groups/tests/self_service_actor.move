/// Module: self_service_actor
///
/// Test helper module demonstrating how third-party contracts wrap `object_*` methods.
///
/// This module shows the pattern for building "actor objects" that enable self-service
/// operations on PermissionedGroups. Key points:
///
/// 1. The `UID` field is private to this module - callers cannot access it directly
/// 2. All group operations go through wrapper functions that can enforce custom logic
/// 3. The actor object's address receives permissions, not the end users
/// 4. Users call wrapper functions to perform operations on themselves
///
/// Real-world examples:
/// - `PaidJoinActor`: Requires payment before calling `object_grant_permission`
/// - `TokenGatedActor`: Requires NFT ownership to join
/// - `CooldownActor`: Enforces time-based restrictions on operations
#[test_only]
module permissioned_groups::self_service_actor;

use permissioned_groups::permissioned_group::PermissionedGroup;

/// Actor object that enables self-service group operations.
/// The UID is private, forcing all access through wrapper functions.
public struct SelfServiceActor has key {
    id: UID,
}

// === Lifecycle Functions ===

/// Creates a new SelfServiceActor.
/// In production, this might require payment, NFT ownership, etc.
public fun new(ctx: &mut TxContext): SelfServiceActor {
    SelfServiceActor { id: object::new(ctx) }
}

/// Shares the SelfServiceActor object.
public fun share(self: SelfServiceActor) {
    transfer::share_object(self);
}

/// Returns the actor's address for permission setup.
/// The group admin grants permissions to this address, not to end users.
public fun to_address(actor: &SelfServiceActor): address {
    actor.id.to_address()
}

// === Custom Logic Placeholder ===

/// Placeholder for custom logic and assertions.
/// In a real implementation, this could contain:
/// - Payment verification (e.g., require Coin<SUI> with minimum amount)
/// - NFT ownership checks (e.g., require holding a specific collection)
/// - Time-based restrictions (e.g., cooldown periods between operations)
/// - Rate limiting (e.g., max operations per epoch)
/// - Allowlist/blocklist checks
/// - Any other business logic to gate access to group operations
fun custom_logic_and_assertions(_ctx: &TxContext) {}

// === Self-Service Wrapper Functions ===
// Users call these to perform operations on themselves through the actor.
// Each wrapper calls custom_logic_and_assertions() before the actual operation.

/// Self-service leave: sender removes themselves from the group.
/// Actor must have `Administrator` permission.
public fun leave<T: drop>(
    actor: &SelfServiceActor,
    group: &mut PermissionedGroup<T>,
    ctx: &mut TxContext,
) {
    custom_logic_and_assertions(ctx);
    group.object_remove_member<T>(&actor.id, ctx);
}

/// Self-service grant: sender grants themselves a permission.
/// Actor must have appropriate manager permission (Administrator or
/// ExtensionPermissionsManager).
public fun custom_grant_permission<T: drop, P: drop>(
    actor: &SelfServiceActor,
    group: &mut PermissionedGroup<T>,
    ctx: &mut TxContext,
) {
    custom_logic_and_assertions(ctx);
    group.object_grant_permission<T, P>(&actor.id, ctx);
}

/// Self-service revoke: sender revokes a permission from themselves.
/// Actor must have appropriate manager permission (Administrator or
/// ExtensionPermissionsManager).
public fun custom_revoke_permission<T: drop, P: drop>(
    actor: &SelfServiceActor,
    group: &mut PermissionedGroup<T>,
    ctx: &mut TxContext,
) {
    custom_logic_and_assertions(ctx);
    group.object_revoke_permission<T, P>(&actor.id, ctx);
}

// === Tests ===

#[test_only]
use permissioned_groups::permissioned_group;
#[test_only]
use permissioned_groups::permissioned_group::{Administrator, ExtensionPermissionsManager};
#[test_only]
use sui::test_scenario as ts;
#[test_only]
use std::unit_test::assert_eq;

#[test_only]
const ALICE: address = @0xA11CE;
#[test_only]
const BOB: address = @0xB0B;

#[test_only]
public struct TestWitness() has drop;

#[test_only]
public struct CustomPermission() has drop;

#[test]
fun actor_grant_permission_works() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissioned_group::new<TestWitness>(ts.ctx());
    let actor_obj = new(ts.ctx());

    // Grant ExtensionPermissionsManager to the actor (enough to grant CustomPermission)
    group.grant_permission<TestWitness, ExtensionPermissionsManager>(actor_obj.to_address(), ts.ctx());
    transfer::public_share_object(group);
    actor_obj.share();

    // Bob uses actor to grant himself CustomPermission
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<TestWitness>>();
    let actor_obj = ts.take_shared<SelfServiceActor>();
    actor_obj.custom_grant_permission<TestWitness, CustomPermission>(&mut group, ts.ctx());

    assert_eq!(group.has_permission<TestWitness, CustomPermission>(BOB), true);
    assert_eq!(group.is_member(BOB), true);

    ts::return_shared(group);
    ts::return_shared(actor_obj);
    ts.end();
}

#[test, expected_failure(abort_code = permissioned_group::ENotPermitted)]
fun actor_grant_permission_without_permission_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissioned_group::new<TestWitness>(ts.ctx());
    let actor_obj = new(ts.ctx());

    // Grant CustomPermission to actor (not sufficient for granting permissions to others)
    group.grant_permission<TestWitness, CustomPermission>(actor_obj.to_address(), ts.ctx());
    transfer::public_share_object(group);
    actor_obj.share();

    // Bob tries to use actor to grant himself permission (should fail - actor lacks manager permission)
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<TestWitness>>();
    let actor_obj = ts.take_shared<SelfServiceActor>();
    actor_obj.custom_grant_permission<TestWitness, CustomPermission>(&mut group, ts.ctx());

    abort
}

#[test]
fun actor_revoke_permission_works() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissioned_group::new<TestWitness>(ts.ctx());
    let actor_obj = new(ts.ctx());

    // Grant ExtensionPermissionsManager to the actor and CustomPermission to Bob
    group.grant_permission<TestWitness, ExtensionPermissionsManager>(to_address(&actor_obj), ts.ctx());
    group.grant_permission<TestWitness, CustomPermission>(BOB, ts.ctx());
    transfer::public_share_object(group);
    actor_obj.share();

    // Bob uses actor to revoke his own CustomPermission
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<TestWitness>>();
    let actor_obj = ts.take_shared<SelfServiceActor>();
    actor_obj.custom_revoke_permission<TestWitness, CustomPermission>(&mut group, ts.ctx());

    assert_eq!(group.is_member(BOB), false);

    ts::return_shared(group);
    ts::return_shared(actor_obj);
    ts.end();
}

#[test]
fun actor_custom_remove_member_works() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissioned_group::new<TestWitness>(ts.ctx());
    let actor_obj = new(ts.ctx());

    // Grant Administrator to the actor and CustomPermission to Bob
    group.grant_permission<TestWitness, Administrator>(to_address(&actor_obj), ts.ctx());
    group.grant_permission<TestWitness, CustomPermission>(BOB, ts.ctx());
    transfer::public_share_object(group);
    actor_obj.share();

    // Bob uses actor to remove himself
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<TestWitness>>();
    let actor_obj = ts.take_shared<SelfServiceActor>();
    actor_obj.leave<TestWitness>(&mut group, ts.ctx());

    assert_eq!(group.is_member(BOB), false);

    ts::return_shared(group);
    ts::return_shared(actor_obj);
    ts.end();
}

// === Failure tests for object_* functions ===

#[test, expected_failure(abort_code = permissioned_group::ENotPermitted)]
fun actor_remove_member_without_permission_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissioned_group::new<TestWitness>(ts.ctx());
    let actor_obj = new(ts.ctx());

    // Actor has no Administrator permission
    group.grant_permission<TestWitness, CustomPermission>(to_address(&actor_obj), ts.ctx());
    group.grant_permission<TestWitness, CustomPermission>(BOB, ts.ctx());
    transfer::public_share_object(group);
    actor_obj.share();

    // Bob tries to use actor to leave (should fail - actor lacks Administrator)
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<TestWitness>>();
    let actor_obj = ts.take_shared<SelfServiceActor>();
    actor_obj.leave<TestWitness>(&mut group, ts.ctx());

    abort
}

#[test, expected_failure(abort_code = permissioned_group::EMemberNotFound)]
fun actor_remove_non_member_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissioned_group::new<TestWitness>(ts.ctx());
    let actor_obj = new(ts.ctx());

    // Grant Administrator to actor
    group.grant_permission<TestWitness, Administrator>(to_address(&actor_obj), ts.ctx());
    transfer::public_share_object(group);
    actor_obj.share();

    // Bob (not a member) tries to use actor to leave (should fail - not a member)
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<TestWitness>>();
    let actor_obj = ts.take_shared<SelfServiceActor>();
    actor_obj.leave<TestWitness>(&mut group, ts.ctx());

    abort
}

#[test, expected_failure(abort_code = permissioned_group::EMemberNotFound)]
fun actor_revoke_permission_non_member_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    let mut group = permissioned_group::new<TestWitness>(ts.ctx());
    let actor_obj = new(ts.ctx());

    // Grant ExtensionPermissionsManager to actor
    group.grant_permission<TestWitness, ExtensionPermissionsManager>(to_address(&actor_obj), ts.ctx());
    transfer::public_share_object(group);
    actor_obj.share();

    // Bob (not a member) tries to use actor to revoke permission (should fail)
    ts.next_tx(BOB);
    let mut group = ts.take_shared<PermissionedGroup<TestWitness>>();
    let actor_obj = ts.take_shared<SelfServiceActor>();
    actor_obj.custom_revoke_permission<TestWitness, CustomPermission>(&mut group, ts.ctx());

    abort
}
