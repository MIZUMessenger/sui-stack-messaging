
<a name="messaging_messaging"></a>

# Module `messaging::messaging`

Module: messaging

Public-facing module for the messaging package. All external interactions
should go through this module.

Wraps <code>permissions_group</code> to provide messaging-specific permission management
and <code><a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a></code> for key rotation.


<a name="@Permissions_0"></a>

### Permissions


From groups (auto-granted to creator):
- <code>Administrator</code>: Super-admin role that can grant/revoke all permissions
- <code>ExtensionPermissionsManager</code>: Can grant/revoke extension permissions

Messaging-specific:
- <code><a href="../messaging/messaging.md#messaging_messaging_MessagingSender">MessagingSender</a></code>: Send messages
- <code><a href="../messaging/messaging.md#messaging_messaging_MessagingReader">MessagingReader</a></code>: Read/decrypt messages
- <code><a href="../messaging/messaging.md#messaging_messaging_MessagingEditor">MessagingEditor</a></code>: Edit messages
- <code><a href="../messaging/messaging.md#messaging_messaging_MessagingDeleter">MessagingDeleter</a></code>: Delete messages
- <code>EncryptionKeyRotator</code>: Rotate encryption keys


<a name="@Security_1"></a>

### Security


- Membership is defined by having at least one permission
- Granting a permission implicitly adds the member if they don't exist
- Revoking the last permission automatically removes the member


    -  [Permissions](#@Permissions_0)
    -  [Security](#@Security_1)
-  [Struct `MESSAGING`](#messaging_messaging_MESSAGING)
-  [Struct `Messaging`](#messaging_messaging_Messaging)
-  [Struct `MessagingSender`](#messaging_messaging_MessagingSender)
-  [Struct `MessagingReader`](#messaging_messaging_MessagingReader)
-  [Struct `MessagingDeleter`](#messaging_messaging_MessagingDeleter)
-  [Struct `MessagingEditor`](#messaging_messaging_MessagingEditor)
-  [Struct `MessagingNamespace`](#messaging_messaging_MessagingNamespace)
-  [Constants](#@Constants_2)
-  [Function `init`](#messaging_messaging_init)
-  [Function `create_group`](#messaging_messaging_create_group)
    -  [Parameters](#@Parameters_3)
    -  [Returns](#@Returns_4)
    -  [Note](#@Note_5)
    -  [Aborts](#@Aborts_6)
-  [Function `create_and_share_group`](#messaging_messaging_create_and_share_group)
    -  [Parameters](#@Parameters_7)
    -  [Note](#@Note_8)
-  [Function `rotate_encryption_key`](#messaging_messaging_rotate_encryption_key)
    -  [Parameters](#@Parameters_9)
    -  [Aborts](#@Aborts_10)
-  [Function `grant_all_messaging_permissions`](#messaging_messaging_grant_all_messaging_permissions)
    -  [Parameters](#@Parameters_11)
    -  [Aborts](#@Aborts_12)
-  [Function `grant_all_permissions`](#messaging_messaging_grant_all_permissions)
    -  [Parameters](#@Parameters_13)
    -  [Aborts](#@Aborts_14)


<pre><code><b>use</b> <a href="../messaging/encryption_history.md#messaging_encryption_history">messaging::encryption_history</a>;
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



<a name="messaging_messaging_MESSAGING"></a>

## Struct `MESSAGING`

One-Time Witness for claiming Publisher.


<pre><code><b>public</b> <b>struct</b> <a href="../messaging/messaging.md#messaging_messaging_MESSAGING">MESSAGING</a> <b>has</b> drop
</code></pre>



<details>
<summary>Fields</summary>


<dl>
</dl>


</details>

<a name="messaging_messaging_Messaging"></a>

## Struct `Messaging`

Package witness for <code>PermissionedGroup&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>&gt;</code>.


<pre><code><b>public</b> <b>struct</b> <a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a> <b>has</b> drop
</code></pre>



<details>
<summary>Fields</summary>


<dl>
</dl>


</details>

<a name="messaging_messaging_MessagingSender"></a>

## Struct `MessagingSender`

Permission to send messages to the group.
Separate from <code><a href="../messaging/messaging.md#messaging_messaging_MessagingReader">MessagingReader</a></code> to enable mute functionality.


<pre><code><b>public</b> <b>struct</b> <a href="../messaging/messaging.md#messaging_messaging_MessagingSender">MessagingSender</a> <b>has</b> drop
</code></pre>



<details>
<summary>Fields</summary>


<dl>
</dl>


</details>

<a name="messaging_messaging_MessagingReader"></a>

## Struct `MessagingReader`

Permission to read/decrypt messages from the group.
Separate from <code><a href="../messaging/messaging.md#messaging_messaging_MessagingSender">MessagingSender</a></code> to enable read-only or write-only access.


<pre><code><b>public</b> <b>struct</b> <a href="../messaging/messaging.md#messaging_messaging_MessagingReader">MessagingReader</a> <b>has</b> drop
</code></pre>



<details>
<summary>Fields</summary>


<dl>
</dl>


</details>

<a name="messaging_messaging_MessagingDeleter"></a>

## Struct `MessagingDeleter`

Permission to delete messages in the group.


<pre><code><b>public</b> <b>struct</b> <a href="../messaging/messaging.md#messaging_messaging_MessagingDeleter">MessagingDeleter</a> <b>has</b> drop
</code></pre>



<details>
<summary>Fields</summary>


<dl>
</dl>


</details>

<a name="messaging_messaging_MessagingEditor"></a>

## Struct `MessagingEditor`

Permission to edit messages in the group.


<pre><code><b>public</b> <b>struct</b> <a href="../messaging/messaging.md#messaging_messaging_MessagingEditor">MessagingEditor</a> <b>has</b> drop
</code></pre>



<details>
<summary>Fields</summary>


<dl>
</dl>


</details>

<a name="messaging_messaging_MessagingNamespace"></a>

## Struct `MessagingNamespace`

Shared object used as namespace for deriving group and encryption history addresses.
One per package deployment.


<pre><code><b>public</b> <b>struct</b> <a href="../messaging/messaging.md#messaging_messaging_MessagingNamespace">MessagingNamespace</a> <b>has</b> key
</code></pre>



<details>
<summary>Fields</summary>


<dl>
<dt>
<code>id: <a href="../dependencies/sui/object.md#sui_object_UID">sui::object::UID</a></code>
</dt>
<dd>
</dd>
</dl>


</details>

<a name="@Constants_2"></a>

## Constants


<a name="messaging_messaging_ENotPermitted"></a>

Caller lacks the required permission for the operation.


<pre><code><b>const</b> <a href="../messaging/messaging.md#messaging_messaging_ENotPermitted">ENotPermitted</a>: u64 = 0;
</code></pre>



<a name="messaging_messaging_init"></a>

## Function `init`



<pre><code><b>fun</b> <a href="../messaging/messaging.md#messaging_messaging_init">init</a>(otw: <a href="../messaging/messaging.md#messaging_messaging_MESSAGING">messaging::messaging::MESSAGING</a>, ctx: &<b>mut</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>fun</b> <a href="../messaging/messaging.md#messaging_messaging_init">init</a>(otw: <a href="../messaging/messaging.md#messaging_messaging_MESSAGING">MESSAGING</a>, ctx: &<b>mut</b> TxContext) {
    package::claim_and_keep(otw, ctx);
    transfer::share_object(<a href="../messaging/messaging.md#messaging_messaging_MessagingNamespace">MessagingNamespace</a> {
        id: object::new(ctx),
    });
}
</code></pre>



</details>

<a name="messaging_messaging_create_group"></a>

## Function `create_group`

Creates a new messaging group with encryption.
The transaction sender (<code>ctx.sender()</code>) automatically becomes the creator with all permissions.


<a name="@Parameters_3"></a>

### Parameters

- <code>namespace</code>: Mutable reference to the MessagingNamespace
- <code>uuid</code>: Client-provided UUID for deterministic address derivation
- <code>initial_encrypted_dek</code>: Initial Seal-encrypted DEK bytes
- <code>initial_members</code>: Addresses to grant <code><a href="../messaging/messaging.md#messaging_messaging_MessagingReader">MessagingReader</a></code> permission (should not include
creator)
- <code>ctx</code>: Transaction context


<a name="@Returns_4"></a>

### Returns

Tuple of <code>(PermissionedGroup&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>&gt;, EncryptionHistory)</code>.


<a name="@Note_5"></a>

### Note

If <code>initial_members</code> contains the creator's address, it is silently skipped (no abort).
This handles the common case where the creator might be mistakenly included in the initial
members list.


<a name="@Aborts_6"></a>

### Aborts

- If the UUID has already been used (duplicate derivation)


<pre><code><b>public</b> <b>fun</b> <a href="../messaging/messaging.md#messaging_messaging_create_group">create_group</a>(namespace: &<b>mut</b> <a href="../messaging/messaging.md#messaging_messaging_MessagingNamespace">messaging::messaging::MessagingNamespace</a>, uuid: <a href="../dependencies/std/string.md#std_string_String">std::string::String</a>, initial_encrypted_dek: vector&lt;u8&gt;, initial_members: <a href="../dependencies/sui/vec_set.md#sui_vec_set_VecSet">sui::vec_set::VecSet</a>&lt;<b>address</b>&gt;, ctx: &<b>mut</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>): (<a href="../dependencies/permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">messaging::messaging::Messaging</a>&gt;, <a href="../messaging/encryption_history.md#messaging_encryption_history_EncryptionHistory">messaging::encryption_history::EncryptionHistory</a>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../messaging/messaging.md#messaging_messaging_create_group">create_group</a>(
    namespace: &<b>mut</b> <a href="../messaging/messaging.md#messaging_messaging_MessagingNamespace">MessagingNamespace</a>,
    uuid: String,
    initial_encrypted_dek: vector&lt;u8&gt;,
    initial_members: VecSet&lt;<b>address</b>&gt;,
    ctx: &<b>mut</b> TxContext,
): (PermissionedGroup&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>&gt;, EncryptionHistory) {
    <b>let</b> <b>mut</b> group: PermissionedGroup&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>&gt; = permissioned_group::new_derived&lt;
        <a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>,
        <a href="../messaging/encryption_history.md#messaging_encryption_history_PermissionedGroupTag">encryption_history::PermissionedGroupTag</a>,
    &gt;(
        <a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>(),
        &<b>mut</b> namespace.id,
        <a href="../messaging/encryption_history.md#messaging_encryption_history_permissions_group_tag">encryption_history::permissions_group_tag</a>(uuid),
        ctx,
    );
    <b>let</b> creator = ctx.sender();
    <a href="../messaging/messaging.md#messaging_messaging_grant_all_messaging_permissions">grant_all_messaging_permissions</a>(&<b>mut</b> group, creator, ctx);
    // Grant <a href="../messaging/messaging.md#messaging_messaging_MessagingReader">MessagingReader</a> permission to initial members (skip creator)
    initial_members.into_keys().do!(|member| {
        <b>if</b> (member != creator) {
            group.grant_permission&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>, <a href="../messaging/messaging.md#messaging_messaging_MessagingReader">MessagingReader</a>&gt;(member, ctx);
        };
    });
    <b>let</b> <a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a> = <a href="../messaging/encryption_history.md#messaging_encryption_history_new">encryption_history::new</a>(
        &<b>mut</b> namespace.id,
        uuid,
        object::id(&group),
        initial_encrypted_dek,
        ctx,
    );
    (group, <a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a>)
}
</code></pre>



</details>

<a name="messaging_messaging_create_and_share_group"></a>

## Function `create_and_share_group`

Creates a new messaging group and shares both objects.


<a name="@Parameters_7"></a>

### Parameters

- <code>namespace</code>: Mutable reference to the MessagingNamespace
- <code>uuid</code>: Client-provided UUID for deterministic address derivation
- <code>initial_encrypted_dek</code>: Initial Seal-encrypted DEK bytes
- <code>initial_members</code>: Set of addresses to grant <code><a href="../messaging/messaging.md#messaging_messaging_MessagingReader">MessagingReader</a></code> permission
- <code>ctx</code>: Transaction context


<a name="@Note_8"></a>

### Note

See <code><a href="../messaging/messaging.md#messaging_messaging_create_group">create_group</a></code> for details on creator permissions and initial member handling.


<pre><code><b>public</b> <b>fun</b> <a href="../messaging/messaging.md#messaging_messaging_create_and_share_group">create_and_share_group</a>(namespace: &<b>mut</b> <a href="../messaging/messaging.md#messaging_messaging_MessagingNamespace">messaging::messaging::MessagingNamespace</a>, uuid: <a href="../dependencies/std/string.md#std_string_String">std::string::String</a>, initial_encrypted_dek: vector&lt;u8&gt;, initial_members: <a href="../dependencies/sui/vec_set.md#sui_vec_set_VecSet">sui::vec_set::VecSet</a>&lt;<b>address</b>&gt;, ctx: &<b>mut</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../messaging/messaging.md#messaging_messaging_create_and_share_group">create_and_share_group</a>(
    namespace: &<b>mut</b> <a href="../messaging/messaging.md#messaging_messaging_MessagingNamespace">MessagingNamespace</a>,
    uuid: String,
    initial_encrypted_dek: vector&lt;u8&gt;,
    initial_members: VecSet&lt;<b>address</b>&gt;,
    ctx: &<b>mut</b> TxContext,
) {
    <b>let</b> (group, <a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a>) = <a href="../messaging/messaging.md#messaging_messaging_create_group">create_group</a>(
        namespace,
        uuid,
        initial_encrypted_dek,
        initial_members,
        ctx,
    );
    transfer::public_share_object(group);
    transfer::public_share_object(<a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a>);
}
</code></pre>



</details>

<a name="messaging_messaging_rotate_encryption_key"></a>

## Function `rotate_encryption_key`

Rotates the encryption key for a group.


<a name="@Parameters_9"></a>

### Parameters

- <code><a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a></code>: Mutable reference to the group's EncryptionHistory
- <code>group</code>: Reference to the PermissionedGroup<Messaging>
- <code>new_encrypted_dek</code>: New Seal-encrypted DEK bytes
- <code>ctx</code>: Transaction context


<a name="@Aborts_10"></a>

### Aborts

- <code><a href="../messaging/messaging.md#messaging_messaging_ENotPermitted">ENotPermitted</a></code>: if caller doesn't have <code>EncryptionKeyRotator</code> permission


<pre><code><b>public</b> <b>fun</b> <a href="../messaging/messaging.md#messaging_messaging_rotate_encryption_key">rotate_encryption_key</a>(<a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a>: &<b>mut</b> <a href="../messaging/encryption_history.md#messaging_encryption_history_EncryptionHistory">messaging::encryption_history::EncryptionHistory</a>, group: &<a href="../dependencies/permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">messaging::messaging::Messaging</a>&gt;, new_encrypted_dek: vector&lt;u8&gt;, ctx: &<b>mut</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../messaging/messaging.md#messaging_messaging_rotate_encryption_key">rotate_encryption_key</a>(
    <a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a>: &<b>mut</b> EncryptionHistory,
    group: &PermissionedGroup&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>&gt;,
    new_encrypted_dek: vector&lt;u8&gt;,
    ctx: &<b>mut</b> TxContext,
) {
    <b>assert</b>!(group.has_permission&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>, EncryptionKeyRotator&gt;(ctx.sender()), <a href="../messaging/messaging.md#messaging_messaging_ENotPermitted">ENotPermitted</a>);
    <a href="../messaging/encryption_history.md#messaging_encryption_history">encryption_history</a>.rotate_key(new_encrypted_dek);
}
</code></pre>



</details>

<a name="messaging_messaging_grant_all_messaging_permissions"></a>

## Function `grant_all_messaging_permissions`

Grants all messaging permissions to a member.
Includes: <code><a href="../messaging/messaging.md#messaging_messaging_MessagingSender">MessagingSender</a></code>, <code><a href="../messaging/messaging.md#messaging_messaging_MessagingReader">MessagingReader</a></code>, <code><a href="../messaging/messaging.md#messaging_messaging_MessagingEditor">MessagingEditor</a></code>,
<code><a href="../messaging/messaging.md#messaging_messaging_MessagingDeleter">MessagingDeleter</a></code>, <code>EncryptionKeyRotator</code>.


<a name="@Parameters_11"></a>

### Parameters

- <code>group</code>: Mutable reference to the PermissionedGroup<Messaging>
- <code>member</code>: Address to grant permissions to
- <code>ctx</code>: Transaction context


<a name="@Aborts_12"></a>

### Aborts

- <code><a href="../messaging/messaging.md#messaging_messaging_ENotPermitted">ENotPermitted</a></code> (from <code>permissioned_group</code>): if caller doesn't have <code>Administrator</code>
or <code>ExtensionPermissionsManager</code> permission


<pre><code><b>public</b> <b>fun</b> <a href="../messaging/messaging.md#messaging_messaging_grant_all_messaging_permissions">grant_all_messaging_permissions</a>(group: &<b>mut</b> <a href="../dependencies/permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">messaging::messaging::Messaging</a>&gt;, member: <b>address</b>, ctx: &<b>mut</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../messaging/messaging.md#messaging_messaging_grant_all_messaging_permissions">grant_all_messaging_permissions</a>(
    group: &<b>mut</b> PermissionedGroup&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>&gt;,
    member: <b>address</b>,
    ctx: &<b>mut</b> TxContext,
) {
    group.grant_permission&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>, <a href="../messaging/messaging.md#messaging_messaging_MessagingSender">MessagingSender</a>&gt;(member, ctx);
    group.grant_permission&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>, <a href="../messaging/messaging.md#messaging_messaging_MessagingReader">MessagingReader</a>&gt;(member, ctx);
    group.grant_permission&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>, <a href="../messaging/messaging.md#messaging_messaging_MessagingEditor">MessagingEditor</a>&gt;(member, ctx);
    group.grant_permission&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>, <a href="../messaging/messaging.md#messaging_messaging_MessagingDeleter">MessagingDeleter</a>&gt;(member, ctx);
    group.grant_permission&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>, EncryptionKeyRotator&gt;(member, ctx);
}
</code></pre>



</details>

<a name="messaging_messaging_grant_all_permissions"></a>

## Function `grant_all_permissions`

Grants all permissions (Administrator, ExtensionPermissionsManager + messaging) to a member,
making them an admin.


<a name="@Parameters_13"></a>

### Parameters

- <code>group</code>: Mutable reference to the PermissionedGroup<Messaging>
- <code>member</code>: Address to grant permissions to
- <code>ctx</code>: Transaction context


<a name="@Aborts_14"></a>

### Aborts

- <code><a href="../messaging/messaging.md#messaging_messaging_ENotPermitted">ENotPermitted</a></code> (from <code>permissions_group</code>): if caller doesn't have <code>Administrator</code> permission


<pre><code><b>public</b> <b>fun</b> <a href="../messaging/messaging.md#messaging_messaging_grant_all_permissions">grant_all_permissions</a>(group: &<b>mut</b> <a href="../dependencies/permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">messaging::messaging::Messaging</a>&gt;, member: <b>address</b>, ctx: &<b>mut</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../messaging/messaging.md#messaging_messaging_grant_all_permissions">grant_all_permissions</a>(
    group: &<b>mut</b> PermissionedGroup&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>&gt;,
    member: <b>address</b>,
    ctx: &<b>mut</b> TxContext,
) {
    group.grant_permission&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>, Administrator&gt;(member, ctx);
    group.grant_permission&lt;<a href="../messaging/messaging.md#messaging_messaging_Messaging">Messaging</a>, ExtensionPermissionsManager&gt;(member, ctx);
    <a href="../messaging/messaging.md#messaging_messaging_grant_all_messaging_permissions">grant_all_messaging_permissions</a>(group, member, ctx);
}
</code></pre>



</details>
