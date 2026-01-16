/// Module: seal_policies
///
/// Default `seal_approve` functions for Seal encryption access control.
/// Called by Seal key servers (via dry-run) to authorize decryption.
///
/// ## Namespace Format
///
/// Identity bytes: `[creator_address (32 bytes)][nonce]`
/// Uses the group creator's address as namespace prefix for per-group encryption.
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

// === Error Codes ===

const EInvalidNamespace: u64 = 0;
const ENotPermitted: u64 = 1;

// === Private Functions ===

/// Validates that `id` has the correct Seal namespace prefix.
///
/// Expected format: `[creator_address (32 bytes)][nonce]`
///
/// # Parameters
/// - `group`: Reference to the PermissionedGroup<Messaging>
/// - `id`: The Seal identity bytes to validate
///
/// # Returns
/// `true` if the namespace prefix matches, `false` otherwise.
fun check_namespace(group: &PermissionedGroup<Messaging>, id: &vector<u8>): bool {
    let namespace = group.creator<Messaging>().to_bytes();
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
/// - `id`: Seal identity bytes `[creator_address (32 bytes)][nonce]`
/// - `group`: Reference to the PermissionedGroup<Messaging>
/// - `ctx`: Transaction context
///
/// # Aborts
/// - `EInvalidNamespace`: if `id` doesn't have correct creator address prefix
/// - `ENotPermitted`: if caller doesn't have `MessagingReader` permission
entry fun seal_approve_reader(
    id: vector<u8>,
    group: &PermissionedGroup<Messaging>,
    ctx: &TxContext,
) {
    assert!(check_namespace(group, &id), EInvalidNamespace);
    assert!(group.has_permission<Messaging, MessagingReader>(ctx.sender()), ENotPermitted);
}
