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
/// Base (from groups, auto-granted to creator):
/// - `PermissionsManager`: Grant/revoke permissions
/// - `MemberAdder`: Add members (no permissions)
/// - `MemberRemover`: Remove members
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
/// - `add_member` adds to roster only, no permissions granted
/// - `PermissionsManager` required to grant permissions
/// - Prevents privilege escalation from `MemberAdder`
///
module messaging::messaging;

use groups::permissions_group::{Self, PermissionsGroup};
use messaging::encryption_history::{Self, EncryptionHistory, EncryptionKeyRotator};

// === Error Codes ===

const ENotPermitted: u64 = 0;

// === Witnesses ===

/// Package witness for `PermissionsGroup<Messaging>`.
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
/// Grants all messaging permissions to the creator.
///
/// # Parameters
/// - `namespace`: Mutable reference to the MessagingNamespace
/// - `initial_encrypted_dek`: Initial Seal-encrypted DEK bytes
/// - `ctx`: Transaction context
///
/// # Returns
/// Tuple of `(PermissionsGroup<Messaging>, EncryptionHistory)`.
public fun create_group(
    namespace: &mut MessagingNamespace,
    initial_encrypted_dek: vector<u8>,
    ctx: &mut TxContext,
): (PermissionsGroup<Messaging>, EncryptionHistory) {
    let groups_created = namespace.increment_groups_created();
    let mut group: PermissionsGroup<Messaging> = permissions_group::new_derived<
        Messaging,
        encryption_history::PermissionsGroupTag,
    >(
        &mut namespace.id,
        encryption_history::permissions_group_tag(groups_created),
        ctx,
    );

    let creator = ctx.sender();
    grant_all_messaging_permissions(&mut group, creator, ctx);

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
/// - `ctx`: Transaction context
#[allow(lint(share_owned))]
public fun create_and_share_group(
    namespace: &mut MessagingNamespace,
    initial_encrypted_dek: vector<u8>,
    ctx: &mut TxContext,
) {
    let (group, encryption_history) = create_group(
        namespace,
        initial_encrypted_dek,
        ctx,
    );
    transfer::public_share_object(group);
    transfer::public_share_object(encryption_history);
}

/// Rotates the encryption key for a group.
///
/// # Parameters
/// - `encryption_history`: Mutable reference to the group's EncryptionHistory
/// - `group`: Reference to the PermissionsGroup<Messaging>
/// - `new_encrypted_dek`: New Seal-encrypted DEK bytes
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `ENotPermitted`: if caller doesn't have `EncryptionKeyRotator` permission
public fun rotate_encryption_key(
    encryption_history: &mut EncryptionHistory,
    group: &PermissionsGroup<Messaging>,
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
/// - `group`: Mutable reference to the PermissionsGroup<Messaging>
/// - `member`: Address to grant permissions to
/// - `ctx`: Transaction context
public fun grant_all_messaging_permissions(
    group: &mut PermissionsGroup<Messaging>,
    member: address,
    ctx: &mut TxContext,
) {
    group.grant_permission<Messaging, MessagingSender>(member, ctx);
    group.grant_permission<Messaging, MessagingReader>(member, ctx);
    group.grant_permission<Messaging, MessagingEditor>(member, ctx);
    group.grant_permission<Messaging, MessagingDeleter>(member, ctx);
    group.grant_permission<Messaging, EncryptionKeyRotator>(member, ctx);
}

/// Grants all permissions (base + messaging) to a member, making them an admin.
///
/// # Parameters
/// - `group`: Mutable reference to the PermissionsGroup<Messaging>
/// - `member`: Address to grant permissions to
/// - `ctx`: Transaction context
public fun grant_all_permissions(
    group: &mut PermissionsGroup<Messaging>,
    member: address,
    ctx: &mut TxContext,
) {
    permissions_group::grant_all_permissions<Messaging>(group, member, ctx);
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
