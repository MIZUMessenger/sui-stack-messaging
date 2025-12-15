// On-chain methods:
//
// - add_member
// - remove_member
// - grant_permission
// - revoke_permission
// - authenticate action (return Auth<ActionPermission> token)
// - is_authorized
// - is_member
//
// - seal_approve (permission to decrypt messages)
// Does this need to be able to work with the `groups` smart-contract?
// This is supposed to support any type of app-specific gating-logic.
// So not sure if we want to bake this function in the messaging contract,
// or even on the `groups` contract.
// Maybe we could offer a default `seal_approve_member`, but leave any custom
// gating logic to be implemented by the app developer in their own contract?
// Would it perhaps make more sense to implement the `seal_apprive_is_member`
// and leave the gating logic to the `app_contract::add_member`/`app_contract::leave_group` functions?
//
// what about seal's identity-bytes, aka keys namespace?
// One case is to use the AuthState's UID (or perhaps MessagingGroup UID) + [nonce]
// or we can keep track of the creator address, and use [creator_address][nonce]
// the second approach makes it easier to work with envelope encryption
//
// There still the problem of: do we want to implement a default `seal_approve`,
// and what needs to be done to support a custom `seal_approve` in an app-specific contract
// that makes use of the messaging contract?
// How should we deal with the identity-bytes in that case?
// Let's not forget we are also supposed to expose a ts-sdk, that should handle encryption/decryption
// as well. Should we just ask for the identity-bytes to be provided by the app-developer when initializing
// the messaging group ts-sdk?

//
// Would it make sense to think of the project as 2 OR 3 layers?
// 1) groups generic smart-contract
// 2) thin messaging contract on top of groups (expose the groups-permissions functionality + messaging-specific permissions?)
// 3) app-specific contract on top of messaging/groups, meant to implement custom gating logic? Should this be an expecation?
// what needs to be done on groups + messaging contracts, to allow for that?
// There are 2 cases to consider getting "overriden" by a custom app-contract using the messaging contract:
// - custom seal_approve functions
// - custom add_member function (e.g. paid-membership, invite-only, time-limited memberships, time-limited gating, etc)

// Off-chain methods:
// - send_message (via message relayer service)
// We still want to authenticate that the sender has permission to send messages to the group
// BUT we don't want to execute a transaction for every message sent. That was the point
// of having off-chain messaging in the first place.
// Could we solve this by having the off-chain relayer
// - retrieve & decrypt messages
// verify permission to read (I guess seal_approve is ok since it only does a dry-run, and can generally get cached?)
// - delete message(s)
// verify permission to delete (can we do similar approach to seal, via a dry-run or dev-inspect?)
// how would that verification look? Would we need a witness stuct `DeleteMessagePermission` to be part of groups AuthState?
// - edit message(s)
// verify permission to edit

/// Module: messaging
module messaging::messaging;

use messaging::auth::{Self, Auth};
use public_package::auth_state::{Self, AuthState};

public struct MessagingGroup has key {
    id: UID,
    auth_state: AuthState,
}

public fun new(ctx: &mut TxContext): MessagingGroup {
    let auth_state = auth_state::new(ctx);
    MessagingGroup {
        id: object::new(ctx),
        auth_state,
    }
}

public fun authenticate<Permission: drop>(
    self: &MessagingGroup,
    ctx: &TxContext,
): Auth<Permission> {
    auth::authenticate(&self.auth_state, ctx)
}

entry fun seal_approve_member(id: vector<u8>, group: &MessagingGroup, ctx: &TxContext) {
    assert!(group.auth_state.is_member(ctx.sender()), 420);
}
