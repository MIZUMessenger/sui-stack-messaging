
<a name="messaging_seal_policies"></a>

# Module `messaging::seal_policies`

Module: seal_policies

Default <code>seal_approve</code> functions for Seal encryption access control.
Called by Seal key servers (via dry-run) to authorize decryption.


<a name="@Namespace_Format_0"></a>

### Namespace Format


Identity bytes: <code>[creator_address (32 bytes)][nonce]</code>
Uses the group creator's address as namespace prefix for per-group encryption.


<a name="@Custom_Policies_1"></a>

### Custom Policies


Apps can implement custom <code>seal_approve</code> with different logic:
- Subscription-based, time-limited, NFT-gated access, etc.
- Must be in the same package used during <code>seal.encrypt</code>.


    -  [Namespace Format](#@Namespace_Format_0)
    -  [Custom Policies](#@Custom_Policies_1)
-  [Constants](#@Constants_2)
-  [Function `check_namespace`](#messaging_seal_policies_check_namespace)
    -  [Parameters](#@Parameters_3)
    -  [Returns](#@Returns_4)
-  [Function `seal_approve_reader`](#messaging_seal_policies_seal_approve_reader)
    -  [Parameters](#@Parameters_5)
    -  [Aborts](#@Aborts_6)


<pre><code><b>use</b> <a href="../messaging/encryption_history.md#messaging_encryption_history">messaging::encryption_history</a>;
<b>use</b> <a href="../messaging/messaging.md#messaging_messaging">messaging::messaging</a>;
<b>use</b> <a href="../dependencies/permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group">permissioned_groups::permissioned_group</a>;
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
<b>use</b> <a href="../dependencies/sui/party.md#sui_party">sui::party</a>;
<b>use</b> <a href="../dependencies/sui/table.md#sui_table">sui::table</a>;
<b>use</b> <a href="../dependencies/sui/table_vec.md#sui_table_vec">sui::table_vec</a>;
<b>use</b> <a href="../dependencies/sui/transfer.md#sui_transfer">sui::transfer</a>;
<b>use</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context">sui::tx_context</a>;
<b>use</b> <a href="../dependencies/sui/vec_map.md#sui_vec_map">sui::vec_map</a>;
<b>use</b> <a href="../dependencies/sui/vec_set.md#sui_vec_set">sui::vec_set</a>;
</code></pre>



<a name="@Constants_2"></a>

## Constants


<a name="messaging_seal_policies_EInvalidNamespace"></a>



<pre><code><b>const</b> <a href="../messaging/seal_policies.md#messaging_seal_policies_EInvalidNamespace">EInvalidNamespace</a>: u64 = 0;
</code></pre>



<a name="messaging_seal_policies_ENotPermitted"></a>



<pre><code><b>const</b> <a href="../messaging/seal_policies.md#messaging_seal_policies_ENotPermitted">ENotPermitted</a>: u64 = 1;
</code></pre>



<a name="messaging_seal_policies_check_namespace"></a>

## Function `check_namespace`

Validates that <code>id</code> has the correct Seal namespace prefix.

Expected format: <code>[creator_address (32 bytes)][nonce]</code>


<a name="@Parameters_3"></a>

### Parameters

- <code>group</code>: Reference to the PermissionedGroup<Messaging>
- <code>id</code>: The Seal identity bytes to validate


<a name="@Returns_4"></a>

### Returns

<code><b>true</b></code> if the namespace prefix matches, <code><b>false</b></code> otherwise.


<pre><code><b>fun</b> <a href="../messaging/seal_policies.md#messaging_seal_policies_check_namespace">check_namespace</a>(group: &<a href="../dependencies/permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">messaging::messaging::Messaging</a>&gt;, id: &vector&lt;u8&gt;): bool
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>fun</b> <a href="../messaging/seal_policies.md#messaging_seal_policies_check_namespace">check_namespace</a>(group: &PermissionedGroup&lt;Messaging&gt;, id: &vector&lt;u8&gt;): bool {
    <b>let</b> namespace = group.creator&lt;Messaging&gt;().to_bytes();
    <b>let</b> namespace_len = namespace.length();
    <b>if</b> (namespace_len &gt; id.length()) {
        <b>return</b> <b>false</b>
    };
    <b>let</b> <b>mut</b> i = 0;
    <b>while</b> (i &lt; namespace_len) {
        <b>if</b> (namespace[i] != id[i]) {
            <b>return</b> <b>false</b>
        };
        i = i + 1;
    };
    <b>true</b>
}
</code></pre>



</details>

<a name="messaging_seal_policies_seal_approve_reader"></a>

## Function `seal_approve_reader`

Default seal_approve that checks <code>MessagingReader</code> permission.


<a name="@Parameters_5"></a>

### Parameters

- <code>id</code>: Seal identity bytes <code>[creator_address (32 bytes)][nonce]</code>
- <code>group</code>: Reference to the PermissionedGroup<Messaging>
- <code>ctx</code>: Transaction context


<a name="@Aborts_6"></a>

### Aborts

- <code><a href="../messaging/seal_policies.md#messaging_seal_policies_EInvalidNamespace">EInvalidNamespace</a></code>: if <code>id</code> doesn't have correct creator address prefix
- <code><a href="../messaging/seal_policies.md#messaging_seal_policies_ENotPermitted">ENotPermitted</a></code>: if caller doesn't have <code>MessagingReader</code> permission


<pre><code><b>entry</b> <b>fun</b> <a href="../messaging/seal_policies.md#messaging_seal_policies_seal_approve_reader">seal_approve_reader</a>(id: vector&lt;u8&gt;, group: &<a href="../dependencies/permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">messaging::messaging::Messaging</a>&gt;, ctx: &<a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>entry</b> <b>fun</b> <a href="../messaging/seal_policies.md#messaging_seal_policies_seal_approve_reader">seal_approve_reader</a>(
    id: vector&lt;u8&gt;,
    group: &PermissionedGroup&lt;Messaging&gt;,
    ctx: &TxContext,
) {
    <b>assert</b>!(<a href="../messaging/seal_policies.md#messaging_seal_policies_check_namespace">check_namespace</a>(group, &id), <a href="../messaging/seal_policies.md#messaging_seal_policies_EInvalidNamespace">EInvalidNamespace</a>);
    <b>assert</b>!(group.has_permission&lt;Messaging, MessagingReader&gt;(ctx.sender()), <a href="../messaging/seal_policies.md#messaging_seal_policies_ENotPermitted">ENotPermitted</a>);
}
</code></pre>



</details>
