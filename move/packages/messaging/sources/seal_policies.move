/// Module: seal_policies
///
/// Default `seal_approve` functions for Seal encryption access control.
/// Called by Seal key servers (via dry-run) to authorize decryption.
///
/// ## Identity Bytes Format
///
/// Identity bytes: `[group_id (32 bytes)][key_version (8 bytes LE u64)]`
/// Total: 40 bytes
///
/// - `group_id`: The PermissionedGroup<Messaging> object ID
/// - `key_version`: The encryption key version (supports key rotation)
///
/// ## Custom Policies
///
/// Apps can implement custom `seal_approve` with different logic:
/// - Subscription-based, time-limited, NFT-gated access, etc.
/// - Must be in the same package used during `seal.encrypt`.
///
module messaging::seal_policies;

use permissioned_groups::permissioned_group::PermissionedGroup;
use messaging::messaging::{MessagingReader, Messaging};
use messaging::encryption_history::EncryptionHistory;
use sui::bcs;

// === Error Codes ===

const EInvalidIdentity: u64 = 0;
const ENotPermitted: u64 = 1;
const EInvalidKeyVersion: u64 = 2;
const EEncryptionHistoryMismatch: u64 = 3;

// === Constants ===

/// Expected identity bytes length: 32 (group_id) + 8 (key_version) = 40 bytes
const IDENTITY_BYTES_LENGTH: u64 = 40;

// === Private Functions ===

/// Validates identity bytes format and extracts components.
///
/// Expected format: `[group_id (32 bytes)][key_version (8 bytes LE u64)]`
///
/// # Parameters
/// - `group`: Reference to the PermissionedGroup<Messaging>
/// - `encryption_history`: Reference to the EncryptionHistory
/// - `id`: The Seal identity bytes to validate
///
/// # Aborts
/// - `EInvalidIdentity`: if length != 40 or group_id doesn't match
/// - `EInvalidKeyVersion`: if key_version > current_key_version
fun validate_identity(
    group: &PermissionedGroup<Messaging>,
    encryption_history: &EncryptionHistory,
    id: vector<u8>,
) {
    // Must be exactly 40 bytes: 32 (group_id) + 8 (key_version)
    assert!(id.length() == IDENTITY_BYTES_LENGTH, EInvalidIdentity);

    // Use BCS to parse the identity bytes
    let mut bcs_bytes = bcs::new(id);

    // Parse group_id (32 bytes as address)
    let parsed_group_id = bcs_bytes.peel_address();

    // Verify group_id matches
    assert!(object::id_to_address(&object::id(group)) == parsed_group_id, EInvalidIdentity);

    // Parse key_version (u64, little-endian)
    let key_version = bcs_bytes.peel_u64();

    // Key version must exist (be <= current version)
    assert!(key_version <= encryption_history.current_key_version(), EInvalidKeyVersion);
}

// === Entry Functions ===

/// Default seal_approve that checks `MessagingReader` permission.
///
/// # Parameters
/// - `id`: Seal identity bytes `[group_id (32 bytes)][key_version (8 bytes LE u64)]`
/// - `group`: Reference to the PermissionedGroup<Messaging>
/// - `encryption_history`: Reference to the EncryptionHistory
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `EEncryptionHistoryMismatch`: if encryption_history doesn't belong to this group
/// - `EInvalidIdentity`: if identity bytes are malformed or group_id doesn't match
/// - `EInvalidKeyVersion`: if key_version doesn't exist
/// - `ENotPermitted`: if caller doesn't have `MessagingReader` permission
entry fun seal_approve_reader(
    id: vector<u8>,
    group: &PermissionedGroup<Messaging>,
    encryption_history: &EncryptionHistory,
    ctx: &TxContext,
) {
    // Verify encryption_history belongs to this group
    assert!(encryption_history.group_id() == object::id(group), EEncryptionHistoryMismatch);

    validate_identity(group, encryption_history, id);
    assert!(group.has_permission<Messaging, MessagingReader>(ctx.sender()), ENotPermitted);
}
