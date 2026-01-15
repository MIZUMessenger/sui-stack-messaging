/// Module: permissions_group
///
/// Generic permission system for group management.
///
/// ## Core Permissions
///
/// - `CorePermissionsManager`: Super-admin role that can grant/revoke all permissions and remove
/// members
/// - `ExtensionPermissionsManager`: Can grant/revoke extension permissions (permissions defined in
/// third-party packages)
///
/// ## Key Concepts
///
/// - **Membership is defined by permissions**: A member exists if and only if they have at least
/// one permission
/// - **Granting implicitly adds**: `grant_permission()` will automatically add a member if they
/// don't exist
/// - **Revoking may remove**: Revoking the last permission automatically removes the member from
/// the group
/// - **Permission hierarchy**: Only `CorePermissionsManager` can grant/revoke
/// `CorePermissionsManager`; all other permissions
///   can be managed by either `CorePermissionsManager` or `ExtensionPermissionsManager`
///
/// ## Invariants
///
/// - At least one `CorePermissionsManager` must always exist
/// - Members always have at least one permission (empty permission sets are not allowed)
module groups::permissions_group;

use std::type_name::{Self, TypeName};
use sui::derived_object;
use sui::event;
use sui::table::{Self, Table};
use sui::vec_set::{Self, VecSet};

// === Error Codes ===

const ENotPermitted: u64 = 0;
const EMemberNotFound: u64 = 1;
const ELastPermissionsManager: u64 = 2;
const EPermissionsGroupAlreadyExists: u64 = 3;

// === Permission Witnesses ===

/// Permission to manage core permissions defined in the groups package.
/// This is the super-admin role that can:
/// - Grant/revoke both core and extension permissions
/// - Remove members from the group
/// - Manage other CorePermissionsManagers
public struct CorePermissionsManager() has drop;

/// Permission to manage extension permissions defined in third-party packages.
/// Can grant/revoke extension permissions but NOT core permissions.
/// This provides a safer delegation model for package-specific permissions.
public struct ExtensionPermissionsManager() has drop;

// === Structs ===

// TODO: Consider Adding versioning, probably through separate module --> see suins_communities
// But probably not. Libraries making breaking Upgrades, not a good idea

// TODO2: RE Display
// Consider exposing function that:
// Consider a default as well
// Note, this Publisher arg is not Publisher of current package
// It is Publisher of package T
// Make sure to add appropriate assertions
// fun create_display<T>(publisher: &Publisher): Display<PermissionsGroup<T>> { ... }

/// Group state mapping addresses to their granted permissions.
/// Parameterized by `T` to scope permissions to a specific package.
public struct PermissionsGroup<phantom T: drop> has key, store {
    id: UID,
    /// Maps member addresses (user or object) to their permission set.
    /// Object addresses enable `object_*` functions for third-party "actor" contracts.
    permissions: Table<address, VecSet<TypeName>>,
    /// Tracks `CorePermissionsManager` count to enforce invariant.
    core_managers_count: u64,
    /// Original creator's address
    creator: address,
}

// === Events ===

/// Emitted when a new PermissionsGroup is created via `new`.
public struct GroupCreated<phantom T> has copy, drop {
    /// ID of the created group.
    group_id: ID,
    /// Address of the group creator.
    creator: address,
}

/// Emitted when a new PermissionsGroup is created via `new_derived`.
public struct GroupDerived<phantom T> has copy, drop {
    /// ID of the created group.
    group_id: ID,
    /// Address of the group creator.
    creator: address,
    /// ID of the parent object from which the group was derived.
    parent_id: ID,
    /// Type name of the derivation key used.
    derivation_key_type: TypeName,
}

/// Emitted when a new member is added to a group via grant_permission.
public struct MemberAdded<phantom T> has copy, drop {
    /// ID of the group.
    group_id: ID,
    /// Address of the new member.
    member: address,
}

/// Emitted when a member is removed from a group.
public struct MemberRemoved<phantom T> has copy, drop {
    /// ID of the group.
    group_id: ID,
    /// Address of the removed member.
    member: address,
}

/// Emitted when permissions are granted to a member.
public struct PermissionsGranted<phantom T> has copy, drop {
    /// ID of the group.
    group_id: ID,
    /// Address of the member receiving the permissions.
    member: address,
    /// Type names of the granted permissions.
    permissions: vector<TypeName>,
}

/// Emitted when permissions are revoked from a member.
public struct PermissionsRevoked<phantom T> has copy, drop {
    /// ID of the group.
    group_id: ID,
    /// Address of the member losing the permissions.
    member: address,
    /// Type names of the revoked permissions.
    permissions: vector<TypeName>,
}

// === Public Functions ===

/// Creates a new PermissionsGroup with the sender as initial admin.
/// Grants `CorePermissionsManager` and `ExtensionPermissionsManager` to creator.
///
/// # Type Parameters
/// - `T`: Package witness type to scope permissions
///
/// # Parameters
/// - `ctx`: Transaction context
///
/// # Returns
/// A new `PermissionsGroup<T>` with sender having all core permissions.
public fun new<T: drop>(ctx: &mut TxContext): PermissionsGroup<T> {
    let creator_permissions_set = core_permissions_set();
    let creator = ctx.sender();

    let mut permissions_table = table::new<address, VecSet<TypeName>>(ctx);
    permissions_table.add(creator, creator_permissions_set);

    let group = PermissionsGroup<T> {
        id: object::new(ctx),
        permissions: permissions_table,
        core_managers_count: 1,
        creator,
    };

    event::emit(GroupCreated<T> {
        group_id: object::id(&group),
        creator,
    });

    group
}

/// Creates a new derived PermissionsGroup with deterministic address.
/// Grants `CorePermissionsManager` and `ExtensionPermissionsManager` to creator.
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

    let creator_permissions_set = core_permissions_set();
    let creator = ctx.sender();

    let mut permissions_table = table::new<address, VecSet<TypeName>>(ctx);
    permissions_table.add(creator, creator_permissions_set);

    let group = PermissionsGroup<T> {
        id: derived_object::claim(derivation_uid, derivation_key),
        permissions: permissions_table,
        core_managers_count: 1,
        creator,
    };

    event::emit(GroupDerived<T> {
        group_id: object::id(&group),
        creator,
        parent_id: object::uid_to_inner(derivation_uid),
        derivation_key_type: type_name::with_defining_ids<DerivationKey>(),
    });

    group
}

/// Grants a permission to a member.
/// If the member doesn't exist, they are automatically added to the group.
/// Emits both `MemberAdded` (if new) and `PermissionsGranted` events.
///
/// Permission requirements:
/// - To grant `CorePermissionsManager`: caller must have `CorePermissionsManager`
/// - To grant any other permission: caller must have `CorePermissionsManager` OR
/// `ExtensionPermissionsManager`
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
/// - `ENotPermitted`: if caller doesn't have appropriate manager permission
public fun grant_permission<T: drop, NewPermission: drop>(
    self: &mut PermissionsGroup<T>,
    member: address,
    ctx: &TxContext,
) {
    // Verify caller has permission to grant this permission type
    self.assert_can_manage_permission<T, NewPermission>(ctx.sender());

    // internal_grant_permission handles member addition and permission granting
    self.internal_grant_permission<T, NewPermission>(member);
}

/// Grants a permission to the transaction sender via an actor object.
/// Enables third-party contracts to grant permissions with custom logic.
/// If the sender is not already a member, they are automatically added.
///
/// Permission requirements:
/// - To grant `CorePermissionsManager`: actor must have `CorePermissionsManager`
/// - To grant any other permission: actor must have `CorePermissionsManager` OR
/// `ExtensionPermissionsManager`
///
/// # Type Parameters
/// - `T`: Package witness type
/// - `NewPermission`: Permission type to grant
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `actor_object`: UID of the actor object with appropriate manager permission
/// - `ctx`: Transaction context (sender will receive the permission)
///
/// # Aborts
/// - `ENotPermitted`: if actor_object doesn't have appropriate manager permission
public fun object_grant_permission<T: drop, NewPermission: drop>(
    self: &mut PermissionsGroup<T>,
    actor_object: &UID,
    ctx: &mut TxContext,
) {
    let actor_address = actor_object.to_address();
    let member = ctx.sender();

    // Verify actor has permission to grant this permission type
    self.assert_can_manage_permission<T, NewPermission>(actor_address);

    // internal_grant_permission handles member addition and permission granting
    self.internal_grant_permission<T, NewPermission>(member);
}

/// Removes a member from the PermissionsGroup.
/// Requires `CorePermissionsManager` permission as this is a powerful admin operation.
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `member`: Address of the member to remove
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `ENotPermitted`: if caller doesn't have `CorePermissionsManager` permission
/// - `EMemberNotFound`: if member doesn't exist
/// - `ELastPermissionsManager`: if removing would leave no CorePermissionsManagers
public fun remove_member<T: drop>(
    self: &mut PermissionsGroup<T>,
    member: address,
    ctx: &TxContext,
) {
    assert!(self.has_permission<T, CorePermissionsManager>(ctx.sender()), ENotPermitted);
    assert!(self.is_member<T>(member), EMemberNotFound);
    self.safe_decrement_core_managers_count(member);
    self.permissions.remove(member);

    event::emit(MemberRemoved<T> {
        group_id: object::id(self),
        member,
    });
}

/// Removes the transaction sender from the group via an actor object.
/// Enables third-party contracts to implement custom leave logic.
/// The actor object must have `CorePermissionsManager` permission on the group.
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `actor_object`: UID of the actor object with `CorePermissionsManager` permission
/// - `ctx`: Transaction context (sender will be removed)
///
/// # Aborts
/// - `ENotPermitted`: if actor_object doesn't have `CorePermissionsManager` permission
/// - `EMemberNotFound`: if sender is not a member
/// - `ELastPermissionsManager`: if removing would leave no CorePermissionsManagers
public fun object_remove_member<T: drop>(
    self: &mut PermissionsGroup<T>,
    actor_object: &UID,
    ctx: &mut TxContext,
) {
    let actor_address = actor_object.to_address();
    assert!(self.has_permission<T, CorePermissionsManager>(actor_address), ENotPermitted);
    let member = ctx.sender();
    assert!(self.is_member<T>(member), EMemberNotFound);
    self.safe_decrement_core_managers_count(member);

    self.permissions.remove(member);

    event::emit(MemberRemoved<T> {
        group_id: object::id(self),
        member,
    });
}

/// Grants all core permissions to a member.
/// Includes: `CorePermissionsManager`, `ExtensionPermissionsManager`.
/// If the member doesn't exist, they are automatically added.
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `member`: Address of the member to grant permissions to
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `ENotPermitted`: if caller doesn't have `CorePermissionsManager` permission
public fun grant_core_permissions<T: drop>(
    self: &mut PermissionsGroup<T>,
    member: address,
    ctx: &mut TxContext,
) {
    assert!(self.has_permission<T, CorePermissionsManager>(ctx.sender()), ENotPermitted);

    self.internal_grant_core_permissions<T>(member);
}

/// Grants all core permissions to the transaction sender via an actor object.
/// Enables third-party contracts to grant core permissions with custom logic.
/// The actor object must have `CorePermissionsManager` permission on the group.
/// If the sender is not already a member, they are automatically added.
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `actor_object`: UID of the actor object with `CorePermissionsManager` permission
/// - `ctx`: Transaction context (sender will receive all core permissions)
///
/// # Aborts
/// - `ENotPermitted`: if actor_object doesn't have `CorePermissionsManager` permission
public fun object_grant_core_permissions<T: drop>(
    self: &mut PermissionsGroup<T>,
    actor_object: &UID,
    ctx: &mut TxContext,
) {
    let actor_address = actor_object.to_address();
    assert!(self.has_permission<T, CorePermissionsManager>(actor_address), ENotPermitted);

    let member = ctx.sender();
    self.internal_grant_core_permissions<T>(member);
}

/// Revokes a permission from a member.
/// If this is the member's last permission, they are automatically removed from the group.
/// Emits `PermissionsRevoked` and potentially `MemberRemoved` events.
///
/// Permission requirements:
/// - To revoke `CorePermissionsManager`: caller must have `CorePermissionsManager`
/// - To revoke any other permission: caller must have `CorePermissionsManager` OR
/// `ExtensionPermissionsManager`
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
/// - `ENotPermitted`: if caller doesn't have appropriate manager permission
/// - `EMemberNotFound`: if member doesn't exist
/// - `ELastPermissionsManager`: if revoking `CorePermissionsManager` would leave no core managers
public fun revoke_permission<T: drop, ExistingPermission: drop>(
    self: &mut PermissionsGroup<T>,
    member: address,
    ctx: &TxContext,
) {
    // Verify caller has permission to revoke this permission type
    self.assert_can_manage_permission<T, ExistingPermission>(ctx.sender());
    assert!(self.permissions.contains(member), EMemberNotFound);

    self.internal_revoke_permission<T, ExistingPermission>(member);
}

/// Revokes a permission from the transaction sender via an actor object.
/// Enables third-party contracts to revoke permissions with custom logic.
/// If this is the sender's last permission, they are automatically removed from the group.
///
/// Permission requirements:
/// - To revoke `CorePermissionsManager`: actor must have `CorePermissionsManager`
/// - To revoke any other permission: actor must have `CorePermissionsManager` OR
/// `ExtensionPermissionsManager`
///
/// # Type Parameters
/// - `T`: Package witness type
/// - `ExistingPermission`: Permission type to revoke
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `actor_object`: UID of the actor object with appropriate manager permission
/// - `ctx`: Transaction context (sender will have the permission revoked)
///
/// # Aborts
/// - `ENotPermitted`: if actor_object doesn't have appropriate manager permission
/// - `EMemberNotFound`: if sender is not a member
/// - `ELastPermissionsManager`: if revoking `CorePermissionsManager` would leave no core managers
public fun object_revoke_permission<T: drop, ExistingPermission: drop>(
    self: &mut PermissionsGroup<T>,
    actor_object: &UID,
    ctx: &mut TxContext,
) {
    let actor_address = actor_object.to_address();
    let member = ctx.sender();

    // Verify actor has permission to revoke this permission type
    self.assert_can_manage_permission<T, ExistingPermission>(actor_address);
    assert!(self.permissions.contains(member), EMemberNotFound);

    self.internal_revoke_permission<T, ExistingPermission>(member);
}

/// Revokes all core permissions from a member.
/// Only removes core permissions (`CorePermissionsManager`, `ExtensionPermissionsManager`).
/// Custom permissions added by third-party packages are preserved.
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `member`: Address of the member to revoke core permissions from
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `ENotPermitted`: if caller doesn't have `CorePermissionsManager` permission
/// - `EMemberNotFound`: if member doesn't exist
/// - `ELastPermissionsManager`: if member has `CorePermissionsManager` and revoking would leave no
/// core managers
public fun revoke_core_permissions<T: drop>(
    self: &mut PermissionsGroup<T>,
    member: address,
    ctx: &TxContext,
) {
    assert!(self.has_permission<T, CorePermissionsManager>(ctx.sender()), ENotPermitted);
    assert!(self.permissions.contains(member), EMemberNotFound);
    self.internal_revoke_core_permissions<T>(member);
}

/// Revokes all core permissions from the transaction sender via an actor object.
/// Enables third-party contracts to revoke core permissions with custom logic.
/// The actor object must have `CorePermissionsManager` permission on the group.
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionsGroup
/// - `actor_object`: UID of the actor object with `CorePermissionsManager` permission
/// - `ctx`: Transaction context (sender will have core permissions revoked)
///
/// # Aborts
/// - `ENotPermitted`: if actor_object doesn't have `CorePermissionsManager` permission
/// - `EMemberNotFound`: if sender is not a member
/// - `ELastPermissionsManager`: if sender has `CorePermissionsManager` and revoking would leave no
/// core managers
public fun object_revoke_core_permissions<T: drop>(
    self: &mut PermissionsGroup<T>,
    actor_object: &UID,
    ctx: &mut TxContext,
) {
    let actor_address = actor_object.to_address();
    assert!(self.has_permission<T, CorePermissionsManager>(actor_address), ENotPermitted);
    let member = ctx.sender();
    assert!(self.permissions.contains(member), EMemberNotFound);
    self.internal_revoke_core_permissions<T>(member);
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

/// Returns the creator's address of the PermissionsGroup.
///
/// # Parameters
/// - `self`: Reference to the PermissionsGroup
///
/// # Returns
/// The address of the creator.
public fun creator<T: drop>(self: &PermissionsGroup<T>): address {
    self.creator
}

/// Returns the number of `CorePermissionsManager`s in the PermissionsGroup.
///
/// # Parameters
/// - `self`: Reference to the PermissionsGroup
///
/// # Returns
/// The count of `CorePermissionsManager`s.
public fun core_managers_count<T: drop>(self: &PermissionsGroup<T>): u64 {
    self.core_managers_count
}

// === Private Functions ===

/// Returns a VecSet containing all core permissions.
fun core_permissions_set(): VecSet<TypeName> {
    let mut permissions = vec_set::empty<TypeName>();
    permissions.insert(type_name::with_defining_ids<CorePermissionsManager>());
    permissions.insert(type_name::with_defining_ids<ExtensionPermissionsManager>());
    permissions
}

/// Asserts that the manager has permission to manage (grant/revoke) the specified permission type.
/// - To manage `CorePermissionsManager`: manager must have `CorePermissionsManager`
/// - To manage any other permission: manager must have `CorePermissionsManager` OR
/// `ExtensionPermissionsManager`
fun assert_can_manage_permission<T: drop, Permission: drop>(
    self: &PermissionsGroup<T>,
    manager: address,
) {
    let permission_type = type_name::with_defining_ids<Permission>();
    let managing_core_manager =
        permission_type == type_name::with_defining_ids<CorePermissionsManager>();

    if (managing_core_manager) {
        // Only CorePermissionsManager can manage CorePermissionsManager
        assert!(self.has_permission<T, CorePermissionsManager>(manager), ENotPermitted);
    } else {
        // For all other permissions, either CorePermissionsManager or ExtensionPermissionsManager
        // can manage
        assert!(
            self.has_permission<T, CorePermissionsManager>(manager) ||
            self.has_permission<T, ExtensionPermissionsManager>(manager),
            ENotPermitted,
        );
    };
}

/// Internal helper to add a member to the PermissionsGroup.
/// Emits `MemberAdded` event.
fun internal_add_member<T: drop>(self: &mut PermissionsGroup<T>, new_member: address) {
    let is_new_member = !self.is_member<T>(new_member);
    if (is_new_member) {
        self.permissions.add(new_member, vec_set::empty<TypeName>());
        event::emit(MemberAdded<T> {
            group_id: object::id(self),
            member: new_member,
        });
    };
}

/// Decrements core_managers_count if member has `CorePermissionsManager`.
/// Used when revoking core permissions or removing a member.
/// Aborts if this would leave no core managers.
fun safe_decrement_core_managers_count<T: drop>(self: &mut PermissionsGroup<T>, member: address) {
    let member_permissions_set = self.permissions.borrow(member);
    if (member_permissions_set.contains(&type_name::with_defining_ids<CorePermissionsManager>())) {
        assert!(self.core_managers_count > 1, ELastPermissionsManager);
        self.core_managers_count = self.core_managers_count - 1;
    };
}

/// Internal helper to grant a permission to a member.
/// Adds the member if they don't exist, then grants the permission.
/// Increments core_managers_count if granting `CorePermissionsManager`.
/// Emits `MemberAdded` event if member is new.
fun internal_grant_permission<T: drop, NewPermission: drop>(
    self: &mut PermissionsGroup<T>,
    member: address,
) {
    // Add member if they don't exist
    self.internal_add_member(member);

    // Grant the permission
    let member_permissions_set = self.permissions.borrow_mut(member);
    member_permissions_set.insert(type_name::with_defining_ids<NewPermission>());

    // Track CorePermissionsManager count
    if (
        type_name::with_defining_ids<NewPermission>() == type_name::with_defining_ids<CorePermissionsManager>()
    ) {
        self.core_managers_count = self.core_managers_count + 1;
    };

    event::emit(PermissionsGranted<T> {
        group_id: object::id(self),
        member,
        permissions: vector[type_name::with_defining_ids<NewPermission>()],
    });
}

/// Internal helper to remove a member from the PermissionsGroup.
fun internal_revoke_permission<T: drop, ExistingPermission: drop>(
    self: &mut PermissionsGroup<T>,
    member: address,
) {
    // Check if revoking CorePermissionsManager
    if (
        type_name::with_defining_ids<ExistingPermission>() == type_name::with_defining_ids<CorePermissionsManager>()
    ) {
        self.safe_decrement_core_managers_count(member);
    };

    // Revoke the permission
    {
        let member_permissions_set = self.permissions.borrow_mut(member);
        member_permissions_set.remove(&type_name::with_defining_ids<ExistingPermission>());
    };

    event::emit(PermissionsRevoked<T> {
        group_id: object::id(self),
        member,
        permissions: vector[type_name::with_defining_ids<ExistingPermission>()],
    });

    // If member has no permissions left, remove them from the group
    let member_permissions_set = self.permissions.borrow(member);
    if (member_permissions_set.is_empty()) {
        self.permissions.remove(member);
        event::emit(MemberRemoved<T> {
            group_id: object::id(self),
            member,
        });
    };
}

/// Internal helper to grant all core permissions to a member.
/// Adds the member if they don't exist.
/// Emits `MemberAdded` (if new) and `PermissionsGranted` events.
fun internal_grant_core_permissions<T: drop>(self: &mut PermissionsGroup<T>, member: address) {
    // Add member if they don't exist
    self.internal_add_member(member);

    // Grant all core permissions
    let core_perms = core_permissions_set();
    let member_permissions_set = self.permissions.borrow_mut(member);
    core_perms.into_keys().do!(|permission| {
        member_permissions_set.insert(permission);
        if (permission == type_name::with_defining_ids<CorePermissionsManager>()) {
            self.core_managers_count = self.core_managers_count + 1;
        };
    });

    event::emit(PermissionsGranted<T> {
        group_id: object::id(self),
        member,
        permissions: core_permissions_set().into_keys(),
    });
}

/// Internal helper to revoke all core permissions from a member.
/// Emits `PermissionsRevoked` event.
fun internal_revoke_core_permissions<T: drop>(self: &mut PermissionsGroup<T>, member: address) {
    self.safe_decrement_core_managers_count(member);
    let member_permissions_set = self.permissions.borrow_mut(member);
    core_permissions_set().into_keys().do!(|permission| {
        if (member_permissions_set.contains(&permission)) {
            member_permissions_set.remove(&permission);
        };
    });

    event::emit(PermissionsRevoked<T> {
        group_id: object::id(self),
        member,
        permissions: core_permissions_set().into_keys(),
    });
}
