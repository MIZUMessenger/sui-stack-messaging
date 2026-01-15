# Messaging SDK V2

In the revised Messaging SDK architecture, messaging capabilities are moved to an off-chain relayer service.
Sending, retrieving, archiving, and syncing messaging history are all handled off-chain.
An example implementation of such a service will be offered with and without Nautilus.

The smart contract handles Groups & fine-grained permissions, as well as integration with Seal.
A standalone generic Groups & Permissions smart contract is offered as a reusable library.

## Architecture Overview

### Package Structure

```
Layer 1: groups
├── permissions_group.move    # Generic permission system

Layer 2: messaging
├── messaging.move           # Messaging-specific wrapper
├── encryption_history.move  # Key versioning with derived objects
└── seal_policies.move       # Default seal_approve implementations

Layer 3: example_app (third-party examples)
├── custom_seal_policy.move  # Subscription-based access example
└── paid_join_rule.move      # Payment-gated membership example
```

### Key Design Decisions

1. **Generic Permissions System**: `PermissionsGroup<T>` is a top-level object (`key + store`) generic by type `T: drop`, specifying the application using the permissions. This allows the group to be passed alongside other objects for authentication without wrapping.

2. **Permission Hierarchy**:
   - `Administrator`: Super-admin role that can grant/revoke all permissions including `Administrator` itself
   - `ExtensionPermissionsManager`: Can grant/revoke extension permissions only (for third-party packages)
   - Extension permissions are application-specific (e.g., `MessagingReader`, `MessagingSender`)

3. **Membership Model**: Membership is implicit - having at least one permission makes an address a member. No separate membership concept.

4. **Object-based Authentication**: Objects (via their UID address) can be granted permissions alongside regular addresses, enabling the "actor pattern" for self-service operations.

5. **Discoverability**: Events are emitted for all permission changes, enabling discovery via indexers/GraphQL. `MessagingNamespace` serves as a shared object for deriving contract objects with deterministic addresses.

6. **Seal Integration**:
   - `MessagingReader` permission is checked via Seal's `seal_approve` functions (dry-run)
   - Other permissions (`SendMessage`, `EditMessage`, `DeleteMessage`) are verified client-side by fetching group permissions state
   - Only `EncryptionKeyRotator` operations are fully on-chain

## High Level Requirements

### Permission Management
- Keep track of member permissions per group
- Grant/revoke fine-grained permissions
- Check if a member has a specific permission
- Support both address-based and object-based permission holders

### Membership Operations
- Add members (by granting permissions)
- Remove members (by revoking all permissions)
- Self-service join via actor pattern with `ExtensionPermissionsManager`

### Discoverability
- Events for all permission changes (grant, revoke, member add/remove)
- Deterministic object addresses via derived objects from `MessagingNamespace`

### Seal Integration
- Default `seal_approve` implementations for reader access
- Support for custom `seal_approve` in third-party packages

## Permissions

### Core Permissions (groups package)

| Permission | Description |
|------------|-------------|
| `Administrator` | Can grant/revoke ALL permissions including other `Administrator` |
| `ExtensionPermissionsManager` | Can grant/revoke extension permissions (non-core) |

### Messaging Permissions (messaging package)

| Permission | Description | Verification |
|------------|-------------|--------------|
| `MessagingReader` | Can decrypt messages | Seal dry-run |
| `MessagingSender` | Can send messages | Client-side |
| `MessagingEditor` | Can edit messages | Client-side |
| `MessagingDeleter` | Can delete messages | Client-side |
| `EncryptionKeyRotator` | Can rotate encryption keys | On-chain transaction |

**Note**: Only `MessagingReader` is verified via Seal (dry-run, not a real transaction). Other messaging permissions are checked client-side by fetching the group's permission state, avoiding frequent transactions. Only key rotation requires an actual on-chain transaction.

## Customization

### Actor Pattern for Self-Service Operations

Third-party contracts can implement custom join/access rules using the "actor pattern":

1. **Define an actor object** (e.g., `PaidJoinRule`) that contains all relevant configuration (fee amount, associated group ID, accumulated balance, etc.)
2. **Grant the actor's address** `ExtensionPermissionsManager` permission on the group
3. **Users interact with the actor**, which grants them permissions via `object_grant_permission`
4. The actor's UID is passed to `object_grant_permission`, which verifies the actor has `ExtensionPermissionsManager` before granting the requested permission to the transaction sender

Example: `paid_join_rule.move` demonstrates payment-gated membership where:
- `PaidJoinRule<Token>` stores: group_id, fee amount, accumulated balance
- Users call `join()` with payment, and the rule grants them `MessagingReader` permission
- Members with `FundsManager` permission can withdraw accumulated fees

### Custom Seal Policies

Third-party contracts can implement custom `seal_approve` functions for advanced access control:

- Define custom namespace prefix (e.g., `[service_id][nonce]`)
- Implement access checks (subscription validity, token ownership, etc.)
- The custom package's ID is used for Seal encryption

Example: `custom_seal_policy.move` demonstrates subscription-based access with TTL expiry.

## Seal Namespace Strategy

### Default seal_approve (messaging package)

- **Namespace**: `[creator_address (32 bytes)][nonce]`
- **Package ID**: messaging package
- **Rationale**: Creator address is known before transaction execution, enabling single-PTB group creation
- **Use case**: Standard group member access

### Custom seal_approve (third-party package)

- **Namespace**: Defined by custom contract (e.g., `[service_id][nonce]`)
- **Package ID**: Third-party package ID
- **Use case**: Subscription-based access, token-gating, time-limited access

## Smart Contract Modules

### Layer 1: groups

Generic reusable library for permission management.

**permissions_group.move**:
- `PermissionsGroup<T>` struct (`key + store`)
- Permission witnesses via TypeName (supports any `drop` type)
- Core functions: `grant_permission`, `revoke_permission`, `has_permission`
- Object-based auth: `object_grant_permission`, `object_revoke_permission`
- Events: `PermissionsGranted`, `PermissionsRevoked`, `MemberAdded`, `MemberRemoved`

### Layer 2: messaging

Wrapper providing messaging-specific functionality.

**messaging.move**:
- `MessagingNamespace` shared object for group creation
- `Messaging` witness type for `PermissionsGroup<Messaging>`
- Messaging permission witnesses: `MessagingReader`, `MessagingSender`, etc.
- Helper functions: `create_group`, `grant_all_messaging_permissions`

**encryption_history.move**:
- `EncryptionHistory` derived object from `MessagingNamespace`
- Versioned encrypted DEK storage
- Key rotation support

**seal_policies.move**:
- `seal_approve_reader`: Validates `MessagingReader` permission (via dry-run)
- Namespace validation using creator address prefix

### Layer 3: example_app

Example third-party implementations.

**paid_join_rule.move**:
- Payment-gated group membership using actor pattern
- `PaidJoinRule<Token>` actor with fee configuration
- Accumulates fees with `FundsManager` withdrawal permission

**custom_seal_policy.move**:
- Subscription-based access control
- Custom namespace using Service ID
- Time-limited subscriptions with TTL
