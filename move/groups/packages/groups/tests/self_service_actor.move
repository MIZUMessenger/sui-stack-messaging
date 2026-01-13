/// Module: self_service_actor
///
/// Test helper module demonstrating how third-party contracts wrap `object_*` methods.
///
/// This module shows the pattern for building "actor objects" that enable self-service
/// operations on PermissionsGroups. Key points:
///
/// 1. The `UID` field is private to this module - callers cannot access it directly
/// 2. All group operations go through wrapper functions that can enforce custom logic
/// 3. The actor object's address receives permissions, not the end users
/// 4. Users call wrapper functions to perform operations on themselves
///
/// Real-world examples:
/// - `PaidJoinActor`: Requires payment before calling `object_add_member`
/// - `TokenGatedActor`: Requires NFT ownership to join
/// - `CooldownActor`: Enforces time-based restrictions on operations
#[test_only]
module groups::self_service_actor;

use groups::permissions_group::PermissionsGroup;

/// Actor object that enables self-service group operations.
/// The UID is private, forcing all access through wrapper functions.
public struct SelfServiceActor has key {
    id: UID,
}

// === Lifecycle Functions ===

/// Creates a new SelfServiceActor.
/// In production, this might require payment, NFT ownership, etc.
public fun create(ctx: &mut TxContext): SelfServiceActor {
    SelfServiceActor { id: object::new(ctx) }
}

/// Destroys a SelfServiceActor.
public fun destroy(actor: SelfServiceActor) {
    let SelfServiceActor { id } = actor;
    id.delete();
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

/// Self-service join: sender adds themselves to the group.
/// Actor must have `MemberAdder` permission.
public fun join<T: drop>(
    actor: &SelfServiceActor,
    group: &mut PermissionsGroup<T>,
    ctx: &mut TxContext,
) {
    custom_logic_and_assertions(ctx);
    group.object_add_member<T>(&actor.id, ctx);
}

/// Self-service leave: sender removes themselves from the group.
/// Actor must have `MemberRemover` permission.
public fun leave<T: drop>(
    actor: &SelfServiceActor,
    group: &mut PermissionsGroup<T>,
    ctx: &mut TxContext,
) {
    custom_logic_and_assertions(ctx);
    group.object_remove_member<T>(&actor.id, ctx);
}

/// Self-service grant: sender grants themselves a permission.
/// Actor must have `PermissionsManager` permission.
public fun grant_permission<T: drop, P: drop>(
    actor: &SelfServiceActor,
    group: &mut PermissionsGroup<T>,
    ctx: &mut TxContext,
) {
    custom_logic_and_assertions(ctx);
    group.object_grant_permission<T, P>(&actor.id, ctx);
}

/// Self-service revoke: sender revokes a permission from themselves.
/// Actor must have `PermissionsManager` permission.
public fun revoke_permission<T: drop, P: drop>(
    actor: &SelfServiceActor,
    group: &mut PermissionsGroup<T>,
    ctx: &mut TxContext,
) {
    custom_logic_and_assertions(ctx);
    group.object_revoke_permission<T, P>(&actor.id, ctx);
}

/// Self-service grant base: sender grants themselves all base permissions.
/// Actor must have `PermissionsManager` permission.
public fun grant_base_permissions<T: drop>(
    actor: &SelfServiceActor,
    group: &mut PermissionsGroup<T>,
    ctx: &mut TxContext,
) {
    custom_logic_and_assertions(ctx);
    group.object_grant_base_permissions<T>(&actor.id, ctx);
}

/// Self-service revoke base: sender revokes all base permissions from themselves.
/// Actor must have `PermissionsManager` permission.
public fun revoke_base_permissions<T: drop>(
    actor: &SelfServiceActor,
    group: &mut PermissionsGroup<T>,
    ctx: &mut TxContext,
) {
    custom_logic_and_assertions(ctx);
    group.object_revoke_base_permissions<T>(&actor.id, ctx);
}

/// Self-service revoke all: sender revokes all permissions from themselves.
/// Actor must have `PermissionsManager` permission.
public fun revoke_all_permissions<T: drop>(
    actor: &SelfServiceActor,
    group: &mut PermissionsGroup<T>,
    ctx: &mut TxContext,
) {
    custom_logic_and_assertions(ctx);
    group.object_revoke_all_permissions<T>(&actor.id, ctx);
}
