/// Module: encryption_history
///
/// Internal module for envelope encryption key management.
/// Stores encrypted DEKs (Data Encryption Keys) with version tracking for key rotation.
///
/// `EncryptionHistory` is a derived object from `MessagingNamespace`, enabling
/// deterministic address derivation for Seal encryption namespacing.
///
/// All public entry points are in the `messaging` module:
/// - `messaging::create_group` - creates group with encryption
/// - `messaging::rotate_encryption_key` - rotates keys
///
module messaging::encryption_history;

use sui::derived_object;
use sui::table_vec::{Self, TableVec};

// === Error Codes ===

const EEncryptionHistoryAlreadyExists: u64 = 0;
const EKeyVersionNotFound: u64 = 1;

// === Derivation Keys ===

/// Key for deriving `EncryptionHistory` address from `MessagingNamespace`.
public struct EncryptionHistoryTag(u64) has copy, drop, store;

/// Key for deriving `PermissionsGroup<Messaging>` address from `MessagingNamespace`.
public struct PermissionsGroupTag(u64) has copy, drop, store;

// === Permission Witnesses ===

/// Permission to rotate encryption keys. Auto-granted to group creator.
public struct EncryptionKeyRotator() has drop;

// === Structs ===

/// Encrypted key history for a messaging group.
/// Derived object from `MessagingNamespace` with 1:1 relationship to `PermissionsGroup<Messaging>`.
public struct EncryptionHistory has key, store {
    id: UID,
    /// Associated `PermissionsGroup<Messaging>` ID.
    group_id: ID,
    /// 0-based index of this group within the namespace.
    group_index: u64,
    /// Versioned encrypted DEKs. Index = version number.
    /// Each entry is Seal `EncryptedObject` bytes.
    encrypted_keys: TableVec<vector<u8>>,
}

// === Package Functions ===

/// Creates a new `EncryptionHistory` derived from the namespace.
/// Uses `EncryptionHistoryTag(groups_created)` as the derivation key.
///
/// # Parameters
/// - `namespace_uid`: Mutable reference to the MessagingNamespace UID
/// - `groups_created`: Current groups_created counter value (used as derivation key)
/// - `group_id`: ID of the associated PermissionsGroup<Messaging>
/// - `initial_encrypted_dek`: Initial Seal-encrypted DEK bytes
/// - `ctx`: Transaction context
///
/// # Returns
/// A new `EncryptionHistory` object.
///
/// # Aborts
/// - `EEncryptionHistoryAlreadyExists`: if derived address is already claimed
public(package) fun new(
    namespace_uid: &mut UID,
    groups_created: u64,
    group_id: ID,
    initial_encrypted_dek: vector<u8>,
    ctx: &mut TxContext,
): EncryptionHistory {
    assert!(
        !derived_object::exists(namespace_uid, EncryptionHistoryTag(groups_created)),
        EEncryptionHistoryAlreadyExists,
    );
    let mut encrypted_keys = table_vec::empty<vector<u8>>(ctx);
    encrypted_keys.push_back(initial_encrypted_dek);

    EncryptionHistory {
        id: derived_object::claim(
            namespace_uid,
            EncryptionHistoryTag(groups_created),
        ),
        group_index: groups_created - 1, // keep it 0-based
        group_id,
        encrypted_keys,
    }
}

/// Appends a new encrypted DEK. Caller must verify permissions.
///
/// # Parameters
/// - `self`: Mutable reference to the EncryptionHistory
/// - `new_encrypted_dek`: New Seal-encrypted DEK bytes
public(package) fun rotate_key(
    self: &mut EncryptionHistory,
    new_encrypted_dek: vector<u8>,
) {
    self.encrypted_keys.push_back(new_encrypted_dek);
}

/// Returns the `PermissionsGroupTag` for address derivation.
///
/// # Parameters
/// - `index`: The group index (groups_created counter value)
///
/// # Returns
/// A `PermissionsGroupTag` wrapping the index.
public(package) fun permissions_group_tag(index: u64): PermissionsGroupTag {
    PermissionsGroupTag(index)
}

// === Getters ===

/// Returns the associated `PermissionsGroup<Messaging>` ID.
///
/// # Parameters
/// - `self`: Reference to the EncryptionHistory
///
/// # Returns
/// The group ID.
public fun group_id(self: &EncryptionHistory): ID {
    self.group_id
}

/// Returns the current key version (0-indexed).
///
/// # Parameters
/// - `self`: Reference to the EncryptionHistory
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
/// Reference to the encrypted DEK bytes.
///
/// # Aborts
/// - `EKeyVersionNotFound`: if the version doesn't exist
public fun encrypted_key(self: &EncryptionHistory, version: u64): &vector<u8> {
    assert!(version < self.encrypted_keys.length(), EKeyVersionNotFound);
    self.encrypted_keys.borrow(version)
}

/// Returns the encrypted DEK for the current (latest) version.
///
/// # Parameters
/// - `self`: Reference to the EncryptionHistory
///
/// # Returns
/// Reference to the current encrypted DEK bytes.
public fun current_encrypted_key(self: &EncryptionHistory): &vector<u8> {
    self.encrypted_key(self.current_key_version())
}
