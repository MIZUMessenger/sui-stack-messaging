/// Module: seal_policies
///
/// This module provides default `seal_approve` functions for Seal encryption access control.
/// These functions are called by Seal key servers (via dry-run) to determine if a user
/// should be able to decrypt encrypted content.
///
/// ## Namespace
///
/// The default implementation uses the `creator` address as the namespace prefix.
/// This enables single-PTB group creation since the creator address is known before
/// the transaction executes.
///
/// Identity bytes format: [creator_address (32 bytes)][nonce (variable)]
///
/// ## Custom Implementations
///
/// Third-party apps can implement their own `seal_approve` functions with custom logic:
/// - Subscription-based access
/// - Time-limited access
/// - NFT-gated access
/// - etc.
///
/// The custom `seal_approve` must be in the same package that was used during `seal.encrypt`.
///
module messaging::seal_policies;

use groups::permissions_group::{Self, PermissionsGroup};
use messaging::messaging::{MessagingReader, MessagingApp};

// === Error Codes ===

const EInvalidNamespace: u64 = 0;
const ENotPermitted: u64 = 1;

// === Helper Functions ===

/// Validates that the id has the correct namespace prefix (creator address).
///
/// The creator address is used as the namespace to enable single-PTB group creation.
///
/// # Parameters
/// - `group`: Reference to the MessagingGroup
/// - `id`: The Seal identity bytes to validate
///
/// # Returns
/// `true` if the namespace prefix matches, `false` otherwise.
fun check_namespace(group: &MessagingGroup, id: &vector<u8>): bool {
    let namespace = group.creator().to_bytes();
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

// === Seal Approve Functions ===

/// Default seal_approve that checks `MessagingReader` permission.
///
/// Use this for granular "only readers can decrypt" access control.
/// This allows for temporary read bans while keeping membership.
///
/// # Parameters
/// - `id`: The Seal identity bytes (should be `[creator_address][nonce]`)
/// - `group`: Reference to the MessagingGroup
/// - `ctx`: Transaction context
///
/// # Aborts
/// - If `id` doesn't have correct namespace prefix (creator address).
/// - If caller doesn't have `MessagingReader` permission.
entry fun seal_approve_reader(
    id: vector<u8>,
    group: &PermissionsGroup<MessagingApp>,
    ctx: &TxContext,
) {
    assert!(check_namespace(group, &id), EInvalidNamespace);
    assert!(group.has_permission<MessagingApp, MessagingReader>(ctx.sender()), ENotPermitted);
}
