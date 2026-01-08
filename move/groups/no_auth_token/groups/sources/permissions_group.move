/// Module: permissions_group
///
/// Provides a flexible permission system for group management with three distinct
/// permission types:
/// - `PermissionsManager`: Can grant and revoke permissions for any member
/// - `MemberAdder`: Can add new members to the group
/// - `MemberRemover`: Can remove existing members from the group
///
/// The system ensures there is always at least one `PermissionsManager` to prevent
/// the group from becoming unmanageable.
module groups::permissions_group;

use std::type_name::{Self, TypeName};
use sui::table::{Self, Table};
use sui::vec_set::{Self, VecSet};

// === Error Codes ===

const ENotPermitted: u64 = 0;
const EMemberNotFound: u64 = 1;
// Error code for attempting to revoke the last PermissionsManager permission
const ELastPermissionsManager: u64 = 2;

// === Witnesses ===

/// Witness type representing the permission to grant or revoke permissions.
public struct PermissionsManager() has drop;

/// Witness type representing the permission to add members.
public struct MemberAdder() has drop;

/// Witness type representing the permission to remove members.
public struct MemberRemover() has drop;

// === Structs ===

/// Authorization state mapping addresses to their granted permissions
/// represented as TypeNames.
///
public struct PermissionsGroup<phantom T> has key, store {
    id: UID,
    /// address or object
    permissions: Table<address, VecSet<TypeName>>,
    managers_count: u64,
}

// === Public Functions ===

/// Creates a new PermissionsGroup with the transaction sender as the initial
/// manager, adder, and remover.
///
/// Open question: Should this be generic `<T>` to scope permissions to a
/// specific context?
///
/// # Parameters
/// - `ctx`: Mutable transaction context for the table creation.
///
/// # Returns
/// - A new `PermissionsGroup` object with the sender having all managing permissions.
public fun new<T>(ctx: &mut TxContext): PermissionsGroup<T> {
    let mut creator_permissions_set = vec_set::empty<TypeName>();
    creator_permissions_set.insert(type_name::with_defining_ids<PermissionsManager>());
    creator_permissions_set.insert(type_name::with_defining_ids<MemberAdder>());
    creator_permissions_set.insert(type_name::with_defining_ids<MemberRemover>());

    let mut permissions_table = table::new<address, VecSet<TypeName>>(ctx);
    permissions_table.add(ctx.sender(), creator_permissions_set);

    PermissionsGroup<T> {
        id: object::new(ctx),
        permissions: permissions_table,
        managers_count: 1,
    }
}

/// Adds a new member with no initial permissions.
/// The caller must have MemberAdder permission.
/// After adding, use `grant_permission` to assign permissions to the new member.
///
/// # Parameters
/// - `self`: Mutable reference to the `PermissionsGroup` state.
/// - `new_member`: Address of the new member to be added.
/// - `ctx`: Transaction context for permission checks.
///
/// # Aborts
/// - If caller does not have MemberAdder permission.
/// - If new_member is already a member.
public fun add_member<T>(self: &mut PermissionsGroup<T>, new_member: address, ctx: &TxContext) {
    // assert caller has MemberAdder permission
    assert!(self.has_permission<T, MemberAdder>(ctx.sender()), ENotPermitted);
    // assert new_member is not already present
    assert!(!self.is_member<T>(new_member), EMemberNotFound);
    // Add member with empty permissions set
    self.permissions.add(new_member, vec_set::empty<TypeName>());
}

/// This is meant to be used by third-party contracts that want to implement custom functionality
/// E.g. a custom join_with_sui(). In this case, the third-party contract will need to expose
/// an "actor object" that has MemberAdder permission, and therefore can perform administrative
/// actions
/// This will enable a user to "self service" join the group. The join_with_sui() would have to
/// perform the
/// necessary checks itself (e.g. payment, etc).
/// We are safe here, since UID is protected. Only the contrac/module defining the actor object
/// has access to its UID.
public fun object_add_member<T>(
    self: &mut PermissionsGroup<T>,
    actor_object: &UID,
    ctx: &mut TxContext,
) {
    // assert actor_object has MemberAdder permission
    let actor_address = actor_object.to_address(); // TODO: make this a reusable internal function
    assert!(self.has_permission<T, MemberAdder>(actor_address), ENotPermitted);
    let new_member = ctx.sender();
    // assert new_member is not already present
    assert!(!self.is_member<T>(new_member), EMemberNotFound);
    // Add member with empty permissions set
    self.permissions.add(new_member, vec_set::empty<TypeName>());
}

/// Removes a member from the PermissionsGroup.
///
/// # Parameters
/// - `self`: Mutable reference to the `PermissionsGroup` state.
/// - `member`: Address of the member to be removed.
/// - `ctx`: Transaction context for permission checks.
///
/// # Aborts
/// - If caller does not have `MemberRemover` permission.
/// - If member does not exist in the PermissionsGroup.
/// - If member has `PermissionsManager` permission and removing would leave no
///   `PermissionsManager` remaining.
public fun remove_member<T>(self: &mut PermissionsGroup<T>, member: address, ctx: &TxContext) {
    // assert caller has MemberRemover permission
    assert!(self.has_permission<T, MemberRemover>(ctx.sender()), ENotPermitted);
    // assert member's permissions entry exists
    assert!(self.is_member<T>(member), EMemberNotFound);
    let member_permissions_set = self.permissions.borrow(member);
    // assert if member has PermissionsManager permission, there is at least one remaining after
    // removal
    if (member_permissions_set.contains(&type_name::with_defining_ids<PermissionsManager>())) {
        // TODO: make this reusable itnernal function
        assert!(self.managers_count > 1, ELastPermissionsManager);
        self.managers_count = self.managers_count - 1;
    };
    self.permissions.remove(member);
}

public fun object_remove_member<T>(
    self: &mut PermissionsGroup<T>,
    actor_object: &UID,
    ctx: &mut TxContext,
) {
    // assert actor_object has MemberRemover permission
    let actor_address = actor_object.to_address();
    assert!(self.has_permission<T, MemberRemover>(actor_address), ENotPermitted);
    let member = ctx.sender();
    // assert member's permissions entry exists
    assert!(self.is_member<T>(member), EMemberNotFound);
    let member_permissions_set = self.permissions.borrow(member);
    // assert if member has PermissionsManager permission, there is at least one remaining after
    // removal
    if (member_permissions_set.contains(&type_name::with_defining_ids<PermissionsManager>())) {
        assert!(self.managers_count > 1, ELastPermissionsManager);
        self.managers_count = self.managers_count - 1;
    };
    self.permissions.remove(member);
}

/// Grants a new permission to an existing member.
///
/// # Type Parameters
/// - `NewPermission`: The permission type to be granted to the member.
///
/// # Parameters
/// - `self`: Mutable reference to the `PermissionsGroup` state.
/// - `member`: Address of the member to whom the permission will be granted.
/// - `ctx`: Transaction context for permission checks.
///
/// # Aborts
/// - If the caller does not have `PermissionsManager` permission.
/// - If the member does not exist in the PermissionsGroup.
public fun grant_permission<T, NewPermission: drop>(
    self: &mut PermissionsGroup<T>,
    member: address,
    ctx: &TxContext,
) {
    // assert caller has PermissionsManager permission
    assert!(self.has_permission<T, PermissionsManager>(ctx.sender()), ENotPermitted);
    // assert member's permissions entry exists
    assert!(self.is_member<T>(member), EMemberNotFound);
    let member_permissions_set = self.permissions.borrow_mut(member);
    member_permissions_set.insert(type_name::with_defining_ids<NewPermission>());

    // if NewPermission is PermissionsManager, increment count
    if (
        type_name::with_defining_ids<NewPermission>() == type_name::with_defining_ids<PermissionsManager>()
    ) {
        self.managers_count = self.managers_count + 1;
    };
}

/// Revokes an existing permission from a member.
///
/// # Type Parameters
/// - `ExistingPermission`: The permission type to be revoked from the member.
///
/// # Parameters
/// - `self`: Mutable reference to the `PermissionsGroup` state.
/// - `member`: Address of the member from whom the permission will be revoked.
/// - `ctx`: Transaction context for permission checks.
///
/// # Aborts
/// - If the caller does not have `PermissionsManager` permission.
/// - If the member does not exist in the PermissionsGroup.
/// - If revoking `PermissionsManager` would leave no managers remaining.
public fun revoke_permission<T, ExistingPermission: drop>(
    self: &mut PermissionsGroup<T>,
    member: address,
    ctx: &TxContext,
) {
    // assert caller has PermissionsManager permission
    assert!(self.has_permission<T, PermissionsManager>(ctx.sender()), ENotPermitted);

    // assert member's permissions entry exists
    assert!(self.permissions.contains(member), EMemberNotFound);

    // assert after revocation, there is at least one PermissionsManager remaining
    if (
        type_name::with_defining_ids<ExistingPermission>() == type_name::with_defining_ids<PermissionsManager>()
    ) {
        assert!(self.managers_count > 1, ELastPermissionsManager);
        self.managers_count = self.managers_count - 1;
    };

    let member_permissions_set = self.permissions.borrow_mut(member);
    member_permissions_set.remove(&type_name::with_defining_ids<ExistingPermission>());

    // If the member has no more permissions, remove their entry from the table
    if (member_permissions_set.is_empty()) {
        self.permissions.remove(member);
    };
}

/// Checks if the given address has the specified permission.
///
/// # Type Parameters
/// - `Permission`: The permission type to check for.
///
/// # Parameters
/// - `self`: Reference to the `PermissionsGroup` state.
/// - `member`: Member address to check for the specified permission.
///
/// # Returns
/// `true` if the address has the permission, `false` otherwise.
public fun has_permission<T, Permission: drop>(self: &PermissionsGroup<T>, member: address): bool {
    self.permissions.borrow(member).contains(&type_name::with_defining_ids<Permission>())
}

/// Checks if the given address is a member of the PermissionsGroup.
///
/// # Parameters
/// - `self`: Reference to the `PermissionsGroup` state.
/// - `member`: Address to check for membership.
///
/// # Returns
/// `true` if the address is a member, `false` otherwise.
public fun is_member<T>(self: &PermissionsGroup<T>, member: address): bool {
    self.permissions.contains(member)
}
