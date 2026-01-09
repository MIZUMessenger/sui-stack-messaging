/// Module: permissions_group
///
/// Generic permission system for group management.
///
/// ## Base Permissions
///
/// - `PermissionsManager`: Grant/revoke permissions for any member
/// - `MemberAdder`: Add new members to the group
/// - `MemberRemover`: Remove members from the group
///
/// ## Invariants
///
/// - At least one `PermissionsManager` must always exist
/// - Members without permissions are removed from the table
module groups::permissions_group;

use std::type_name::{Self, TypeName};
use sui::derived_object;
use sui::table::{Self, Table};
use sui::vec_set::{Self, VecSet};

// === Error Codes ===

const ENotPermitted: u64 = 0;
const EMemberNotFound: u64 = 1;
const ELastPermissionsManager: u64 = 2;
const EPermissionsGroupAlreadyExists: u64 = 3;

// === Permission Witnesses ===

/// Permission to grant and revoke permissions.
public struct PermissionsManager() has drop;

/// Permission to add new members.
public struct MemberAdder() has drop;

/// Permission to remove members.
public struct MemberRemover() has drop;

// === Structs ===

/// Group state mapping addresses to their granted permissions.
/// Parameterized by `T` to scope permissions to a specific package.
public struct PermissionsGroup<phantom T: drop> has key, store {
    id: UID,
    /// Maps member addresses (user or object) to their permission set.
    /// Object addresses enable `object_*` functions for third-party "actor" contracts.
    permissions: Table<address, VecSet<TypeName>>,
    /// Tracks `PermissionsManager` count to enforce invariant.
    managers_count: u64,
}

// === Public Functions ===

/// Creates a new PermissionsGroup with the sender as initial admin.
/// Grants `PermissionsManager`, `MemberAdder`, `MemberRemover` to creator.
///
/// # Type Parameters
/// - `T`: Package witness type to scope permissions
///
/// # Parameters
/// - `ctx`: Transaction context
///
/// # Returns
/// A new `PermissionsGroup<T>` with sender having all base permissions.
public fun new<T: drop>(ctx: &mut TxContext): PermissionsGroup<T> {
    let creator_permissions_set = all_permissions_set();

    let mut permissions_table = table::new<address, VecSet<TypeName>>(ctx);
    permissions_table.add(ctx.sender(), creator_permissions_set);

    PermissionsGroup<T> {
        id: object::new(ctx),
        permissions: permissions_table,
        managers_count: 1,
    }
}

/// Creates a new derived PermissionsGroup with deterministic address.
/// Grants `PermissionsManager`, `MemberAdder`, `MemberRemover` to creator.
///
/// # Type Parameters
/// - `T`: Package witness type to scope permissions
/// - `DerivationKey`: Key type for address derivation
///
/// # Parameters
/// - `derivation_uid`: Mutable reference to the parent UID for derivation
/// - `derivation_key`: Key used for deterministic address derivation
/// - `ctx`: Transaction context
///
/// # Returns
/// A new `PermissionsGroup<T>` with derived address.
///
/// # Aborts
/// - `EPermissionsGroupAlreadyExists`: if derived address is already claimed
public fun new_derived<T: drop, DerivationKey: copy + drop + store>(
    derivation_uid: &mut UID,
    derivation_key: DerivationKey,
    ctx: &mut TxContext,
): PermissionsGroup<T> {
    assert!(
        !derived_object::exists(derivation_uid, derivation_key),
        EPermissionsGroupAlreadyExists,
    );

    let creator_permissions_set = all_permissions_set();

    let mut permissions_table = table::new<address, VecSet<TypeName>>(ctx);
    permissions_table.add(ctx.sender(), creator_permissions_set);

    PermissionsGroup<T> {
        id: derived_object::claim(derivation_uid, derivation_key),
        permissions: permissions_table,
        managers_count: 1,
    }
}

/// Adds a new member with no initial permissions.
/// Use `grant_permission` to assign permissions after adding.
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `new_member`: Address of the new member
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `ENotPermitted`: if caller doesn't have `MemberAdder` permission
/// - `EMemberNotFound`: if new_member is already a member
public fun add_member<T: drop>(
    self: &mut PermissionsGroup<T>,
    new_member: address,
    ctx: &TxContext,
) {
    assert!(self.has_permission<T, MemberAdder>(ctx.sender()), ENotPermitted);
    assert!(!self.is_member<T>(new_member), EMemberNotFound);
    self.permissions.add(new_member, vec_set::empty<TypeName>());
}

/// Adds the transaction sender as a member via an actor object.
/// Enables third-party contracts to implement custom join logic (e.g., `join_with_sui()`).
/// The actor object must have `MemberAdder` permission on the group.
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `actor_object`: UID of the actor object with `MemberAdder` permission
/// - `ctx`: Transaction context (sender will be added as member)
///
/// # Aborts
/// - `ENotPermitted`: if actor_object doesn't have `MemberAdder` permission
/// - `EMemberNotFound`: if sender is already a member
public fun object_add_member<T: drop>(
    self: &mut PermissionsGroup<T>,
    actor_object: &UID,
    ctx: &mut TxContext,
) {
    let actor_address = actor_object.to_address();
    assert!(self.has_permission<T, MemberAdder>(actor_address), ENotPermitted);
    let new_member = ctx.sender();
    assert!(!self.is_member<T>(new_member), EMemberNotFound);
    self.permissions.add(new_member, vec_set::empty<TypeName>());
}

/// Removes a member from the PermissionsGroup.
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `member`: Address of the member to remove
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `ENotPermitted`: if caller doesn't have `MemberRemover` permission
/// - `EMemberNotFound`: if member doesn't exist
/// - `ELastPermissionsManager`: if removing would leave no managers
public fun remove_member<T: drop>(
    self: &mut PermissionsGroup<T>,
    member: address,
    ctx: &TxContext,
) {
    assert!(self.has_permission<T, MemberRemover>(ctx.sender()), ENotPermitted);
    assert!(self.is_member<T>(member), EMemberNotFound);
    self.safe_decrement_managers_count(member);
    self.permissions.remove(member);
}

/// Removes the transaction sender from the group via an actor object.
/// Enables third-party contracts to implement custom leave logic.
/// The actor object must have `MemberRemover` permission on the group.
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `actor_object`: UID of the actor object with `MemberRemover` permission
/// - `ctx`: Transaction context (sender will be removed)
///
/// # Aborts
/// - `ENotPermitted`: if actor_object doesn't have `MemberRemover` permission
/// - `EMemberNotFound`: if sender is not a member
/// - `ELastPermissionsManager`: if removing would leave no managers
public fun object_remove_member<T: drop>(
    self: &mut PermissionsGroup<T>,
    actor_object: &UID,
    ctx: &mut TxContext,
) {
    let actor_address = actor_object.to_address();
    assert!(self.has_permission<T, MemberRemover>(actor_address), ENotPermitted);
    let member = ctx.sender();
    assert!(self.is_member<T>(member), EMemberNotFound);
    self.safe_decrement_managers_count(member);
    self.permissions.remove(member);
}

/// Grants a permission to an existing member.
///
/// # Type Parameters
/// - `T`: Package witness type
/// - `NewPermission`: Permission type to grant
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `member`: Address of the member to grant permission to
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `ENotPermitted`: if caller doesn't have `PermissionsManager` permission
/// - `EMemberNotFound`: if member doesn't exist
public fun grant_permission<T: drop, NewPermission: drop>(
    self: &mut PermissionsGroup<T>,
    member: address,
    ctx: &TxContext,
) {
    assert!(self.has_permission<T, PermissionsManager>(ctx.sender()), ENotPermitted);
    assert!(self.is_member<T>(member), EMemberNotFound);
    let member_permissions_set = self.permissions.borrow_mut(member);
    member_permissions_set.insert(type_name::with_defining_ids<NewPermission>());

    if (
        type_name::with_defining_ids<NewPermission>() == type_name::with_defining_ids<PermissionsManager>()
    ) {
        self.managers_count = self.managers_count + 1;
    };
}

/// Grants all base permissions to a member.
/// Includes: `PermissionsManager`, `MemberAdder`, `MemberRemover`.
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `member`: Address of the member to grant permissions to
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `ENotPermitted`: if caller doesn't have `PermissionsManager` permission
/// - `EMemberNotFound`: if member doesn't exist
public fun grant_all_permissions<T: drop>(
    self: &mut PermissionsGroup<T>,
    member: address,
    ctx: &mut TxContext,
) {
    assert!(self.has_permission<T, PermissionsManager>(ctx.sender()), ENotPermitted);
    assert!(self.is_member<T>(member), EMemberNotFound);
    let member_permissions_set = self.permissions.borrow_mut(member);
    all_permissions_set().into_keys().do!(|permission| {
        member_permissions_set.insert(permission);
        if (permission == type_name::with_defining_ids<PermissionsManager>()) {
            self.managers_count = self.managers_count + 1;
        };
    });
}

/// Grants a permission to the transaction sender via an actor object.
/// Enables third-party contracts to grant permissions with custom logic.
/// The actor object must have `PermissionsManager` permission on the group.
///
/// # Type Parameters
/// - `T`: Package witness type
/// - `NewPermission`: Permission type to grant
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `actor_object`: UID of the actor object with `PermissionsManager` permission
/// - `ctx`: Transaction context (sender will receive the permission)
///
/// # Aborts
/// - `ENotPermitted`: if actor_object doesn't have `PermissionsManager` permission
/// - `EMemberNotFound`: if sender is not a member
public fun object_grant_permission<T: drop, NewPermission: drop>(
    self: &mut PermissionsGroup<T>,
    actor_object: &UID,
    ctx: &mut TxContext,
) {
    let actor_address = actor_object.to_address();
    assert!(self.has_permission<T, PermissionsManager>(actor_address), ENotPermitted);
    let member = ctx.sender();
    assert!(self.is_member<T>(member), EMemberNotFound);
    let member_permissions_set = self.permissions.borrow_mut(member);
    member_permissions_set.insert(type_name::with_defining_ids<NewPermission>());

    if (
        type_name::with_defining_ids<NewPermission>() == type_name::with_defining_ids<PermissionsManager>()
    ) {
        self.managers_count = self.managers_count + 1;
    };
}

/// Revokes a permission from a member.
/// If the member has no remaining permissions, removes them from the group.
///
/// # Type Parameters
/// - `T`: Package witness type
/// - `ExistingPermission`: Permission type to revoke
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `member`: Address of the member to revoke permission from
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `ENotPermitted`: if caller doesn't have `PermissionsManager` permission
/// - `EMemberNotFound`: if member doesn't exist
/// - `ELastPermissionsManager`: if revoking would leave no managers
public fun revoke_permission<T: drop, ExistingPermission: drop>(
    self: &mut PermissionsGroup<T>,
    member: address,
    ctx: &TxContext,
) {
    assert!(self.has_permission<T, PermissionsManager>(ctx.sender()), ENotPermitted);
    assert!(self.permissions.contains(member), EMemberNotFound);

    if (
        type_name::with_defining_ids<ExistingPermission>() == type_name::with_defining_ids<PermissionsManager>()
    ) {
        assert!(self.managers_count > 1, ELastPermissionsManager);
        self.managers_count = self.managers_count - 1;
    };

    let member_permissions_set = self.permissions.borrow_mut(member);
    member_permissions_set.remove(&type_name::with_defining_ids<ExistingPermission>());

    if (member_permissions_set.is_empty()) {
        self.permissions.remove(member);
    };
}

/// Revokes all base permissions from a member.
/// Only removes base permissions (`PermissionsManager`, `MemberAdder`, `MemberRemover`).
/// Custom permissions added by third-party packages are preserved.
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `member`: Address of the member to revoke base permissions from
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `ENotPermitted`: if caller doesn't have `PermissionsManager` permission
/// - `EMemberNotFound`: if member doesn't exist
/// - `ELastPermissionsManager`: if member has `PermissionsManager` and revoking would leave no managers
public fun revoke_all_permissions<T: drop>(
    self: &mut PermissionsGroup<T>,
    member: address,
    ctx: &TxContext,
) {
    assert!(self.has_permission<T, PermissionsManager>(ctx.sender()), ENotPermitted);
    assert!(self.permissions.contains(member), EMemberNotFound);
    self.safe_decrement_managers_count(member);
    let member_permissions_set = self.permissions.borrow_mut(member);
    all_permissions_set().into_keys().do!(|permission| {
        if (member_permissions_set.contains(&permission)) {
            member_permissions_set.remove(&permission);
        };
    });
}

/// Revokes a permission from the transaction sender via an actor object.
/// Enables third-party contracts to revoke permissions with custom logic.
/// The actor object must have `PermissionsManager` permission on the group.
/// If the sender has no remaining permissions, removes them from the group.
///
/// # Type Parameters
/// - `T`: Package witness type
/// - `ExistingPermission`: Permission type to revoke
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `actor_object`: UID of the actor object with `PermissionsManager` permission
/// - `ctx`: Transaction context (sender will have the permission revoked)
///
/// # Aborts
/// - `ENotPermitted`: if actor_object doesn't have `PermissionsManager` permission
/// - `EMemberNotFound`: if sender is not a member
/// - `ELastPermissionsManager`: if revoking would leave no managers
public fun object_revoke_permission<T: drop, ExistingPermission: drop>(
    self: &mut PermissionsGroup<T>,
    actor_object: &UID,
    ctx: &mut TxContext,
) {
    let actor_address = actor_object.to_address();
    assert!(self.has_permission<T, PermissionsManager>(actor_address), ENotPermitted);
    let member = ctx.sender();
    assert!(self.permissions.contains(member), EMemberNotFound);

    if (
        type_name::with_defining_ids<ExistingPermission>() == type_name::with_defining_ids<PermissionsManager>()
    ) {
        assert!(self.managers_count > 1, ELastPermissionsManager);
        self.managers_count = self.managers_count - 1;
    };

    let member_permissions_set = self.permissions.borrow_mut(member);
    member_permissions_set.remove(&type_name::with_defining_ids<ExistingPermission>());

    if (member_permissions_set.is_empty()) {
        self.permissions.remove(member);
    };
}

// === Getters ===

/// Checks if the given address has the specified permission.
///
/// # Type Parameters
/// - `T`: Package witness type
/// - `Permission`: Permission type to check
///
/// # Parameters
/// - `self`: Reference to the PermissionsGroup
/// - `member`: Address to check
///
/// # Returns
/// `true` if the address has the permission, `false` otherwise.
public fun has_permission<T: drop, Permission: drop>(
    self: &PermissionsGroup<T>,
    member: address,
): bool {
    self.permissions.borrow(member).contains(&type_name::with_defining_ids<Permission>())
}

/// Checks if the given address is a member of the group.
///
/// # Parameters
/// - `self`: Reference to the PermissionsGroup
/// - `member`: Address to check
///
/// # Returns
/// `true` if the address is a member, `false` otherwise.
public fun is_member<T: drop>(self: &PermissionsGroup<T>, member: address): bool {
    self.permissions.contains(member)
}

// === Private Functions ===

/// Returns a VecSet containing all base permissions.
fun all_permissions_set(): VecSet<TypeName> {
    let mut all_permissions_set = vec_set::empty<TypeName>();
    all_permissions_set.insert(type_name::with_defining_ids<PermissionsManager>());
    all_permissions_set.insert(type_name::with_defining_ids<MemberAdder>());
    all_permissions_set.insert(type_name::with_defining_ids<MemberRemover>());
    all_permissions_set
}

/// Checks if member has `PermissionsManager` and decrements count if so.
/// Aborts if this would leave no managers.
fun safe_decrement_managers_count<T: drop>(
    self: &mut PermissionsGroup<T>,
    member: address,
) {
    let member_permissions_set = self.permissions.borrow(member);
    if (member_permissions_set.contains(&type_name::with_defining_ids<PermissionsManager>())) {
        assert!(self.managers_count > 1, ELastPermissionsManager);
        self.managers_count = self.managers_count - 1;
    };
}
