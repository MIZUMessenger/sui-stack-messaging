#[test_only]
module messaging::messaging_tests;

use permissioned_groups::permissioned_group::{PermissionedGroup, Administrator, ExtensionPermissionsManager};
use messaging::encryption_history::{Self, EncryptionHistory, EncryptionKeyRotator};
use messaging::messaging::{
    Self,
    Messaging,
    MessagingNamespace,
    MessagingSender,
    MessagingReader,
    MessagingEditor,
    MessagingDeleter
};
use std::unit_test::{assert_eq, destroy};
use sui::test_scenario as ts;
use sui::vec_set;

// === Test Addresses ===

const ALICE: address = @0xA11CE;
const BOB: address = @0xB0B;

// === Test Data ===

const TEST_ENCRYPTED_DEK: vector<u8> = b"test_encrypted_dek";
const TEST_ENCRYPTED_DEK_V2: vector<u8> = b"test_encrypted_dek_v2";

// === create_group tests ===

#[test]
fun create_group_creates_group_and_encryption_history() {
    let mut ts = ts::begin(ALICE);

    // Initialize namespace
    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    // Create group
    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<MessagingNamespace>();
    let (group, encryption_history) = messaging::create_group(
        &mut namespace,
        TEST_ENCRYPTED_DEK,
        vec_set::empty(),
        ts.ctx(),
    );

    // Verify group creator
    assert!(group.creator<Messaging>() == ALICE);
    assert!(group.is_member(ALICE));
    assert!(group.administrators_count<Messaging>() == 1);

    // Verify creator has all messaging permissions
    assert!(group.has_permission<Messaging, MessagingSender>(ALICE));
    assert!(group.has_permission<Messaging, MessagingReader>(ALICE));
    assert!(group.has_permission<Messaging, MessagingEditor>(ALICE));
    assert!(group.has_permission<Messaging, MessagingDeleter>(ALICE));
    assert!(group.has_permission<Messaging, EncryptionKeyRotator>(ALICE));

    // Verify creator has core permissions
    assert!(group.has_permission<Messaging, Administrator>(ALICE));
    assert!(group.has_permission<Messaging, ExtensionPermissionsManager>(ALICE));

    // Verify encryption history
    assert_eq!(encryption_history.group_id(), object::id(&group));
    assert_eq!(encryption_history.current_key_version(), 0);
    assert_eq!(*encryption_history.current_encrypted_key(), TEST_ENCRYPTED_DEK);

    // Verify namespace counter
    assert_eq!(messaging::groups_created(&namespace), 1);

    ts::return_shared(namespace);
    destroy(group);
    destroy(encryption_history);
    ts.end();
}

#[test]
fun create_group_increments_namespace_counter() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<MessagingNamespace>();

    assert_eq!(messaging::groups_created(&namespace), 0);

    let (group1, eh1) = messaging::create_group(&mut namespace, TEST_ENCRYPTED_DEK, vec_set::empty(), ts.ctx());
    assert_eq!(messaging::groups_created(&namespace), 1);

    let (group2, eh2) = messaging::create_group(&mut namespace, TEST_ENCRYPTED_DEK, vec_set::empty(), ts.ctx());
    assert_eq!(messaging::groups_created(&namespace), 2);

    ts::return_shared(namespace);
    destroy(group1);
    destroy(eh1);
    destroy(group2);
    destroy(eh2);
    ts.end();
}

#[test]
fun create_group_with_initial_members() {
    let mut ts = ts::begin(ALICE);

    // Initialize namespace
    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    // Create group with Bob as initial member
    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<MessagingNamespace>();
    let mut initial_members = vec_set::empty();
    initial_members.insert(BOB);
    let (group, encryption_history) = messaging::create_group(
        &mut namespace,
        TEST_ENCRYPTED_DEK,
        initial_members,
        ts.ctx(),
    );

    // Verify Bob has MessagingReader permission
    assert_eq!(group.has_permission<Messaging, MessagingReader>(BOB), true);
    assert_eq!(group.is_member(BOB), true);

    // Verify Bob does NOT have other permissions
    assert_eq!(group.has_permission<Messaging, MessagingSender>(BOB), false);
    assert_eq!(group.has_permission<Messaging, Administrator>(BOB), false);

    // Verify creator still has all permissions
    assert_eq!(group.has_permission<Messaging, Administrator>(ALICE), true);
    assert_eq!(group.has_permission<Messaging, MessagingReader>(ALICE), true);

    ts::return_shared(namespace);
    destroy(group);
    destroy(encryption_history);
    ts.end();
}

#[test]
fun create_group_with_initial_members_including_creator() {
    let mut ts = ts::begin(ALICE);

    // Initialize namespace
    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    // Create group with Alice (creator) in initial_members - should be silently skipped
    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<MessagingNamespace>();
    let mut initial_members = vec_set::empty();
    initial_members.insert(ALICE);  // Creator included
    initial_members.insert(BOB);
    let (group, encryption_history) = messaging::create_group(
        &mut namespace,
        TEST_ENCRYPTED_DEK,
        initial_members,
        ts.ctx(),
    );

    // Verify Bob has MessagingReader
    assert_eq!(group.has_permission<Messaging, MessagingReader>(BOB), true);

    // Verify Alice still has all permissions (not just MessagingReader)
    assert_eq!(group.has_permission<Messaging, Administrator>(ALICE), true);
    assert_eq!(group.has_permission<Messaging, MessagingSender>(ALICE), true);

    ts::return_shared(namespace);
    destroy(group);
    destroy(encryption_history);
    ts.end();
}

// === create_and_share_group tests ===

#[test]
fun create_and_share_group_creates_shared_objects() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<MessagingNamespace>();
    messaging::create_and_share_group(&mut namespace, TEST_ENCRYPTED_DEK, vec_set::empty(), ts.ctx());
    ts::return_shared(namespace);

    // Verify shared objects exist
    ts.next_tx(ALICE);
    let group = ts.take_shared<PermissionedGroup<Messaging>>();
    let encryption_history = ts.take_shared<EncryptionHistory>();

    assert!(group.creator<Messaging>() == ALICE);
    assert_eq!(encryption_history.group_id(), object::id(&group));

    ts::return_shared(group);
    ts::return_shared(encryption_history);
    ts.end();
}

// === rotate_encryption_key tests ===

#[test]
fun rotate_encryption_key_with_permission() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<MessagingNamespace>();
    let (group, encryption_history) = messaging::create_group(
        &mut namespace,
        TEST_ENCRYPTED_DEK,
        vec_set::empty(),
        ts.ctx(),
    );
    transfer::public_share_object(group);
    transfer::public_share_object(encryption_history);
    ts::return_shared(namespace);

    // Alice rotates the key
    ts.next_tx(ALICE);
    let group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut encryption_history = ts.take_shared<EncryptionHistory>();

    assert_eq!(encryption_history.current_key_version(), 0);

    messaging::rotate_encryption_key(
        &mut encryption_history,
        &group,
        TEST_ENCRYPTED_DEK_V2,
        ts.ctx(),
    );

    assert_eq!(encryption_history.current_key_version(), 1);
    assert_eq!(*encryption_history.current_encrypted_key(), TEST_ENCRYPTED_DEK_V2);
    // Old key is still accessible
    assert_eq!(*encryption_history.encrypted_key(0), TEST_ENCRYPTED_DEK);

    ts::return_shared(group);
    ts::return_shared(encryption_history);
    ts.end();
}

#[test, expected_failure(abort_code = messaging::ENotPermitted)]
fun rotate_encryption_key_without_permission_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<MessagingNamespace>();
    let (mut group, encryption_history) = messaging::create_group(
        &mut namespace,
        TEST_ENCRYPTED_DEK,
        vec_set::empty(),
        ts.ctx(),
    );
    // Add Bob without EncryptionKeyRotator (just grant MessagingReader)
    group.grant_permission<Messaging, MessagingReader>(BOB, ts.ctx());
    transfer::public_share_object(group);
    transfer::public_share_object(encryption_history);
    ts::return_shared(namespace);

    // Bob tries to rotate the key
    ts.next_tx(BOB);
    let group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut encryption_history = ts.take_shared<EncryptionHistory>();

    messaging::rotate_encryption_key(
        &mut encryption_history,
        &group,
        TEST_ENCRYPTED_DEK_V2,
        ts.ctx(),
    );

    abort
}

// === grant_all_messaging_permissions tests ===

#[test]
fun grant_all_messaging_permissions_grants_all() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<MessagingNamespace>();
    let (mut group, encryption_history) = messaging::create_group(
        &mut namespace,
        TEST_ENCRYPTED_DEK,
        vec_set::empty(),
        ts.ctx(),
    );

    // Grant Bob all messaging permissions
    messaging::grant_all_messaging_permissions(&mut group, BOB, ts.ctx());

    // Verify Bob has all messaging permissions
    assert!(group.has_permission<Messaging, MessagingSender>(BOB));
    assert!(group.has_permission<Messaging, MessagingReader>(BOB));
    assert!(group.has_permission<Messaging, MessagingEditor>(BOB));
    assert!(group.has_permission<Messaging, MessagingDeleter>(BOB));
    assert!(group.has_permission<Messaging, EncryptionKeyRotator>(BOB));

    // Verify Bob does NOT have core permissions
    assert!(!group.has_permission<Messaging, Administrator>(BOB));
    assert!(!group.has_permission<Messaging, ExtensionPermissionsManager>(BOB));

    ts::return_shared(namespace);
    destroy(group);
    destroy(encryption_history);
    ts.end();
}

// === grant_all_permissions tests ===

#[test]
fun grant_all_permissions_grants_base_and_messaging() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<MessagingNamespace>();
    let (mut group, encryption_history) = messaging::create_group(
        &mut namespace,
        TEST_ENCRYPTED_DEK,
        vec_set::empty(),
        ts.ctx(),
    );

    assert_eq!(group.administrators_count<Messaging>(), 1);

    // Grant Bob all permissions (admin)
    messaging::grant_all_permissions(&mut group, BOB, ts.ctx());

    // Verify Bob has all messaging permissions
    assert!(group.has_permission<Messaging, MessagingSender>(BOB));
    assert!(group.has_permission<Messaging, MessagingReader>(BOB));
    assert!(group.has_permission<Messaging, MessagingEditor>(BOB));
    assert!(group.has_permission<Messaging, MessagingDeleter>(BOB));
    assert!(group.has_permission<Messaging, EncryptionKeyRotator>(BOB));

    // Verify Bob has core permissions
    assert!(group.has_permission<Messaging, Administrator>(BOB));
    assert!(group.has_permission<Messaging, ExtensionPermissionsManager>(BOB));

    // Verify administrators count incremented
    assert_eq!(group.administrators_count<Messaging>(), 2);

    ts::return_shared(namespace);
    destroy(group);
    destroy(encryption_history);
    ts.end();
}

// === EncryptionHistory getters tests ===

#[test]
fun encryption_history_encrypted_key_returns_correct_version() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<MessagingNamespace>();
    let (group, encryption_history) = messaging::create_group(
        &mut namespace,
        TEST_ENCRYPTED_DEK,
        vec_set::empty(),
        ts.ctx(),
    );
    transfer::public_share_object(group);
    transfer::public_share_object(encryption_history);
    ts::return_shared(namespace);

    // Rotate twice
    ts.next_tx(ALICE);
    let group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut encryption_history = ts.take_shared<EncryptionHistory>();

    messaging::rotate_encryption_key(&mut encryption_history, &group, b"key_v1", ts.ctx());
    messaging::rotate_encryption_key(&mut encryption_history, &group, b"key_v2", ts.ctx());

    // Verify each version
    assert_eq!(*encryption_history.encrypted_key(0), TEST_ENCRYPTED_DEK);
    assert_eq!(*encryption_history.encrypted_key(1), b"key_v1");
    assert_eq!(*encryption_history.encrypted_key(2), b"key_v2");
    assert_eq!(encryption_history.current_key_version(), 2);

    ts::return_shared(group);
    ts::return_shared(encryption_history);
    ts.end();
}

#[test, expected_failure(abort_code = encryption_history::EKeyVersionNotFound)]
fun encryption_history_encrypted_key_invalid_version_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<MessagingNamespace>();
    let (_group, encryption_history) = messaging::create_group(
        &mut namespace,
        TEST_ENCRYPTED_DEK,
        vec_set::empty(),
        ts.ctx(),
    );

    // Try to access version 1 when only version 0 exists
    let _ = encryption_history.encrypted_key(1);

    abort
}

// === EEncryptedDEKTooLarge error tests ===

/// Generate a vector of bytes larger than MAX_ENCRYPTED_DEK_BYTES (1024).
fun make_oversized_dek(): vector<u8> {
    let mut dek = vector::empty<u8>();
    let mut i: u64 = 0;
    while (i < 1025) {
        dek.push_back(0x42);
        i = i + 1;
    };
    dek
}

#[test, expected_failure(abort_code = encryption_history::EEncryptedDEKTooLarge)]
fun create_group_with_oversized_dek_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<MessagingNamespace>();

    // Try to create group with oversized DEK
    let (_group, _encryption_history) = messaging::create_group(
        &mut namespace,
        make_oversized_dek(),
        vec_set::empty(),
        ts.ctx(),
    );

    abort
}

#[test, expected_failure(abort_code = encryption_history::EEncryptedDEKTooLarge)]
fun rotate_encryption_key_with_oversized_dek_fails() {
    let mut ts = ts::begin(ALICE);

    ts.next_tx(ALICE);
    messaging::init_for_testing(ts.ctx());

    ts.next_tx(ALICE);
    let mut namespace = ts.take_shared<MessagingNamespace>();
    let (group, encryption_history) = messaging::create_group(
        &mut namespace,
        TEST_ENCRYPTED_DEK,
        vec_set::empty(),
        ts.ctx(),
    );
    transfer::public_share_object(group);
    transfer::public_share_object(encryption_history);
    ts::return_shared(namespace);

    // Alice tries to rotate with oversized DEK
    ts.next_tx(ALICE);
    let group = ts.take_shared<PermissionedGroup<Messaging>>();
    let mut encryption_history = ts.take_shared<EncryptionHistory>();

    messaging::rotate_encryption_key(
        &mut encryption_history,
        &group,
        make_oversized_dek(),
        ts.ctx(),
    );

    abort
}
