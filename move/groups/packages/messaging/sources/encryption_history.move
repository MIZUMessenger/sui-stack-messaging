/// Module: encryption_history
///
/// This module provides envelope encryption key management for MessagingGroup.
/// It stores encrypted DEKs (Data Encryption Keys) that have been encrypted with Seal,
/// supporting key rotation for security purposes.
///
/// ## Design
///
/// - EncryptionHistory is attached to MessagingGroup via dynamic field
/// - Stores full EncryptedObject bytes from Seal (which contain the id/namespace)
/// - Supports key rotation with version tracking
///
/// ## Usage
///
/// Use `messaging::new_with_encryption` to create a MessagingGroup with encryption enabled.
/// Use `messaging::rotate_encryption_key` to rotate keys.
///
module messaging::encryption_history;

use groups::permissions_group::{Self, PermissionsGroup};
use messaging::messaging::{
    Messaging,
    MessagingNamespace,
    MessagingSender,
    MessagingReader,
    MessagingEditor,
    MessagingDeleter
};
use sui::derived_object;
use sui::table_vec::{Self, TableVec};

// === Error Codes ===

const EEncryptionHistoryAlreadyExists: u64 = 0;
const EKeyVersionNotFound: u64 = 1;
const ENotPermitted: u64 = 2;

// === Derivation Keys ===

/// derived from MessagingNamespace + EncryptionHistoryTag(u64)
public struct EncryptionHistoryTag(u64) has copy, drop, store;
/// derived from MessagingNamespace PermissionsGroupTag(u64)
public struct PermissionsGroupTag(u64) has copy, drop, store;

// === Permission Witnesses ===

/// Permission to rotate encryption keys.
/// Should be granted to PermissionsGroup<Messaging> creator during creation.
public struct EncryptionKeyRotator() has drop;

// === Structs ===

/// Stores encryption key history for a PermissionsGroup<MessagingApp>.
/// Derived from the MessagingNamespace + PermissionsGroup<MessagingApp> ID.
/// There should be 1 PermissionsGroup<MessagingApp> <-> 1 EncryptionHistory pair.
public struct EncryptionHistory has key, store {
    id: UID,
    /// The ID of the associated PermissionsGroup<MessagingApp>
    group_id: ID,
    group_index: u64,
    /// Sequential storage of encrypted DEKs. Index = key version.
    /// Each entry is full EncryptedObject bytes from Seal
    /// (contains: version, packageId, id, services, threshold, encryptedShares, ciphertext)
    encrypted_keys: TableVec<vector<u8>>,
}

// === Public Functions ===
public fun new_group(
    namespace: &mut MessagingNamespace,
    initial_encrypted_dek: vector<u8>,
    ctx: &mut TxContext,
): (PermissionsGroup<Messaging>, EncryptionHistory) {
    // 1. Create new PermissionsGroup<Messaging>
    let groups_created_incremented = namespace.increment_groups_created();
    let mut group: PermissionsGroup<Messaging> = permissions_group::new_derived<
        Messaging,
        PermissionsGroupTag,
    >(
        namespace.uid_mut(),
        PermissionsGroupTag(groups_created_incremented),
        ctx,
    );

    // 2. Grant Messaging & Encryption permissions to the creator
    let creator = ctx.sender();
    group.grant_permission<Messaging, MessagingSender>(creator, ctx);
    group.grant_permission<Messaging, MessagingReader>(creator, ctx);
    group.grant_permission<Messaging, MessagingEditor>(creator, ctx);
    group.grant_permission<Messaging, MessagingDeleter>(creator, ctx);
    group.grant_permission<Messaging, EncryptionKeyRotator>(creator, ctx);

    // 3. Create new EncryptionHistory for the group
    let encryption_history = new(
        namespace,
        object::id(&group),
        initial_encrypted_dek,
        ctx,
    );
    (group, encryption_history)
}
// === Package Functions ===

/// Rotates to a new encryption key.
/// Appends the new encrypted DEK (version = length - 1 after push).
///
/// # Parameters
/// - `self`: Mutable reference to the EncryptionHistory
/// - `new_encrypted_dek`: The new encrypted DEK bytes (full EncryptedObject from Seal)
public fun rotate_key(
    self: &mut EncryptionHistory,
    group: &PermissionsGroup<Messaging>,
    new_encrypted_dek: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(group.has_permission<Messaging, EncryptionKeyRotator>(ctx.sender()), ENotPermitted);
    self.encrypted_keys.push_back(new_encrypted_dek);
}

// === getters ===

/// Returns the associated PermissionsGroup ID.
public fun group_id(self: &EncryptionHistory): ID {
    self.group_id
}

/// Returns the current key version (0-indexed).
///
/// # Returns
/// The current (latest) key version.
public fun current_key_version(self: &EncryptionHistory): u64 {
    self.encrypted_keys.length() - 1
}

/// Returns the encrypted DEK for a specific version.
///
/// # Parameters
/// - `self`: Reference to the EncryptionHistory
/// - `version`: The key version to retrieve (0-indexed)
///
/// # Returns
/// The encrypted DEK bytes for the specified version.
///
/// # Aborts
/// - If the key version doesn't exist.
public fun encrypted_key(self: &EncryptionHistory, version: u64): &vector<u8> {
    assert!(version < self.encrypted_keys.length(), EKeyVersionNotFound);
    self.encrypted_keys.borrow(version)
}

/// Returns the encrypted DEK for the current (latest) version.
///
/// # Returns
/// The encrypted DEK bytes for the current version.
public fun current_encrypted_key(self: &EncryptionHistory): &vector<u8> {
    self.encrypted_key(self.current_key_version())
}

/// Creates a new EncryptionHistory given an existing PermissionsGroup<Messaging> ID,
/// and initial ecnrypted DEK bytes.
fun new(
    namespace: &mut MessagingNamespace,
    group_id: ID,
    initial_encrypted_dek: vector<u8>,
    ctx: &mut TxContext,
): EncryptionHistory {
    assert!(
        !namespace.exists(EncryptionHistoryTag(namespace.groups_created())),
        EEncryptionHistoryAlreadyExists,
    );
    let mut encrypted_keys = table_vec::empty<vector<u8>>(ctx);
    encrypted_keys.push_back(initial_encrypted_dek);

    let current_groups_created = namespace.groups_created();

    EncryptionHistory {
        id: derived_object::claim(
            namespace.uid_mut(),
            EncryptionHistoryTag(current_groups_created),
        ),
        group_index: namespace.groups_created() - 1, // keep it 0-based
        group_id,
        encrypted_keys,
    }
}
