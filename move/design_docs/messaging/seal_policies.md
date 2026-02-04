
<a name="messaging_seal_policies"></a>

# Module `messaging::seal_policies`

Module: seal_policies

Default <code>seal_approve</code> functions for Seal encryption access control.
Called by Seal key servers (via dry-run) to authorize decryption.


<a name="@Identity_Bytes_Format_0"></a>

### Identity Bytes Format


Identity bytes: <code>[group_id (32 bytes)][key_version (8 bytes LE u64)]</code>
Total: 40 bytes

- <code>group_id</code>: The PermissionedGroup<Messaging> object ID
- <code>key_version</code>: The encryption key version (supports key rotation)


<a name="@Custom_Policies_1"></a>

### Custom Policies


Apps can implement custom <code>seal_approve</code> with different logic:
- Subscription-based, time-limited, NFT-gated access, etc.
- Must be in the same package used during <code>seal.encrypt</code>.


    -  [Identity Bytes Format](#@Identity_Bytes_Format_0)
    -  [Custom Policies](#@Custom_Policies_1)
-  [Constants](#@Constants_2)
-  [Function `validate_identity`](#messaging_seal_policies_validate_identity)
    -  [Parameters](#@Parameters_3)
    -  [Aborts](#@Aborts_4)
-  [Function `seal_approve_reader`](#messaging_seal_policies_seal_approve_reader)
    -  [Parameters](#@Parameters_5)
    -  [Aborts](#@Aborts_6)


<pre><code><b>use</b> <a href="../messaging/encryption_history.md#messaging_encryption_history">messaging::encryption_history</a>;
<b>use</b> <a href="../messaging/messaging.md#messaging_messaging">messaging::messaging</a>;
<b>use</b> <a href="../dependencies/permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group">permissioned_groups::permissioned_group</a>;
<b>use</b> <a href="../dependencies/permissioned_groups/permissions_table.md#permissioned_groups_permissions_table">permissioned_groups::permissions_table</a>;
<b>use</b> <a href="../dependencies/std/address.md#std_address">std::address</a>;
<b>use</b> <a href="../dependencies/std/ascii.md#std_ascii">std::ascii</a>;
<b>use</b> <a href="../dependencies/std/bcs.md#std_bcs">std::bcs</a>;
<b>use</b> <a href="../dependencies/std/option.md#std_option">std::option</a>;
<b>use</b> <a href="../dependencies/std/string.md#std_string">std::string</a>;
<b>use</b> <a href="../dependencies/std/type_name.md#std_type_name">std::type_name</a>;
<b>use</b> <a href="../dependencies/std/vector.md#std_vector">std::vector</a>;
<b>use</b> <a href="../dependencies/sui/accumulator.md#sui_accumulator">sui::accumulator</a>;
<b>use</b> <a href="../dependencies/sui/accumulator_metadata.md#sui_accumulator_metadata">sui::accumulator_metadata</a>;
<b>use</b> <a href="../dependencies/sui/accumulator_settlement.md#sui_accumulator_settlement">sui::accumulator_settlement</a>;
<b>use</b> <a href="../dependencies/sui/address.md#sui_address">sui::address</a>;
<b>use</b> <a href="../dependencies/sui/bag.md#sui_bag">sui::bag</a>;
<b>use</b> <a href="../dependencies/sui/bcs.md#sui_bcs">sui::bcs</a>;
<b>use</b> <a href="../dependencies/sui/derived_object.md#sui_derived_object">sui::derived_object</a>;
<b>use</b> <a href="../dependencies/sui/dynamic_field.md#sui_dynamic_field">sui::dynamic_field</a>;
<b>use</b> <a href="../dependencies/sui/event.md#sui_event">sui::event</a>;
<b>use</b> <a href="../dependencies/sui/hash.md#sui_hash">sui::hash</a>;
<b>use</b> <a href="../dependencies/sui/hex.md#sui_hex">sui::hex</a>;
<b>use</b> <a href="../dependencies/sui/object.md#sui_object">sui::object</a>;
<b>use</b> <a href="../dependencies/sui/package.md#sui_package">sui::package</a>;
<b>use</b> <a href="../dependencies/sui/party.md#sui_party">sui::party</a>;
<b>use</b> <a href="../dependencies/sui/table.md#sui_table">sui::table</a>;
<b>use</b> <a href="../dependencies/sui/table_vec.md#sui_table_vec">sui::table_vec</a>;
<b>use</b> <a href="../dependencies/sui/transfer.md#sui_transfer">sui::transfer</a>;
<b>use</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context">sui::tx_context</a>;
<b>use</b> <a href="../dependencies/sui/types.md#sui_types">sui::types</a>;
<b>use</b> <a href="../dependencies/sui/vec_map.md#sui_vec_map">sui::vec_map</a>;
<b>use</b> <a href="../dependencies/sui/vec_set.md#sui_vec_set">sui::vec_set</a>;
</code></pre>



<a name="@Constants_2"></a>

## Constants


<a name="messaging_seal_policies_EInvalidIdentity"></a>

Identity bytes are malformed (wrong length or mismatched group ID).


<pre><code><b>const</b> <a href="../messaging/seal_policies.md#messaging_seal_policies_EInvalidIdentity">EInvalidIdentity</a>: u64 = 0;
</code></pre>



<a name="messaging_seal_policies_ENotPermitted"></a>

Caller lacks the required <code>MessagingReader</code> permission.


<pre><code><b>const</b> <a href="../messaging/seal_policies.md#messaging_seal_policies_ENotPermitted">ENotPermitted</a>: u64 = 1;
</code></pre>



<a name="messaging_seal_policies_EInvalidKeyVersion"></a>

Requested key version does not exist in the encryption history.


<pre><code><b>const</b> <a href="../messaging/seal_policies.md#messaging_seal_policies_EInvalidKeyVersion">EInvalidKeyVersion</a>: u64 = 2;
</code></pre>



<a name="messaging_seal_policies_EEncryptionHistoryMismatch"></a>

The provided <code>EncryptionHistory</code> does not belong to the given group.


<pre><code><b>const</b> <a href="../messaging/seal_policies.md#messaging_seal_policies_EEncryptionHistoryMismatch">EEncryptionHistoryMismatch</a>: u64 = 3;
</code></pre>



<a name="messaging_seal_policies_IDENTITY_BYTES_LENGTH"></a>

Expected identity bytes length: 32 (group_id) + 8 (key_version) = 40 bytes


<pre><code><b>const</b> <a href="../messaging/seal_policies.md#messaging_seal_policies_IDENTITY_BYTES_LENGTH">IDENTITY_BYTES_LENGTH</a>: u64 = 40;
</code></pre>



<a name="messaging_seal_policies_validate_identity"></a>

## Function `validate_identity`

Validates identity bytes format and extracts components.

Expected format: <code>[group_id (32 bytes)][key_version (8 bytes LE u64)]</code>


<a name="@Parameters_3"></a>

### Parameters

- <code>group</code>: Reference to the PermissionedGroup<Messaging>
- <code><a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a></code>: Reference to the EncryptionHistory
- <code>id</code>: The Seal identity bytes to validate


<a name="@Aborts_4"></a>

### Aborts

- <code><a href="../messaging/seal_policies.md#messaging_seal_policies_EInvalidIdentity">EInvalidIdentity</a></code>: if length != 40 or group_id doesn't match
- <code><a href="../messaging/seal_policies.md#messaging_seal_policies_EInvalidKeyVersion">EInvalidKeyVersion</a></code>: if key_version > current_key_version


<pre><code><b>fun</b> <a href="../messaging/seal_policies.md#messaging_seal_policies_validate_identity">validate_identity</a>(group: &<a href="../dependencies/permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">messaging::messaging::Messaging</a>&gt;, <a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a>: &<a href="../messaging/encryption_history.md#messaging_encryption_history_EncryptionHistory">messaging::encryption_history::EncryptionHistory</a>, id: vector&lt;u8&gt;)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>fun</b> <a href="../messaging/seal_policies.md#messaging_seal_policies_validate_identity">validate_identity</a>(
    group: &PermissionedGroup&lt;Messaging&gt;,
    <a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a>: &EncryptionHistory,
    id: vector&lt;u8&gt;,
) {
    // Must be exactly 40 bytes: 32 (group_id) + 8 (key_version)
    <b>assert</b>!(id.length() == <a href="../messaging/seal_policies.md#messaging_seal_policies_IDENTITY_BYTES_LENGTH">IDENTITY_BYTES_LENGTH</a>, <a href="../messaging/seal_policies.md#messaging_seal_policies_EInvalidIdentity">EInvalidIdentity</a>);
    // Use BCS to parse the identity bytes
    <b>let</b> <b>mut</b> bcs_bytes = bcs::new(id);
    // Parse group_id (32 bytes <b>as</b> <b>address</b>)
    <b>let</b> parsed_group_id = bcs_bytes.peel_address();
    // Verify group_id matches
    <b>assert</b>!(object::id_to_address(&object::id(group)) == parsed_group_id, <a href="../messaging/seal_policies.md#messaging_seal_policies_EInvalidIdentity">EInvalidIdentity</a>);
    // Parse key_version (u64, little-endian)
    <b>let</b> key_version = bcs_bytes.peel_u64();
    // Key version must exist (be &lt;= current version)
    <b>assert</b>!(key_version &lt;= <a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a>.current_key_version(), <a href="../messaging/seal_policies.md#messaging_seal_policies_EInvalidKeyVersion">EInvalidKeyVersion</a>);
}
</code></pre>



</details>

<a name="messaging_seal_policies_seal_approve_reader"></a>

## Function `seal_approve_reader`

Default seal_approve that checks <code>MessagingReader</code> permission.


<a name="@Parameters_5"></a>

### Parameters

- <code>id</code>: Seal identity bytes <code>[group_id (32 bytes)][key_version (8 bytes LE u64)]</code>
- <code>group</code>: Reference to the PermissionedGroup<Messaging>
- <code><a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a></code>: Reference to the EncryptionHistory
- <code>ctx</code>: Transaction context


<a name="@Aborts_6"></a>

### Aborts

- <code><a href="../messaging/seal_policies.md#messaging_seal_policies_EEncryptionHistoryMismatch">EEncryptionHistoryMismatch</a></code>: if encryption_history doesn't belong to this group
- <code><a href="../messaging/seal_policies.md#messaging_seal_policies_EInvalidIdentity">EInvalidIdentity</a></code>: if identity bytes are malformed or group_id doesn't match
- <code><a href="../messaging/seal_policies.md#messaging_seal_policies_EInvalidKeyVersion">EInvalidKeyVersion</a></code>: if key_version doesn't exist
- <code><a href="../messaging/seal_policies.md#messaging_seal_policies_ENotPermitted">ENotPermitted</a></code>: if caller doesn't have <code>MessagingReader</code> permission


<pre><code><b>entry</b> <b>fun</b> <a href="../messaging/seal_policies.md#messaging_seal_policies_seal_approve_reader">seal_approve_reader</a>(id: vector&lt;u8&gt;, group: &<a href="../dependencies/permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">messaging::messaging::Messaging</a>&gt;, <a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a>: &<a href="../messaging/encryption_history.md#messaging_encryption_history_EncryptionHistory">messaging::encryption_history::EncryptionHistory</a>, ctx: &<a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>entry</b> <b>fun</b> <a href="../messaging/seal_policies.md#messaging_seal_policies_seal_approve_reader">seal_approve_reader</a>(
    id: vector&lt;u8&gt;,
    group: &PermissionedGroup&lt;Messaging&gt;,
    <a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a>: &EncryptionHistory,
    ctx: &TxContext,
) {
    // Verify <a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a> belongs to this group
    <b>assert</b>!(<a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a>.group_id() == object::id(group), <a href="../messaging/seal_policies.md#messaging_seal_policies_EEncryptionHistoryMismatch">EEncryptionHistoryMismatch</a>);
    <a href="../messaging/seal_policies.md#messaging_seal_policies_validate_identity">validate_identity</a>(group, <a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a>, id);
    <b>assert</b>!(group.has_permission&lt;Messaging, MessagingReader&gt;(ctx.sender()), <a href="../messaging/seal_policies.md#messaging_seal_policies_ENotPermitted">ENotPermitted</a>);
}
</code></pre>



</details>
