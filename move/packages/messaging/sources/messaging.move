/// Module: messaging
///
/// Public-facing module for the messaging package. All external interactions
/// should go through this module.
///
/// Wraps `permissions_group` to provide messaging-specific permission management
/// and `encryption_history` for key rotation.
///
/// ## Permissions
///
/// From groups (auto-granted to creator):
/// - `Administrator`: Super-admin role that can grant/revoke all permissions
/// - `ExtensionPermissionsManager`: Can grant/revoke extension permissions
///
/// Messaging-specific:
/// - `MessagingSender`: Send messages
/// - `MessagingReader`: Read/decrypt messages
/// - `MessagingEditor`: Edit messages
/// - `MessagingDeleter`: Delete messages
/// - `EncryptionKeyRotator`: Rotate encryption keys
///
/// ## Security
///
/// - Membership is defined by having at least one permission
/// - Granting a permission implicitly adds the member if they don't exist
/// - Revoking the last permission automatically removes the member
///
module messaging::messaging;

use permissioned_groups::permissioned_group::{Self, PermissionedGroup, Administrator, ExtensionPermissionsManager};
use messaging::encryption_history::{Self, EncryptionHistory, EncryptionKeyRotator};
use sui::vec_set::VecSet;

// === Error Codes ===

const ENotPermitted: u64 = 0;

// === Witnesses ===

/// Package witness for `PermissionedGroup<Messaging>`.
public struct Messaging() has drop;

// === Permission Witnesses ===

/// Permission to send messages to the group.
/// Separate from `MessagingReader` to enable mute functionality.
public struct MessagingSender() has drop;

/// Permission to read/decrypt messages from the group.
/// Separate from `MessagingSender` to enable read-only or write-only access.
public struct MessagingReader() has drop;

/// Permission to delete messages in the group.
public struct MessagingDeleter() has drop;

/// Permission to edit messages in the group.
public struct MessagingEditor() has drop;

// === Structs ===

/// Shared object used as namespace for deriving group and encryption history addresses.
/// One per package deployment.
public struct MessagingNamespace has key {
    id: UID,
    /// Counter for deterministic address derivation.
    groups_created: u64,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(MessagingNamespace {
        id: object::new(ctx),
        groups_created: 0,
    });
}

// === Public Functions ===

/// Creates a new messaging group with encryption.
/// The transaction sender (`ctx.sender()`) automatically becomes the creator with all permissions.
///
/// # Parameters
/// - `namespace`: Mutable reference to the MessagingNamespace
/// - `initial_encrypted_dek`: Initial Seal-encrypted DEK bytes
/// - `initial_members`: Addresses to grant `MessagingReader` permission (should not include
/// creator)
/// - `ctx`: Transaction context
///
/// # Returns
/// Tuple of `(PermissionedGroup<Messaging>, EncryptionHistory)`.
///
/// # Note
/// If `initial_members` contains the creator's address, it is silently skipped (no abort).
/// This handles the common case where the creator might be mistakenly included in the initial
/// members list.
public fun create_group(
    namespace: &mut MessagingNamespace,
    initial_encrypted_dek: vector<u8>,
    initial_members: VecSet<address>,
    ctx: &mut TxContext,
): (PermissionedGroup<Messaging>, EncryptionHistory) {
    let groups_created = namespace.increment_groups_created();
    let mut group: PermissionedGroup<Messaging> = permissioned_group::new_derived<
        Messaging,
        encryption_history::PermissionedGroupTag,
    >(
        &mut namespace.id,
        encryption_history::permissions_group_tag(groups_created),
        ctx,
    );

    let creator = ctx.sender();
    grant_all_messaging_permissions(&mut group, creator, ctx);

    // Grant MessagingReader permission to initial members (skip creator)
    initial_members.into_keys().do!(|member| {
        if (member != creator) {
            group.grant_permission<Messaging, MessagingReader>(member, ctx);
        };
    });

    let encryption_history = encryption_history::new(
        &mut namespace.id,
        groups_created,
        object::id(&group),
        initial_encrypted_dek,
        ctx,
    );

    (group, encryption_history)
}

/// Creates a new messaging group and shares both objects.
///
/// # Parameters
/// - `namespace`: Mutable reference to the MessagingNamespace
/// - `initial_encrypted_dek`: Initial Seal-encrypted DEK bytes
/// - `initial_members`: Set of addresses to grant `MessagingReader` permission
/// - `ctx`: Transaction context
///
/// # Note
/// See `create_group` for details on creator permissions and initial member handling.
#[allow(lint(share_owned))]
public fun create_and_share_group(
    namespace: &mut MessagingNamespace,
    initial_encrypted_dek: vector<u8>,
    initial_members: VecSet<address>,
    ctx: &mut TxContext,
) {
    let (group, encryption_history) = create_group(
        namespace,
        initial_encrypted_dek,
        initial_members,
        ctx,
    );
    transfer::public_share_object(group);
    transfer::public_share_object(encryption_history);
}

/// Rotates the encryption key for a group.
///
/// # Parameters
/// - `encryption_history`: Mutable reference to the group's EncryptionHistory
/// - `group`: Reference to the PermissionedGroup<Messaging>
/// - `new_encrypted_dek`: New Seal-encrypted DEK bytes
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `ENotPermitted`: if caller doesn't have `EncryptionKeyRotator` permission
public fun rotate_encryption_key(
    encryption_history: &mut EncryptionHistory,
    group: &PermissionedGroup<Messaging>,
    new_encrypted_dek: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(group.has_permission<Messaging, EncryptionKeyRotator>(ctx.sender()), ENotPermitted);
    encryption_history.rotate_key(new_encrypted_dek);
}

/// Grants all messaging permissions to a member.
/// Includes: `MessagingSender`, `MessagingReader`, `MessagingEditor`,
/// `MessagingDeleter`, `EncryptionKeyRotator`.
///
/// # Parameters
/// - `group`: Mutable reference to the PermissionedGroup<Messaging>
/// - `member`: Address to grant permissions to
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `ENotPermitted` (from `permissions_group`): if caller doesn't have `CorePermissionsManager`
/// or `ExtensionPermissionsManager` permission
public fun grant_all_messaging_permissions(
    group: &mut PermissionedGroup<Messaging>,
    member: address,
    ctx: &mut TxContext,
) {
    group.grant_permission<Messaging, MessagingSender>(member, ctx);
    group.grant_permission<Messaging, MessagingReader>(member, ctx);
    group.grant_permission<Messaging, MessagingEditor>(member, ctx);
    group.grant_permission<Messaging, MessagingDeleter>(member, ctx);
    group.grant_permission<Messaging, EncryptionKeyRotator>(member, ctx);
}

/// Grants all permissions (Administrator, ExtensionPermissionsManager + messaging) to a member,
/// making them an admin.
///
/// # Parameters
/// - `group`: Mutable reference to the PermissionedGroup<Messaging>
/// - `member`: Address to grant permissions to
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `ENotPermitted` (from `permissions_group`): if caller doesn't have `Administrator` permission
public fun grant_all_permissions(
    group: &mut PermissionedGroup<Messaging>,
    member: address,
    ctx: &mut TxContext,
) {
    group.grant_permission<Messaging, Administrator>(member, ctx);
    group.grant_permission<Messaging, ExtensionPermissionsManager>(member, ctx);
    grant_all_messaging_permissions(group, member, ctx);
}

// === Getters ===

/// Returns the number of groups created via this namespace.
///
/// # Parameters
/// - `namespace`: Reference to the MessagingNamespace
///
/// # Returns
/// The total count of groups created.
public fun groups_created(namespace: &MessagingNamespace): u64 {
    namespace.groups_created
}

// === Private Functions ===

/// Increments and returns the groups_created counter.
fun increment_groups_created(self: &mut MessagingNamespace): u64 {
    let current = self.groups_created;
    self.groups_created = current + 1;
    self.groups_created
}

// === Test Helpers ===

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}
