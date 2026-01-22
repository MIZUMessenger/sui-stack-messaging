/// Module: dummy_test_witness
/// A minimal module for testing permissioned groups with a witness type.
module dummy_test_witness::dummy_test_witness;

use permissioned_groups::permissioned_group::{Self, PermissionedGroup};

/// One-time witness for testing permissioned groups
public struct DUMMY_TEST_WITNESS has drop {}

/// Creates a new PermissionedGroup scoped to DUMMY_TEST_WITNESS.
/// This function ensures the dependency on permissioned_groups is actually used.
public fun create_group(ctx: &mut TxContext): PermissionedGroup<DUMMY_TEST_WITNESS> {
    permissioned_group::new<DUMMY_TEST_WITNESS>(ctx)
}
