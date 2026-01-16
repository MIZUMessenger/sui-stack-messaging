/// Module: permissioned_group
///
/// Generic permission system for group management.
///
/// ## Permissions
///
/// - `Administrator`: Super-admin role that can grant/revoke all permissions and remove members
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
/// - **Permission hierarchy**: Only `Administrator` can grant/revoke `Administrator`; all other
/// permissions can be managed by either `Administrator` or `ExtensionPermissionsManager`
///
/// ## Invariants
///
/// - At least one `Administrator` must always exist
/// - Members always have at least one permission (empty permission sets are not allowed)
module permissioned_groups::permissioned_group;

use std::type_name::{Self, TypeName};
use sui::derived_object;
use sui::event;
use sui::table::{Self, Table};
use sui::vec_set::{Self, VecSet};

// === Error Codes ===

const ENotPermitted: u64 = 0;
const EMemberNotFound: u64 = 1;
const ELastAdministrator: u64 = 2;
const EPermissionedGroupAlreadyExists: u64 = 3;

// === Permission Witnesses ===

/// Permission to manage all permissions defined in the groups package.
/// This is the super-admin role that can:
/// - Grant/revoke all permissions (including other Administrators)
/// - Remove members from the group
public struct Administrator() has drop;

/// Permission to manage extension permissions defined in third-party packages.
/// Can grant/revoke extension permissions but NOT `Administrator`.
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
// fun create_display<T>(publisher: &Publisher): Display<PermissionedGroup<T>> { ... }

/// Group state mapping addresses to their granted permissions.
/// Parameterized by `T` to scope permissions to a specific package.
public struct PermissionedGroup<phantom T: drop> has key, store {
    id: UID,
    /// Maps member addresses (user or object) to their permission set.
    /// Object addresses enable `object_*` functions for third-party "actor" contracts.
    permissions: Table<address, VecSet<TypeName>>,
    /// Tracks `Administrator` count to enforce at-least-one invariant.
    administrators_count: u64,
    /// Original creator's address
    creator: address,
}

// === Events ===

/// Emitted when a new PermissionedGroup is created via `new`.
public struct GroupCreated<phantom T> has copy, drop {
    /// ID of the created group.
    group_id: ID,
    /// Address of the group creator.
    creator: address,
}

/// Emitted when a new PermissionedGroup is created via `new_derived`.
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

/// Creates a new PermissionedGroup with the sender as initial admin.
/// Grants `Administrator` and `ExtensionPermissionsManager` to creator.
///
/// # Type Parameters
/// - `T`: Package witness type to scope permissions
///
/// # Parameters
/// - `ctx`: Transaction context
///
/// # Returns
/// A new `PermissionedGroup<T>` with sender having `Administrator` and `ExtensionPermissionsManager`.
public fun new<T: drop>(ctx: &mut TxContext): PermissionedGroup<T> {
    let creator = ctx.sender();

    // Initialize creator with Administrator and ExtensionPermissionsManager
    let mut creator_permissions = vec_set::empty<TypeName>();
    creator_permissions.insert(type_name::with_defining_ids<Administrator>());
    creator_permissions.insert(type_name::with_defining_ids<ExtensionPermissionsManager>());

    let mut permissions_table = table::new<address, VecSet<TypeName>>(ctx);
    permissions_table.add(creator, creator_permissions);

    let group = PermissionedGroup<T> {
        id: object::new(ctx),
        permissions: permissions_table,
        administrators_count: 1,
        creator,
    };

    event::emit(GroupCreated<T> {
        group_id: object::id(&group),
        creator,
    });

    group
}

/// Creates a new derived PermissionedGroup with deterministic address.
/// Grants `Administrator` and `ExtensionPermissionsManager` to creator.
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
/// A new `PermissionedGroup<T>` with derived address.
///
/// # Aborts
/// - `EPermissionedGroupAlreadyExists`: if derived address is already claimed
public fun new_derived<T: drop, DerivationKey: copy + drop + store>(
    derivation_uid: &mut UID,
    derivation_key: DerivationKey,
    ctx: &mut TxContext,
): PermissionedGroup<T> {
    assert!(
        !derived_object::exists(derivation_uid, derivation_key),
        EPermissionedGroupAlreadyExists,
    );

    let creator = ctx.sender();

    // Initialize creator with Administrator and ExtensionPermissionsManager
    let mut creator_permissions = vec_set::empty<TypeName>();
    creator_permissions.insert(type_name::with_defining_ids<Administrator>());
    creator_permissions.insert(type_name::with_defining_ids<ExtensionPermissionsManager>());

    let mut permissions_table = table::new<address, VecSet<TypeName>>(ctx);
    permissions_table.add(creator, creator_permissions);

    let group = PermissionedGroup<T> {
        id: derived_object::claim(derivation_uid, derivation_key),
        permissions: permissions_table,
        administrators_count: 1,
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
/// - To grant `Administrator`: caller must have `Administrator`
/// - To grant any other permission: caller must have `Administrator` OR
/// `ExtensionPermissionsManager`
///
/// # Type Parameters
/// - `T`: Package witness type
/// - `NewPermission`: Permission type to grant
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionedGroup
/// - `member`: Address of the member to grant permission to
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `ENotPermitted`: if caller doesn't have appropriate manager permission
public fun grant_permission<T: drop, NewPermission: drop>(
    self: &mut PermissionedGroup<T>,
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
/// - To grant `Administrator`: actor must have `Administrator`
/// - To grant any other permission: actor must have `Administrator` OR
/// `ExtensionPermissionsManager`
///
/// # Type Parameters
/// - `T`: Package witness type
/// - `NewPermission`: Permission type to grant
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionedGroup
/// - `actor_object`: UID of the actor object with appropriate manager permission
/// - `ctx`: Transaction context (sender will receive the permission)
///
/// # Aborts
/// - `ENotPermitted`: if actor_object doesn't have appropriate manager permission
public fun object_grant_permission<T: drop, NewPermission: drop>(
    self: &mut PermissionedGroup<T>,
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

/// Removes a member from the PermissionedGroup.
/// Requires `Administrator` permission as this is a powerful admin operation.
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionedGroup
/// - `member`: Address of the member to remove
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `ENotPermitted`: if caller doesn't have `Administrator` permission
/// - `EMemberNotFound`: if member doesn't exist
/// - `ELastAdministrator`: if removing would leave no Administrators
public fun remove_member<T: drop>(
    self: &mut PermissionedGroup<T>,
    member: address,
    ctx: &TxContext,
) {
    assert!(self.has_permission<T, Administrator>(ctx.sender()), ENotPermitted);
    assert!(self.is_member<T>(member), EMemberNotFound);
    self.safe_decrement_administrators_count(member);
    self.permissions.remove(member);

    event::emit(MemberRemoved<T> {
        group_id: object::id(self),
        member,
    });
}

/// Removes the transaction sender from the group via an actor object.
/// Enables third-party contracts to implement custom leave logic.
/// The actor object must have `Administrator` permission on the group.
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionedGroup
/// - `actor_object`: UID of the actor object with `Administrator` permission
/// - `ctx`: Transaction context (sender will be removed)
///
/// # Aborts
/// - `ENotPermitted`: if actor_object doesn't have `Administrator` permission
/// - `EMemberNotFound`: if sender is not a member
/// - `ELastAdministrator`: if removing would leave no Administrators
public fun object_remove_member<T: drop>(
    self: &mut PermissionedGroup<T>,
    actor_object: &UID,
    ctx: &mut TxContext,
) {
    let actor_address = actor_object.to_address();
    assert!(self.has_permission<T, Administrator>(actor_address), ENotPermitted);
    let member = ctx.sender();
    assert!(self.is_member<T>(member), EMemberNotFound);
    self.safe_decrement_administrators_count(member);

    self.permissions.remove(member);

    event::emit(MemberRemoved<T> {
        group_id: object::id(self),
        member,
    });
}

/// Revokes a permission from a member.
/// If this is the member's last permission, they are automatically removed from the group.
/// Emits `PermissionsRevoked` and potentially `MemberRemoved` events.
///
/// Permission requirements:
/// - To revoke `Administrator`: caller must have `Administrator`
/// - To revoke any other permission: caller must have `Administrator` OR
/// `ExtensionPermissionsManager`
///
/// # Type Parameters
/// - `T`: Package witness type
/// - `ExistingPermission`: Permission type to revoke
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionedGroup
/// - `member`: Address of the member to revoke permission from
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `ENotPermitted`: if caller doesn't have appropriate manager permission
/// - `EMemberNotFound`: if member doesn't exist
/// - `ELastAdministrator`: if revoking `Administrator` would leave no administrators
public fun revoke_permission<T: drop, ExistingPermission: drop>(
    self: &mut PermissionedGroup<T>,
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
/// - To revoke `Administrator`: actor must have `Administrator`
/// - To revoke any other permission: actor must have `Administrator` OR
/// `ExtensionPermissionsManager`
///
/// # Type Parameters
/// - `T`: Package witness type
/// - `ExistingPermission`: Permission type to revoke
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionedGroup
/// - `actor_object`: UID of the actor object with appropriate manager permission
/// - `ctx`: Transaction context (sender will have the permission revoked)
///
/// # Aborts
/// - `ENotPermitted`: if actor_object doesn't have appropriate manager permission
/// - `EMemberNotFound`: if sender is not a member
/// - `ELastAdministrator`: if revoking `Administrator` would leave no administrators
public fun object_revoke_permission<T: drop, ExistingPermission: drop>(
    self: &mut PermissionedGroup<T>,
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

// === Getters ===

/// Checks if the given address has the specified permission.
///
/// # Type Parameters
/// - `T`: Package witness type
/// - `Permission`: Permission type to check
///
/// # Parameters
/// - `self`: Reference to the PermissionedGroup
/// - `member`: Address to check
///
/// # Returns
/// `true` if the address has the permission, `false` otherwise.
public fun has_permission<T: drop, Permission: drop>(
    self: &PermissionedGroup<T>,
    member: address,
): bool {
    self.permissions.borrow(member).contains(&type_name::with_defining_ids<Permission>())
}

/// Checks if the given address is a member of the group.
///
/// # Parameters
/// - `self`: Reference to the PermissionedGroup
/// - `member`: Address to check
///
/// # Returns
/// `true` if the address is a member, `false` otherwise.
public fun is_member<T: drop>(self: &PermissionedGroup<T>, member: address): bool {
    self.permissions.contains(member)
}

/// Returns the creator's address of the PermissionedGroup.
///
/// # Parameters
/// - `self`: Reference to the PermissionedGroup
///
/// # Returns
/// The address of the creator.
public fun creator<T: drop>(self: &PermissionedGroup<T>): address {
    self.creator
}

/// Returns the number of `Administrator`s in the PermissionedGroup.
///
/// # Parameters
/// - `self`: Reference to the PermissionedGroup
///
/// # Returns
/// The count of `Administrator`s.
public fun administrators_count<T: drop>(self: &PermissionedGroup<T>): u64 {
    self.administrators_count
}

// === Private Functions ===

/// Asserts that the manager has permission to manage (grant/revoke) the specified permission type.
/// - To manage `Administrator`: manager must have `Administrator`
/// - To manage any other permission: manager must have `Administrator` OR
/// `ExtensionPermissionsManager`
fun assert_can_manage_permission<T: drop, Permission: drop>(
    self: &PermissionedGroup<T>,
    manager: address,
) {
    let permission_type = type_name::with_defining_ids<Permission>();
    let managing_core_manager =
        permission_type == type_name::with_defining_ids<Administrator>();

    if (managing_core_manager) {
        // Only Administrator can manage Administrator
        assert!(self.has_permission<T, Administrator>(manager), ENotPermitted);
    } else {
        // For all other permissions, either Administrator or ExtensionPermissionsManager
        // can manage
        assert!(
            self.has_permission<T, Administrator>(manager) ||
            self.has_permission<T, ExtensionPermissionsManager>(manager),
            ENotPermitted,
        );
    };
}

/// Internal helper to add a member to the PermissionedGroup.
/// Emits `MemberAdded` event.
fun internal_add_member<T: drop>(self: &mut PermissionedGroup<T>, new_member: address) {
    let is_new_member = !self.is_member<T>(new_member);
    if (is_new_member) {
        self.permissions.add(new_member, vec_set::empty<TypeName>());
        event::emit(MemberAdded<T> {
            group_id: object::id(self),
            member: new_member,
        });
    };
}

/// Decrements administrators_count if member has `Administrator`.
/// Used when revoking `Administrator` permission or removing a member.
/// Aborts if this would leave no administrators.
fun safe_decrement_administrators_count<T: drop>(self: &mut PermissionedGroup<T>, member: address) {
    let member_permissions_set = self.permissions.borrow(member);
    if (member_permissions_set.contains(&type_name::with_defining_ids<Administrator>())) {
        assert!(self.administrators_count > 1, ELastAdministrator);
        self.administrators_count = self.administrators_count - 1;
    };
}

/// Internal helper to grant a permission to a member.
/// Adds the member if they don't exist, then grants the permission.
/// Increments administrators_count if granting `Administrator`.
/// Emits `MemberAdded` event if member is new.
fun internal_grant_permission<T: drop, NewPermission: drop>(
    self: &mut PermissionedGroup<T>,
    member: address,
) {
    // Add member if they don't exist
    self.internal_add_member(member);

    // Grant the permission
    let member_permissions_set = self.permissions.borrow_mut(member);
    member_permissions_set.insert(type_name::with_defining_ids<NewPermission>());

    // Track Administrator count
    if (
        type_name::with_defining_ids<NewPermission>() == type_name::with_defining_ids<Administrator>()
    ) {
        self.administrators_count = self.administrators_count + 1;
    };

    event::emit(PermissionsGranted<T> {
        group_id: object::id(self),
        member,
        permissions: vector[type_name::with_defining_ids<NewPermission>()],
    });
}

/// Internal helper to remove a member from the PermissionedGroup.
fun internal_revoke_permission<T: drop, ExistingPermission: drop>(
    self: &mut PermissionedGroup<T>,
    member: address,
) {
    // Check if revoking Administrator
    if (
        type_name::with_defining_ids<ExistingPermission>() == type_name::with_defining_ids<Administrator>()
    ) {
        self.safe_decrement_administrators_count(member);
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

