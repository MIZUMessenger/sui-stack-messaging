/// Module: custom_seal_policy
///
/// Example third-party app contract demonstrating subscription-based access control
/// for encrypted messaging content using a custom seal_approve function.
///
/// ## Pattern Overview
///
/// This pattern implements subscription-based access to encrypted content:
/// - A service owner creates a Service linked to a MessagingGroup
/// - Users purchase time-limited Subscriptions by paying SUI
/// - The custom seal_approve validates subscription ownership and expiry
///
/// ## Key Design Points
///
/// 1. **No wrapper needed**: This pattern doesn't wrap MessagingGroup. Instead, it:
///    - References the MessagingGroup by ID (stored in Service)
///    - Uses its own packageId for Seal encryption namespace
///
/// 2. **TS-SDK integration**: The SDK only needs to know:
///    - This package ID (for seal_approve calls)
///    - The Service object ID (for namespace prefix)
///
/// 3. **Namespace**: Uses Service ID as namespace prefix, format: [service_id][nonce]
///
/// ## Usage Flow
///
/// 1. Create MessagingGroup using `messaging::messaging::create_group()`
/// 2. Create Service via `create_service(group_id, fee, ttl)`
/// 3. Users subscribe via `subscribe(service, payment, clock)`
/// 4. Encrypt content using this package's ID and service.id as namespace
/// 5. `seal_approve` validates subscription before decryption
///
module example_app::custom_seal_policy;

use permissioned_groups::permissioned_group::PermissionedGroup;
use messaging::messaging::Messaging;
use sui::clock::Clock;
use sui::coin::Coin;

// === Error Codes ===

const EInvalidFee: u64 = 0;
const ENoAccess: u64 = 1;

// === Structs ===

/// A subscription service that gates access to a MessagingGroup's encrypted content.
/// The service can be shared so anyone can subscribe.
public struct Service<phantom Token> has key {
    id: UID,
    /// The MessagingGroup this service is associated with (for reference only)
    group_id: ID,
    /// Subscription fee in the Token's smallest unit
    fee: u64,
    /// Time-to-live for subscriptions in milliseconds
    ttl: u64,
    /// Address that receives subscription payments
    owner: address,
}

/// A time-limited subscription to a Service.
/// Only has `key` (no `store`) so it can only be transferred, not wrapped.
public struct Subscription<phantom Token> has key {
    id: UID,
    /// The service this subscription belongs to
    service_id: ID,
    /// Timestamp (ms) when the subscription was created
    created_at: u64,
}

// === Service Management ===

/// Creates a new subscription service for a MessagingGroup.
///
/// # Parameters
/// - `group_id`: The ID of the MessagingGroup this service controls access to
/// - `fee`: Subscription fee in MIST
/// - `ttl`: Subscription duration in milliseconds
/// - `ctx`: Transaction context
///
/// # Returns
/// - A new Service object (should be shared for public access)
public fun create_service<Token: drop>(
    group_id: ID,
    fee: u64,
    ttl: u64,
    ctx: &mut TxContext,
): Service<Token> {
    Service<Token> {
        id: object::new(ctx),
        group_id,
        fee,
        ttl,
        owner: ctx.sender(),
    }
}

/// Creates and shares a new subscription service.
/// Convenience entry function for simpler CLI usage.
entry fun create_service_and_share<Token: drop>(
    group_id: ID,
    fee: u64,
    ttl: u64,
    ctx: &mut TxContext,
) {
    transfer::share_object(create_service<Token>(group_id, fee, ttl, ctx));
}

// === Subscription Management ===

/// Purchases a subscription to the service.
/// The subscription is valid for `service.ttl` milliseconds from creation.
///
/// # Parameters
/// - `service`: Reference to the Service
/// - `payment`: SUI coin for payment (must equal service.fee)
/// - `clock`: Clock for timestamp
/// - `ctx`: Transaction context
///
/// # Returns
/// - A new Subscription object
///
/// # Aborts
/// - `EInvalidFee`: if payment amount doesn't match service fee
public fun subscribe<Token: drop>(
    service: &Service<Token>,
    payment: Coin<Token>,
    clock: &Clock,
    ctx: &mut TxContext,
): Subscription<Token> {
    assert!(payment.value() == service.fee, EInvalidFee);

    // Transfer payment to service owner
    transfer::public_transfer(payment, service.owner);

    Subscription<Token> {
        id: object::new(ctx),
        service_id: object::id(service),
        created_at: clock.timestamp_ms(),
    }
}

/// Purchases a subscription and transfers it to the sender.
/// Convenience entry function for simpler CLI usage.
entry fun subscribe_entry<Token: drop>(
    service: &Service<Token>,
    payment: Coin<Token>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let sub = subscribe<Token>(service, payment, clock, ctx);
    transfer::transfer(sub, ctx.sender());
}

/// Transfers a subscription to another address.
/// This allows gifting or selling subscriptions.
public fun transfer_subscription<Token: drop>(sub: Subscription<Token>, to: address) {
    transfer::transfer(sub, to);
}

// === Getters ===

/// Returns the fee for this service.
public fun fee<Token: drop>(service: &Service<Token>): u64 {
    service.fee
}

/// Returns the TTL for this service.
public fun ttl<Token: drop>(service: &Service<Token>): u64 {
    service.ttl
}

/// Returns the MessagingGroup ID this service is associated with.
public fun group_id<Token: drop>(service: &Service<Token>): ID {
    service.group_id
}

/// Returns the service ID this subscription belongs to.
public fun subscription_service_id<Token: drop>(sub: &Subscription<Token>): ID {
    sub.service_id
}

/// Returns when this subscription was created.
public fun created_at<Token: drop>(sub: &Subscription<Token>): u64 {
    sub.created_at
}

/// Checks if a subscription is still valid (not expired).
public fun is_subscription_valid<Token: drop>(
    sub: &Subscription<Token>,
    service: &Service<Token>,
    clock: &Clock,
): bool {
    if (object::id(service) != sub.service_id) {
        return false
    };
    clock.timestamp_ms() <= sub.created_at + service.ttl
}

// === Seal Approve ===

/// Validates that the id has the correct namespace prefix (service ID).
/// The service ID is used as the namespace to identify which service's content
/// is being accessed.
///
/// Namespace format: [service_id (32 bytes)][nonce (variable)]
///
/// # Parameters
/// - `service`: Reference to the Service
/// - `id`: The Seal identity bytes to validate
///
/// # Returns
/// `true` if the namespace prefix matches, `false` otherwise.
fun check_namespace<Token: drop>(service: &Service<Token>, id: &vector<u8>): bool {
    let namespace = object::id(service).to_bytes();
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

/// Checks all conditions for seal approval.
///
/// # Parameters
/// - `id`: The Seal identity bytes
/// - `sub`: Reference to the user's Subscription
/// - `service`: Reference to the Service
/// - `group`: Reference to the PermissionedGroup<Messaging>
/// - `clock`: Clock for expiry validation
/// - `ctx`: Transaction context for sender verification
///
/// # Returns
/// `true` if all conditions pass (subscription valid, namespace matches, caller is member),
/// `false` otherwise.
fun check_policy<Token: drop>(
    id: &vector<u8>,
    sub: &Subscription<Token>,
    service: &Service<Token>,
    group: &PermissionedGroup<Messaging>,
    clock: &Clock,
    ctx: &TxContext,
): bool {
    // Check if group matches the service's group_id
    if (object::id(group) != service.group_id) {
        return false
    };

    // Check if caller is a member of the group
    if (!group.is_member(ctx.sender())) {
        return false
    };

    // Check if subscription belongs to this service
    if (object::id(service) != sub.service_id) {
        return false
    };

    // Check if subscription has expired
    if (clock.timestamp_ms() > sub.created_at + service.ttl) {
        return false
    };

    // Check if the id has the correct namespace prefix
    check_namespace(service, id)
}

/// Custom seal_approve for subscription-based access.
/// Called by Seal key servers (via dry-run) to authorize decryption.
///
/// # Parameters
/// - `id`: The Seal identity bytes (format: [service_id][nonce])
/// - `sub`: The user's Subscription object
/// - `service`: The Service being accessed
/// - `group`: The MessagingGroup (must match service.group_id)
/// - `clock`: Clock for expiry validation
/// - `ctx`: Transaction context for sender verification
///
/// # Aborts
/// - If group doesn't match service.group_id
/// - If caller is not a member of the group
/// - If subscription doesn't belong to this service
/// - If subscription has expired
/// - If namespace prefix doesn't match service ID
entry fun seal_approve<Token: drop>(
    id: vector<u8>,
    sub: &Subscription<Token>,
    service: &Service<Token>,
    group: &PermissionedGroup<Messaging>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(check_policy(&id, sub, service, group, clock, ctx), ENoAccess);
}

// === Tests ===
// Tests moved to tests/custom_seal_policy_tests.move
