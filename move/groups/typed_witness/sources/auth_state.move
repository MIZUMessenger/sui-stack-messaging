module typed_witness::auth_state;

use std::type_name::{Self, TypeName};
use sui::table::{Self, Table};
use sui::vec_set::{Self, VecSet};

/// Authorization state mapping addresses to their granted permissions.
///
/// The `AuthState` struct maintains a table where:
/// - Key: address of the user
/// - Value: Set of `TypeName`s representing the permissions they hold.
public struct AuthState has store {
    permissions: Table<address, VecSet<TypeName>>,
}

/// Creates a new, empty `AuthState`.
///
/// # Parameters
/// * `ctx`: Mutable reference to the transaction context for Table creation.
///
/// # Returns
/// A new instance of `AuthState` with an empty permissions Table.
public(package) fun new(ctx: &mut TxContext): AuthState {
    AuthState {
        permissions: table::new(ctx),
    }
}

public(package) fun grant_permission<Permission: drop>(self: &mut AuthState, receiver: address) {}
