/// Module: seal_policies
///
/// Default `seal_approve` functions for Seal encryption access control.
/// Called by Seal key servers (via dry-run) to authorize decryption.
///
/// ## Namespace Format
///
/// Identity bytes: `[PermissionsGroup<Messaging> ID][nonce]`
/// Uses the group's derived ID as namespace prefix for per-group encryption.
///
/// ## Custom Policies
///
/// Apps can implement custom `seal_approve` with different logic:
/// - Subscription-based, time-limited, NFT-gated access, etc.
/// - Must be in the same package used during `seal.encrypt`.
///
module messaging::seal_policies;

use groups::permissions_group::PermissionsGroup;
use messaging::encryption_history::EncryptionHistory;
use messaging::messaging::{MessagingReader, Messaging};

// === Error Codes ===

const EInvalidNamespace: u64 = 0;
const ENotPermitted: u64 = 1;

// === Private Functions ===

/// Validates that `id` has the correct Seal namespace prefix.
///
/// The namespace is the `PermissionsGroup<Messaging>` ID bytes, which is a derived
/// address from `MessagingNamespace + PermissionsGroupTag(groups_created)`.
///
/// Expected format: `[group_id bytes (32)][nonce (12)]`
///
/// # Parameters
/// - `encryption_history`: Reference to the EncryptionHistory (contains group_id)
/// - `id`: The Seal identity bytes to validate
///
/// # Returns
/// `true` if the namespace prefix matches, `false` otherwise.
fun check_namespace(encryption_history: &EncryptionHistory, id: &vector<u8>): bool {
    let namespace = encryption_history.group_id().to_bytes();
    let namespace_len = namespace.length();

    if (namespace_len > id.length()) {
        return false
    };

    let mut i = 0;
    while (i < namespace_len) {
        if (namespace[i] != id[i]) {
            return false
        };
        i = i + 1;
    };
    true
}

// === Entry Functions ===

/// Default seal_approve that checks `MessagingReader` permission.
///
/// # Parameters
/// - `id`: Seal identity bytes `[group_id (32)][nonce (12)]`
/// - `encryption_history`: Reference to the group's EncryptionHistory
/// - `group`: Reference to the PermissionsGroup<Messaging>
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `EInvalidNamespace`: if `id` doesn't have correct group_id prefix
/// - `ENotPermitted`: if caller doesn't have `MessagingReader` permission
entry fun seal_approve_reader(
    id: vector<u8>,
    encryption_history: &EncryptionHistory,
    group: &PermissionsGroup<Messaging>,
    ctx: &TxContext,
) {
    assert!(check_namespace(encryption_history, &id), EInvalidNamespace);
    assert!(group.has_permission<Messaging, MessagingReader>(ctx.sender()), ENotPermitted);
}
