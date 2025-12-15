module messaging::auth;

use public_package::auth_state::AuthState;

const ENotAuthorized: u64 = 0;

public struct Auth<phantom Permission: drop>() has drop;

public(package) fun authenticate<Permission: drop>(
    auth_state: &AuthState,
    ctx: &TxContext,
): Auth<Permission> {
    assert!(auth_state.has_permission<Permission>(ctx.sender()), ENotAuthorized);
    Auth()
}
