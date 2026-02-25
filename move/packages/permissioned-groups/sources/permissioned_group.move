/// Module: permissioned_group
///
/// Generic permission system for group management.
///
/// ## Permissions
///
/// Core permissions (defined in this package):
/// - `PermissionsAdmin`: Manages core permissions. Can grant/revoke PermissionsAdmin,
///   ExtensionPermissionsAdmin, ObjectAdmin. Can remove members.
/// - `ExtensionPermissionsAdmin`: Manages extension permissions defined in third-party packages.
/// - `ObjectAdmin`: Admin-tier permission granting raw `&mut UID` access to the group object.
///   Use cases include attaching dynamic fields or integrating with external protocols
///   (e.g. SuiNS reverse lookup). Only accessible via the actor-object pattern
///   (`object_uid` / `object_uid_mut`), which forces extending contracts to explicitly
///   reason about the implications of mutating the group object.
///
/// ## Permission Scoping
///
/// - `PermissionsAdmin` can ONLY manage core permissions (from this package):
///   PermissionsAdmin, ExtensionPermissionsAdmin, ObjectAdmin
/// - `ExtensionPermissionsAdmin` can ONLY manage extension permissions (from other packages)
///
/// ## Key Concepts
///
/// - **Membership is defined by permissions**: A member exists if and only if they have at least
/// one permission
/// - **Granting implicitly adds**: `grant_permission()` will automatically add a member if they
/// don't exist
/// - **Revoking may remove**: Revoking the last permission automatically removes the member from
/// the group
///
/// ## Invariants
///
/// - At least one `PermissionsAdmin` must always exist
/// - Members always have at least one permission (empty permission sets are not allowed)
module permissioned_groups::permissioned_group;

use permissioned_groups::permissions_table::{Self, PermissionsTable};
use std::type_name::{Self, TypeName};
use sui::derived_object;
use sui::event;
use sui::vec_set;

// === Error Codes ===

/// Caller lacks the required permission to perform the operation.
const ENotPermitted: u64 = 0;
/// The specified address is not a member of the group.
const EMemberNotFound: u64 = 1;
/// Cannot remove or revoke the last `Administrator` in the group.
const ELastPermissionsAdmin: u64 = 2;
/// A derived `PermissionedGroup` already exists for the given derivation key.
const EPermissionedGroupAlreadyExists: u64 = 3;

// === Constants ===
const PERMISSIONS_TABLE_DERIVATION_KEY_BYTES: vector<u8> = b"permissions_table";

// === Permission Witnesses ===

/// Permission to manage core permissions defined in the permissioned_groups package.
/// Can manage: PermissionsAdmin, ExtensionPermissionsAdmin, ObjectAdmin.
/// Cannot manage extension permissions (those from other packages).
public struct PermissionsAdmin() has drop;

/// Permission to manage extension permissions defined in third-party packages.
/// Can manage permissions from OTHER packages (e.g., MessagingSender, FundsManager).
/// Cannot manage core permissions (PermissionsAdmin, ExtensionPermissionsAdmin, etc.).
public struct ExtensionPermissionsAdmin() has drop;

/// Admin-tier permission granting access to the group's UID (&UID and &mut UID).
/// Only accessible via the actor-object pattern; see `object_uid` / `object_uid_mut`.
public struct ObjectAdmin() has drop;

// === Structs ===

/// Group state mapping addresses to their granted permissions.
/// Parameterized by `T` to scope permissions to a specific package.
public struct PermissionedGroup<phantom T: drop> has key, store {
    id: UID,
    /// Maps member addresses (user or object) to their permission set.
    /// Object addresses enable `object_*` functions for third-party "actor" contracts.
    permissions: PermissionsTable,
    /// Tracks `PermissionsAdmin` count to enforce at-least-one invariant.
    permissions_admin_count: u64,
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
public struct GroupDerived<phantom T, DerivationKey: copy + drop> has copy, drop {
    /// ID of the created group.
    group_id: ID,
    /// Address of the group creator.
    creator: address,
    /// ID of the parent object from which the group was derived.
    parent_id: ID,
    /// derivation key used.
    derivation_key: DerivationKey,
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
/// Grants `PermissionsAdmin` and `ExtensionPermissionsAdmin` to creator.
///
/// # Type Parameters
/// - `T`: Package witness type to scope permissions
///
/// # Parameters
/// - `_witness`: Instance of witness type `T` (proves caller owns the type)
/// - `ctx`: Transaction context
///
/// # Returns
/// A new `PermissionedGroup<T>` with sender having `PermissionsAdmin` and
/// `ExtensionPermissionsAdmin`.
public fun new<T: drop>(_witness: T, ctx: &mut TxContext): PermissionedGroup<T> {
    let group_uid = object::new(ctx);
    let creator = ctx.sender();

    event::emit(GroupCreated<T> {
        group_id: group_uid.to_inner(),
        creator,
    });

    internal_new!(group_uid, creator)
}

/// Creates a new derived PermissionedGroup with deterministic address.
/// Grants `PermissionsAdmin` and `ExtensionPermissionsAdmin` to creator.
///
/// # Type Parameters
/// - `T`: Package witness type to scope permissions
/// - `DerivationKey`: Key type for address derivation
///
/// # Parameters
/// - `_witness`: Instance of witness type `T` (proves caller owns the type)
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
    _witness: T,
    derivation_uid: &mut UID,
    derivation_key: DerivationKey,
    ctx: &mut TxContext,
): PermissionedGroup<T> {
    assert!(
        !derived_object::exists(derivation_uid, derivation_key),
        EPermissionedGroupAlreadyExists,
    );
    let group_uid = derived_object::claim(derivation_uid, derivation_key);
    let creator = ctx.sender();

    event::emit(GroupDerived<T, DerivationKey> {
        group_id: group_uid.to_inner(),
        creator,
        parent_id: object::uid_to_inner(derivation_uid),
        derivation_key,
    });

    internal_new!(group_uid, creator)
}

/// Grants a permission to a member.
/// If the member doesn't exist, they are automatically added to the group.
/// Emits both `MemberAdded` (if new) and `PermissionsGranted` events.
///
/// Permission requirements:
/// - Core permissions: caller must have `PermissionsAdmin`
/// - Extension permissions: caller must have `ExtensionPermissionsAdmin`
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

/// Grants a permission to a recipient via an actor object.
/// Enables third-party contracts to grant permissions with custom logic.
/// If the recipient is not already a member, they are automatically added.
///
/// Permission requirements:
/// - Core permissions: actor must have `PermissionsAdmin`
/// - Extension permissions: actor must have `ExtensionPermissionsAdmin`
///
/// # Type Parameters
/// - `T`: Package witness type
/// - `NewPermission`: Permission type to grant
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionedGroup
/// - `actor_object`: UID of the actor object with appropriate manager permission
/// - `recipient`: Address of the member to receive the permission
///
/// # Aborts
/// - `ENotPermitted`: if actor_object doesn't have appropriate manager permission
public fun object_grant_permission<T: drop, NewPermission: drop>(
    self: &mut PermissionedGroup<T>,
    actor_object: &UID,
    recipient: address,
) {
    let actor_address = actor_object.to_address();

    // Verify actor has permission to grant this permission type
    self.assert_can_manage_permission<T, NewPermission>(actor_address);

    // internal_grant_permission handles member addition and permission granting
    self.internal_grant_permission<T, NewPermission>(recipient);
}

/// Removes a member from the PermissionedGroup.
/// Requires `PermissionsAdmin` permission as this is a powerful admin operation.
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionedGroup
/// - `member`: Address of the member to remove
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `ENotPermitted`: if caller doesn't have `PermissionsAdmin` permission
/// - `EMemberNotFound`: if member doesn't exist
/// - `ELastPermissionsAdmin`: if removing would leave no PermissionsAdmins
public fun remove_member<T: drop>(
    self: &mut PermissionedGroup<T>,
    member: address,
    ctx: &TxContext,
) {
    assert!(self.has_permission<T, PermissionsAdmin>(ctx.sender()), ENotPermitted);
    assert!(self.is_member<T>(member), EMemberNotFound);
    self.safe_decrement_permissions_admin_count(member);
    self.permissions.remove_member(member);

    event::emit(MemberRemoved<T> {
        group_id: object::id(self),
        member,
    });
}

/// Removes a member from the group via an actor object.
/// Enables third-party contracts to implement custom leave logic.
/// The actor object must have `PermissionsAdmin` permission on the group.
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionedGroup
/// - `actor_object`: UID of the actor object with `PermissionsAdmin` permission
/// - `member`: Address of the member to remove
///
/// # Aborts
/// - `ENotPermitted`: if actor_object doesn't have `PermissionsAdmin` permission
/// - `EMemberNotFound`: if member is not a member
/// - `ELastPermissionsAdmin`: if removing would leave no PermissionsAdmins
public fun object_remove_member<T: drop>(
    self: &mut PermissionedGroup<T>,
    actor_object: &UID,
    member: address,
) {
    let actor_address = actor_object.to_address();
    assert!(self.has_permission<T, PermissionsAdmin>(actor_address), ENotPermitted);
    assert!(self.is_member<T>(member), EMemberNotFound);
    self.safe_decrement_permissions_admin_count(member);

    self.permissions.remove_member(member);

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
/// - Core permissions: caller must have `PermissionsAdmin`
/// - Extension permissions: caller must have `ExtensionPermissionsAdmin`
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
/// - `ELastPermissionsAdmin`: if revoking `PermissionsAdmin` would leave no admins
public fun revoke_permission<T: drop, ExistingPermission: drop>(
    self: &mut PermissionedGroup<T>,
    member: address,
    ctx: &TxContext,
) {
    // Verify caller has permission to revoke this permission type
    self.assert_can_manage_permission<T, ExistingPermission>(ctx.sender());

    assert!(self.permissions.is_member(member), EMemberNotFound);

    self.internal_revoke_permission<T, ExistingPermission>(member);
}

/// Revokes a permission from a member via an actor object.
/// Enables third-party contracts to revoke permissions with custom logic.
/// If this is the member's last permission, they are automatically removed from the group.
///
/// Permission requirements:
/// - Core permissions: actor must have `PermissionsAdmin`
/// - Extension permissions: actor must have `ExtensionPermissionsAdmin`
///
/// # Type Parameters
/// - `T`: Package witness type
/// - `ExistingPermission`: Permission type to revoke
///
/// # Parameters
/// - `self`: Mutable reference to the PermissionedGroup
/// - `actor_object`: UID of the actor object with appropriate manager permission
/// - `member`: Address of the member to revoke permission from
///
/// # Aborts
/// - `ENotPermitted`: if actor_object doesn't have appropriate manager permission
/// - `EMemberNotFound`: if member is not a member
/// - `ELastPermissionsAdmin`: if revoking `PermissionsAdmin` would leave no admins
public fun object_revoke_permission<T: drop, ExistingPermission: drop>(
    self: &mut PermissionedGroup<T>,
    actor_object: &UID,
    member: address,
) {
    let actor_address = actor_object.to_address();

    // Verify actor has permission to revoke this permission type
    self.assert_can_manage_permission<T, ExistingPermission>(actor_address);

    assert!(self.permissions.is_member(member), EMemberNotFound);

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
    self.permissions.has_permission(member, &type_name::with_original_ids<Permission>())
}

/// Checks if the given address is a member of the group.
///
/// # Type Parameters
/// - `T`: Package witness type
///
/// # Parameters
/// - `self`: Reference to the PermissionedGroup
/// - `member`: Address to check
///
/// # Returns
/// `true` if the address is a member, `false` otherwise.
public fun is_member<T: drop>(self: &PermissionedGroup<T>, member: address): bool {
    self.permissions.is_member(member)
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

// === UID Access Functions ===

/// Returns a reference to the group's UID via an actor object.
/// The actor object must have `ObjectAdmin` permission on the group.
/// Only accessible via the actor-object pattern — use this to build wrapper modules
/// that explicitly reason about the implications of accessing the group UID.
///
/// # Aborts
/// - `ENotPermitted`: if actor_object doesn't have `ObjectAdmin` permission
public fun object_uid<T: drop>(self: &PermissionedGroup<T>, actor_object: &UID): &UID {
    assert!(self.has_permission<T, ObjectAdmin>(actor_object.to_address()), ENotPermitted);
    &self.id
}

/// Returns a mutable reference to the group's UID via an actor object.
/// The actor object must have `ObjectAdmin` permission on the group.
/// Only accessible via the actor-object pattern — use this to build wrapper modules
/// that explicitly reason about the implications of mutating the group UID.
///
/// # Aborts
/// - `ENotPermitted`: if actor_object doesn't have `ObjectAdmin` permission
public fun object_uid_mut<T: drop>(self: &mut PermissionedGroup<T>, actor_object: &UID): &mut UID {
    assert!(self.has_permission<T, ObjectAdmin>(actor_object.to_address()), ENotPermitted);
    &mut self.id
}

/// Returns the number of `PermissionsAdmin`s in the PermissionedGroup.
///
/// # Parameters
/// - `self`: Reference to the PermissionedGroup
///
/// # Returns
/// The count of `PermissionsAdmin`s.
public fun permissions_admin_count<T: drop>(self: &PermissionedGroup<T>): u64 {
    self.permissions_admin_count
}

// === Private Functions ===

/// Returns true if Permission is defined in the permissioned_groups package.
fun is_core_permission<Permission: drop>(): bool {
    type_name::original_id<Permission>() == type_name::original_id<PermissionsAdmin>()
}

/// Asserts that the manager has permission to manage (grant/revoke) the specified permission type.
/// - Core permissions (from this package): manager must have `PermissionsAdmin`
/// - Extension permissions (from other packages): manager must have `ExtensionPermissionsAdmin`
fun assert_can_manage_permission<T: drop, Permission: drop>(
    self: &PermissionedGroup<T>,
    manager: address,
) {
    if (is_core_permission<Permission>()) {
        // Core permissions → only PermissionsAdmin
        assert!(self.has_permission<T, PermissionsAdmin>(manager), ENotPermitted);
    } else {
        // Extension permissions → only ExtensionPermissionsAdmin
        assert!(self.has_permission<T, ExtensionPermissionsAdmin>(manager), ENotPermitted);
    };
}

/// Decrements permissions_admin_count if member has `PermissionsAdmin`.
/// Used when revoking `PermissionsAdmin` permission or removing a member.
/// Aborts if this would leave no PermissionsAdmins.
///
/// NOTE: `permissions_admin_count` tracks all holders of `PermissionsAdmin`, including
/// actor-object addresses. If actor objects hold `PermissionsAdmin`, a group may end up
/// with no human admins without this guard triggering. Downstream packages using the
/// actor-object pattern for self-service operations should be aware of this.
fun safe_decrement_permissions_admin_count<T: drop>(
    self: &mut PermissionedGroup<T>,
    member: address,
) {
    if (
        self.permissions.has_permission(member, &type_name::with_original_ids<PermissionsAdmin>())
    ) {
        assert!(self.permissions_admin_count > 1, ELastPermissionsAdmin);
        self.permissions_admin_count = self.permissions_admin_count - 1;
    };
}

/// Internal helper to grant a permission to a member.
/// Adds the member if they don't exist, then grants the permission.
/// Increments permissions_admin_count if granting `PermissionsAdmin`.
/// Emits `MemberAdded` event if member is new.
fun internal_grant_permission<T: drop, NewPermission: drop>(
    self: &mut PermissionedGroup<T>,
    member: address,
) {
    let permission_type = type_name::with_original_ids<NewPermission>();
    if (self.is_member(member)) {
        self.permissions.add_permission(member, permission_type);
    } else {
        self.permissions.add_member(member, vec_set::singleton(permission_type));

        event::emit(MemberAdded<T> {
            group_id: object::id(self),
            member,
        });
    };

    if (permission_type == type_name::with_original_ids<PermissionsAdmin>()) {
        self.permissions_admin_count = self.permissions_admin_count + 1;
    };

    event::emit(PermissionsGranted<T> {
        group_id: object::id(self),
        member,
        permissions: vector[permission_type],
    });
}

/// Internal helper to revoke a permission from a PermissionedGroup member.
/// If this is the member's last permission, they are removed from the group.
fun internal_revoke_permission<T: drop, ExistingPermission: drop>(
    self: &mut PermissionedGroup<T>,
    member: address,
) {
    let permission_type = type_name::with_original_ids<ExistingPermission>();
    // Check if revoking PermissionsAdmin
    if (permission_type == type_name::with_original_ids<PermissionsAdmin>()) {
        self.safe_decrement_permissions_admin_count(member);
    };

    // Revoke the permission
    let member_permissions_set = self.permissions.remove_permission(member, &permission_type);

    event::emit(PermissionsRevoked<T> {
        group_id: object::id(self),
        member,
        permissions: vector[type_name::with_original_ids<ExistingPermission>()],
    });

    // If member has no permissions left, remove them from the group
    if (member_permissions_set.is_empty()) {
        self.permissions.remove_member(member);
        event::emit(MemberRemoved<T> {
            group_id: object::id(self),
            member,
        });
    };
}

/// Shared initialization logic for `new` and `new_derived`.
/// Creates a `PermissionsTable`, adds the creator with `PermissionsAdmin` and
/// `ExtensionPermissionsAdmin`, and emits the initial events.
macro fun internal_new<$T: drop>($group_uid: UID, $creator: address): PermissionedGroup<$T> {
    let mut group_uid = $group_uid;
    let creator = $creator;
    // Initialize creator with PermissionsAdmin and ExtensionPermissionsAdmin
    let mut creator_permissions = vec_set::empty<TypeName>();
    creator_permissions.insert(type_name::with_original_ids<PermissionsAdmin>());
    creator_permissions.insert(type_name::with_original_ids<ExtensionPermissionsAdmin>());

    let mut permissions_table = permissions_table::new_derived(
        &mut group_uid,
        PERMISSIONS_TABLE_DERIVATION_KEY_BYTES.to_string(),
    );
    permissions_table.add_member(creator, creator_permissions);

    let group = PermissionedGroup<$T> {
        id: group_uid,
        permissions: permissions_table,
        // Only PermissionsAdmin is counted (not ExtensionPermissionsAdmin)
        permissions_admin_count: 1,
        creator,
    };

    // Emit MemberAdded event for the creator (they are the first member)
    event::emit(MemberAdded<$T> {
        group_id: object::id(&group),
        member: creator,
    });

    // Emit PermissionsGranted event for the creator's initial permissions
    // This allows event subscribers (like relayers) to track initial admin permissions
    event::emit(PermissionsGranted<$T> {
        group_id: object::id(&group),
        member: creator,
        permissions: creator_permissions.into_keys(),
    });

    group
}
