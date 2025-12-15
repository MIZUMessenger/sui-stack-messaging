module public_package::auth_state;

use std::type_name::{Self, TypeName};
use sui::table::{Self, Table};
use sui::vec_set::{Self, VecSet};

const ENotPermitted: u64 = 0;
const EMemberNotFound: u64 = 1;
// Error code for attempting to revoke the last PermissionsManager permission
const ELastPermissionsManager: u64 = 2;

// TODO1: It might make more sense to just have PermissionsGranter and PermissionsRevoker
// We DO want to have separate permissions for adding/removing because removing a member is
// a more privileged/dangerous operation than adding a member.
// So, I propose to either have PermissionsManager + separate MemberAdder/MemberRemover
// Or just PermissionsGranter + PermissionsRevoker
// For now, we will keep PermissionsManager + MemberAdder/MemberRemover

// TODO2: we currently check and ensure there is always at least one PermissionsManager,
// Should we also check for at least one MemberAdder and one MemberRemover?
// I guess this is where it starts getting ugly having 3 separate permissions instead of just
// granter/revoker. (of course a single PermissionsManager would be even cleaner, but as mentioned above
// less flexible. And since we plan on offering this as a library, flexibility is important.)
// One other option is to not expose add_member/remove_member functions at all, and leave the implementation
// and gating of those functions to the user of the library.

// TODO3: Should we keep the assertions in the functions, or leave the responsibility to the developer using
// this library? I believe it would be ok, if we manage to implement the typed_witness Auth<Permission> token
// pattern. But, until then, I believe we should handle the assertions in this library.

// TODO4: Would it make sense to make those generic <phantom T> ?
/// Witness type representing the permission to grant or revoke permissions.
public struct PermissionsManager() has drop;
public struct MemberAdder() has drop;
public struct MemberRemover() has drop;

// TODO5: rename to PermissionsGroup OR GroupPermissionsState
// TODO6: does this need to be <phantom T> ?
public struct AuthState has store {
    permissions: Table<address, VecSet<TypeName>>,
    permissions_managers_count: u64,
}

public fun new(ctx: &mut TxContext): AuthState {
    let mut creator_permissions_set = vec_set::empty<TypeName>();
    creator_permissions_set.insert(type_name::with_defining_ids<PermissionsManager>());
    creator_permissions_set.insert(type_name::with_defining_ids<MemberAdder>());
    creator_permissions_set.insert(type_name::with_defining_ids<MemberRemover>());

    let mut permissions_table = table::new<address, VecSet<TypeName>>(ctx);
    permissions_table.add(ctx.sender(), creator_permissions_set);

    AuthState {
        permissions: permissions_table,
        permissions_managers_count: 1,
    }
}

public fun add_member<InitialPermission: drop>(
    self: &mut AuthState,
    new_member: address,
    ctx: &TxContext,
) {
    // assert caller has MemberAdder permission
    assert!(self.has_permission<MemberAdder>(ctx.sender()), ENotPermitted);

    // assert new_member is not already present
    assert!(!self.is_member(new_member), EMemberNotFound);

    let mut new_member_permissions_set = vec_set::empty<TypeName>();
    new_member_permissions_set.insert(type_name::with_defining_ids<InitialPermission>());

    self.permissions.add(new_member, new_member_permissions_set);
}

public fun remove_member(self: &mut AuthState, member: address, ctx: &TxContext) {
    // assert caller has MemberRemover permission
    assert!(self.has_permission<MemberRemover>(ctx.sender()), ENotPermitted);

    // assert member's permissions entry exists
    assert!(self.is_member(member), EMemberNotFound);

    let member_permissions_set = self.permissions.borrow(member);

    // assert if member has PermissionsManager permission, there is at least one remaining after
    // removal
    if (member_permissions_set.contains(&type_name::with_defining_ids<PermissionsManager>())) {
        assert!(self.permissions_managers_count > 1, ELastPermissionsManager);
        self.permissions_managers_count = self.permissions_managers_count - 1;
    };
    self.permissions.remove(member);
}

public fun grant_permission<NewPermission: drop>(
    self: &mut AuthState,
    member: address,
    ctx: &TxContext,
) {
    // assert caller has PermissionsManager permission
    assert!(self.has_permission<PermissionsManager>(ctx.sender()), ENotPermitted);

    // assert member's permissions entry exists
    assert!(self.is_member(member), EMemberNotFound);

    let member_permissions_set = self.permissions.borrow_mut(member);
    member_permissions_set.insert(type_name::with_defining_ids<NewPermission>());

    // if NewPermission is PermissionsManager, increment count
    if (
        type_name::with_defining_ids<NewPermission>() == type_name::with_defining_ids<PermissionsManager>()
    ) {
        self.permissions_managers_count = self.permissions_managers_count + 1;
    };
}

public fun revoke_permission<ExistingPermission: drop>(
    self: &mut AuthState,
    member: address,
    ctx: &TxContext,
) {
    // assert caller has PermissionsManager permission
    assert!(self.has_permission<PermissionsManager>(ctx.sender()), ENotPermitted);

    // assert member's permissions entry exists
    assert!(self.permissions.contains(member), EMemberNotFound);

    // assert after revocation, there is at least one PermissionsManager remaining
    if (
        type_name::with_defining_ids<ExistingPermission>() == type_name::with_defining_ids<PermissionsManager>()
    ) {
        assert!(self.permissions_managers_count > 1, ELastPermissionsManager);
        self.permissions_managers_count = self.permissions_managers_count - 1;
    };

    let member_permissions_set = self.permissions.borrow_mut(member);
    member_permissions_set.remove(&type_name::with_defining_ids<ExistingPermission>());

    // If the member has no more permissions, remove their entry from the table
    if (member_permissions_set.is_empty()) {
        self.permissions.remove(member);
    };
}

/// Should we allow a member to leave on their own accord?
///
/// I would argue yes. Not sure if we want to issue some sort
/// of LeftTicket?
/// Let's see if we go with a MemberCap approach later on,
/// in which case we would want the user that leaves, to be able
/// to burn their MemberCap for the rebate.
public fun leave(self: &mut AuthState, ctx: &TxContext) {
    let member = ctx.sender();

    // assert member's permissions entry exists
    assert!(self.is_member(member), EMemberNotFound);

    let member_permissions_set = self.permissions.borrow(member);

    // assert if member has PermissionsManager permission, there is at least one remaining after
    // removal
    if (member_permissions_set.contains(&type_name::with_defining_ids<PermissionsManager>())) {
        assert!(self.permissions_managers_count > 1, ELastPermissionsManager);
        self.permissions_managers_count = self.permissions_managers_count - 1;
    };
    self.permissions.remove(member);
}

public fun has_permission<Permission: drop>(self: &AuthState, member: address): bool {
    self.permissions.borrow(member).contains(&type_name::with_defining_ids<Permission>())
}

public fun is_member(self: &AuthState, member: address): bool {
    self.permissions.contains(member)
}
