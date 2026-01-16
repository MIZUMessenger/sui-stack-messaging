
<a name="permissioned_groups_permissioned_group"></a>

# Module `permissioned_groups::permissioned_group`

Module: permissioned_group

Generic permission system for group management.


<a name="@Permissions_0"></a>

### Permissions


- <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code>: Super-admin role that can grant/revoke all permissions and remove members
- <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ExtensionPermissionsManager">ExtensionPermissionsManager</a></code>: Can grant/revoke extension permissions (permissions defined in
third-party packages)


<a name="@Key_Concepts_1"></a>

### Key Concepts


- **Membership is defined by permissions**: A member exists if and only if they have at least
one permission
- **Granting implicitly adds**: <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_grant_permission">grant_permission</a>()</code> will automatically add a member if they
don't exist
- **Revoking may remove**: Revoking the last permission automatically removes the member from
the group
- **Permission hierarchy**: Only <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> can grant/revoke <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code>; all other
permissions can be managed by either <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> or <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ExtensionPermissionsManager">ExtensionPermissionsManager</a></code>


<a name="@Invariants_2"></a>

### Invariants


- At least one <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> must always exist
- Members always have at least one permission (empty permission sets are not allowed)


    -  [Permissions](#@Permissions_0)
    -  [Key Concepts](#@Key_Concepts_1)
    -  [Invariants](#@Invariants_2)
-  [Struct `Administrator`](#permissioned_groups_permissioned_group_Administrator)
-  [Struct `ExtensionPermissionsManager`](#permissioned_groups_permissioned_group_ExtensionPermissionsManager)
-  [Struct `PermissionedGroup`](#permissioned_groups_permissioned_group_PermissionedGroup)
-  [Struct `GroupCreated`](#permissioned_groups_permissioned_group_GroupCreated)
-  [Struct `GroupDerived`](#permissioned_groups_permissioned_group_GroupDerived)
-  [Struct `MemberAdded`](#permissioned_groups_permissioned_group_MemberAdded)
-  [Struct `MemberRemoved`](#permissioned_groups_permissioned_group_MemberRemoved)
-  [Struct `PermissionsGranted`](#permissioned_groups_permissioned_group_PermissionsGranted)
-  [Struct `PermissionsRevoked`](#permissioned_groups_permissioned_group_PermissionsRevoked)
-  [Constants](#@Constants_3)
-  [Function `new`](#permissioned_groups_permissioned_group_new)
    -  [Type Parameters](#@Type_Parameters_4)
    -  [Parameters](#@Parameters_5)
    -  [Returns](#@Returns_6)
-  [Function `new_derived`](#permissioned_groups_permissioned_group_new_derived)
    -  [Type Parameters](#@Type_Parameters_7)
    -  [Parameters](#@Parameters_8)
    -  [Returns](#@Returns_9)
    -  [Aborts](#@Aborts_10)
-  [Function `grant_permission`](#permissioned_groups_permissioned_group_grant_permission)
    -  [Type Parameters](#@Type_Parameters_11)
    -  [Parameters](#@Parameters_12)
    -  [Aborts](#@Aborts_13)
-  [Function `object_grant_permission`](#permissioned_groups_permissioned_group_object_grant_permission)
    -  [Type Parameters](#@Type_Parameters_14)
    -  [Parameters](#@Parameters_15)
    -  [Aborts](#@Aborts_16)
-  [Function `remove_member`](#permissioned_groups_permissioned_group_remove_member)
    -  [Parameters](#@Parameters_17)
    -  [Aborts](#@Aborts_18)
-  [Function `object_remove_member`](#permissioned_groups_permissioned_group_object_remove_member)
    -  [Parameters](#@Parameters_19)
    -  [Aborts](#@Aborts_20)
-  [Function `revoke_permission`](#permissioned_groups_permissioned_group_revoke_permission)
    -  [Type Parameters](#@Type_Parameters_21)
    -  [Parameters](#@Parameters_22)
    -  [Aborts](#@Aborts_23)
-  [Function `object_revoke_permission`](#permissioned_groups_permissioned_group_object_revoke_permission)
    -  [Type Parameters](#@Type_Parameters_24)
    -  [Parameters](#@Parameters_25)
    -  [Aborts](#@Aborts_26)
-  [Function `has_permission`](#permissioned_groups_permissioned_group_has_permission)
    -  [Type Parameters](#@Type_Parameters_27)
    -  [Parameters](#@Parameters_28)
    -  [Returns](#@Returns_29)
-  [Function `is_member`](#permissioned_groups_permissioned_group_is_member)
    -  [Parameters](#@Parameters_30)
    -  [Returns](#@Returns_31)
-  [Function `creator`](#permissioned_groups_permissioned_group_creator)
    -  [Parameters](#@Parameters_32)
    -  [Returns](#@Returns_33)
-  [Function `administrators_count`](#permissioned_groups_permissioned_group_administrators_count)
    -  [Parameters](#@Parameters_34)
    -  [Returns](#@Returns_35)
-  [Function `assert_can_manage_permission`](#permissioned_groups_permissioned_group_assert_can_manage_permission)
-  [Function `internal_add_member`](#permissioned_groups_permissioned_group_internal_add_member)
-  [Function `safe_decrement_administrators_count`](#permissioned_groups_permissioned_group_safe_decrement_administrators_count)
-  [Function `internal_grant_permission`](#permissioned_groups_permissioned_group_internal_grant_permission)
-  [Function `internal_revoke_permission`](#permissioned_groups_permissioned_group_internal_revoke_permission)


<pre><code><b>use</b> <a href="../dependencies/std/address.md#std_address">std::address</a>;
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
<b>use</b> <a href="../dependencies/sui/transfer.md#sui_transfer">sui::transfer</a>;
<b>use</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context">sui::tx_context</a>;
<b>use</b> <a href="../dependencies/sui/vec_map.md#sui_vec_map">sui::vec_map</a>;
<b>use</b> <a href="../dependencies/sui/vec_set.md#sui_vec_set">sui::vec_set</a>;
</code></pre>



<a name="permissioned_groups_permissioned_group_Administrator"></a>

## Struct `Administrator`

Permission to manage all permissions defined in the groups package.
This is the super-admin role that can:
- Grant/revoke all permissions (including other Administrators)
- Remove members from the group


<pre><code><b>public</b> <b>struct</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a> <b>has</b> drop
</code></pre>



<details>
<summary>Fields</summary>


<dl>
</dl>


</details>

<a name="permissioned_groups_permissioned_group_ExtensionPermissionsManager"></a>

## Struct `ExtensionPermissionsManager`

Permission to manage extension permissions defined in third-party packages.
Can grant/revoke extension permissions but NOT <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code>.
This provides a safer delegation model for package-specific permissions.


<pre><code><b>public</b> <b>struct</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ExtensionPermissionsManager">ExtensionPermissionsManager</a> <b>has</b> drop
</code></pre>



<details>
<summary>Fields</summary>


<dl>
</dl>


</details>

<a name="permissioned_groups_permissioned_group_PermissionedGroup"></a>

## Struct `PermissionedGroup`

Group state mapping addresses to their granted permissions.
Parameterized by <code>T</code> to scope permissions to a specific package.


<pre><code><b>public</b> <b>struct</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;<b>phantom</b> T: drop&gt; <b>has</b> key, store
</code></pre>



<details>
<summary>Fields</summary>


<dl>
<dt>
<code>id: <a href="../dependencies/sui/object.md#sui_object_UID">sui::object::UID</a></code>
</dt>
<dd>
</dd>
<dt>
<code>permissions: <a href="../dependencies/sui/table.md#sui_table_Table">sui::table::Table</a>&lt;<b>address</b>, <a href="../dependencies/sui/vec_set.md#sui_vec_set_VecSet">sui::vec_set::VecSet</a>&lt;<a href="../dependencies/std/type_name.md#std_type_name_TypeName">std::type_name::TypeName</a>&gt;&gt;</code>
</dt>
<dd>
 Maps member addresses (user or object) to their permission set.
 Object addresses enable <code>object_*</code> functions for third-party "actor" contracts.
</dd>
<dt>
<code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_administrators_count">administrators_count</a>: u64</code>
</dt>
<dd>
 Tracks <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> count to enforce at-least-one invariant.
</dd>
<dt>
<code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_creator">creator</a>: <b>address</b></code>
</dt>
<dd>
 Original creator's address
</dd>
</dl>


</details>

<a name="permissioned_groups_permissioned_group_GroupCreated"></a>

## Struct `GroupCreated`

Emitted when a new PermissionedGroup is created via <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_new">new</a></code>.


<pre><code><b>public</b> <b>struct</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_GroupCreated">GroupCreated</a>&lt;<b>phantom</b> T&gt; <b>has</b> <b>copy</b>, drop
</code></pre>



<details>
<summary>Fields</summary>


<dl>
<dt>
<code>group_id: <a href="../dependencies/sui/object.md#sui_object_ID">sui::object::ID</a></code>
</dt>
<dd>
 ID of the created group.
</dd>
<dt>
<code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_creator">creator</a>: <b>address</b></code>
</dt>
<dd>
 Address of the group creator.
</dd>
</dl>


</details>

<a name="permissioned_groups_permissioned_group_GroupDerived"></a>

## Struct `GroupDerived`

Emitted when a new PermissionedGroup is created via <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_new_derived">new_derived</a></code>.


<pre><code><b>public</b> <b>struct</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_GroupDerived">GroupDerived</a>&lt;<b>phantom</b> T&gt; <b>has</b> <b>copy</b>, drop
</code></pre>



<details>
<summary>Fields</summary>


<dl>
<dt>
<code>group_id: <a href="../dependencies/sui/object.md#sui_object_ID">sui::object::ID</a></code>
</dt>
<dd>
 ID of the created group.
</dd>
<dt>
<code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_creator">creator</a>: <b>address</b></code>
</dt>
<dd>
 Address of the group creator.
</dd>
<dt>
<code>parent_id: <a href="../dependencies/sui/object.md#sui_object_ID">sui::object::ID</a></code>
</dt>
<dd>
 ID of the parent object from which the group was derived.
</dd>
<dt>
<code>derivation_key_type: <a href="../dependencies/std/type_name.md#std_type_name_TypeName">std::type_name::TypeName</a></code>
</dt>
<dd>
 Type name of the derivation key used.
</dd>
</dl>


</details>

<a name="permissioned_groups_permissioned_group_MemberAdded"></a>

## Struct `MemberAdded`

Emitted when a new member is added to a group via grant_permission.


<pre><code><b>public</b> <b>struct</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_MemberAdded">MemberAdded</a>&lt;<b>phantom</b> T&gt; <b>has</b> <b>copy</b>, drop
</code></pre>



<details>
<summary>Fields</summary>


<dl>
<dt>
<code>group_id: <a href="../dependencies/sui/object.md#sui_object_ID">sui::object::ID</a></code>
</dt>
<dd>
 ID of the group.
</dd>
<dt>
<code>member: <b>address</b></code>
</dt>
<dd>
 Address of the new member.
</dd>
</dl>


</details>

<a name="permissioned_groups_permissioned_group_MemberRemoved"></a>

## Struct `MemberRemoved`

Emitted when a member is removed from a group.


<pre><code><b>public</b> <b>struct</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_MemberRemoved">MemberRemoved</a>&lt;<b>phantom</b> T&gt; <b>has</b> <b>copy</b>, drop
</code></pre>



<details>
<summary>Fields</summary>


<dl>
<dt>
<code>group_id: <a href="../dependencies/sui/object.md#sui_object_ID">sui::object::ID</a></code>
</dt>
<dd>
 ID of the group.
</dd>
<dt>
<code>member: <b>address</b></code>
</dt>
<dd>
 Address of the removed member.
</dd>
</dl>


</details>

<a name="permissioned_groups_permissioned_group_PermissionsGranted"></a>

## Struct `PermissionsGranted`

Emitted when permissions are granted to a member.


<pre><code><b>public</b> <b>struct</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionsGranted">PermissionsGranted</a>&lt;<b>phantom</b> T&gt; <b>has</b> <b>copy</b>, drop
</code></pre>



<details>
<summary>Fields</summary>


<dl>
<dt>
<code>group_id: <a href="../dependencies/sui/object.md#sui_object_ID">sui::object::ID</a></code>
</dt>
<dd>
 ID of the group.
</dd>
<dt>
<code>member: <b>address</b></code>
</dt>
<dd>
 Address of the member receiving the permissions.
</dd>
<dt>
<code>permissions: vector&lt;<a href="../dependencies/std/type_name.md#std_type_name_TypeName">std::type_name::TypeName</a>&gt;</code>
</dt>
<dd>
 Type names of the granted permissions.
</dd>
</dl>


</details>

<a name="permissioned_groups_permissioned_group_PermissionsRevoked"></a>

## Struct `PermissionsRevoked`

Emitted when permissions are revoked from a member.


<pre><code><b>public</b> <b>struct</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionsRevoked">PermissionsRevoked</a>&lt;<b>phantom</b> T&gt; <b>has</b> <b>copy</b>, drop
</code></pre>



<details>
<summary>Fields</summary>


<dl>
<dt>
<code>group_id: <a href="../dependencies/sui/object.md#sui_object_ID">sui::object::ID</a></code>
</dt>
<dd>
 ID of the group.
</dd>
<dt>
<code>member: <b>address</b></code>
</dt>
<dd>
 Address of the member losing the permissions.
</dd>
<dt>
<code>permissions: vector&lt;<a href="../dependencies/std/type_name.md#std_type_name_TypeName">std::type_name::TypeName</a>&gt;</code>
</dt>
<dd>
 Type names of the revoked permissions.
</dd>
</dl>


</details>

<a name="@Constants_3"></a>

## Constants


<a name="permissioned_groups_permissioned_group_ENotPermitted"></a>



<pre><code><b>const</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ENotPermitted">ENotPermitted</a>: u64 = 0;
</code></pre>



<a name="permissioned_groups_permissioned_group_EMemberNotFound"></a>



<pre><code><b>const</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_EMemberNotFound">EMemberNotFound</a>: u64 = 1;
</code></pre>



<a name="permissioned_groups_permissioned_group_ELastAdministrator"></a>



<pre><code><b>const</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ELastAdministrator">ELastAdministrator</a>: u64 = 2;
</code></pre>



<a name="permissioned_groups_permissioned_group_EPermissionedGroupAlreadyExists"></a>



<pre><code><b>const</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_EPermissionedGroupAlreadyExists">EPermissionedGroupAlreadyExists</a>: u64 = 3;
</code></pre>



<a name="permissioned_groups_permissioned_group_new"></a>

## Function `new`

Creates a new PermissionedGroup with the sender as initial admin.
Grants <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> and <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ExtensionPermissionsManager">ExtensionPermissionsManager</a></code> to creator.


<a name="@Type_Parameters_4"></a>

### Type Parameters

- <code>T</code>: Package witness type to scope permissions


<a name="@Parameters_5"></a>

### Parameters

- <code>ctx</code>: Transaction context


<a name="@Returns_6"></a>

### Returns

A new <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt;</code> with sender having <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> and <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ExtensionPermissionsManager">ExtensionPermissionsManager</a></code>.


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_new">new</a>&lt;T: drop&gt;(ctx: &<b>mut</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>): <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;T&gt;
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_new">new</a>&lt;T: drop&gt;(ctx: &<b>mut</b> TxContext): <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt; {
    <b>let</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_creator">creator</a> = ctx.sender();
    // Initialize <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_creator">creator</a> with <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a> and <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ExtensionPermissionsManager">ExtensionPermissionsManager</a>
    <b>let</b> <b>mut</b> creator_permissions = vec_set::empty&lt;TypeName&gt;();
    creator_permissions.insert(type_name::with_defining_ids&lt;<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a>&gt;());
    creator_permissions.insert(type_name::with_defining_ids&lt;<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ExtensionPermissionsManager">ExtensionPermissionsManager</a>&gt;());
    <b>let</b> <b>mut</b> permissions_table = table::new&lt;<b>address</b>, VecSet&lt;TypeName&gt;&gt;(ctx);
    permissions_table.add(<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_creator">creator</a>, creator_permissions);
    <b>let</b> group = <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt; {
        id: object::new(ctx),
        permissions: permissions_table,
        <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_administrators_count">administrators_count</a>: 1,
        <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_creator">creator</a>,
    };
    event::emit(<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_GroupCreated">GroupCreated</a>&lt;T&gt; {
        group_id: object::id(&group),
        <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_creator">creator</a>,
    });
    group
}
</code></pre>



</details>

<a name="permissioned_groups_permissioned_group_new_derived"></a>

## Function `new_derived`

Creates a new derived PermissionedGroup with deterministic address.
Grants <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> and <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ExtensionPermissionsManager">ExtensionPermissionsManager</a></code> to creator.


<a name="@Type_Parameters_7"></a>

### Type Parameters

- <code>T</code>: Package witness type to scope permissions
- <code>DerivationKey</code>: Key type for address derivation


<a name="@Parameters_8"></a>

### Parameters

- <code>derivation_uid</code>: Mutable reference to the parent UID for derivation
- <code>derivation_key</code>: Key used for deterministic address derivation
- <code>ctx</code>: Transaction context


<a name="@Returns_9"></a>

### Returns

A new <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt;</code> with derived address.


<a name="@Aborts_10"></a>

### Aborts

- <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_EPermissionedGroupAlreadyExists">EPermissionedGroupAlreadyExists</a></code>: if derived address is already claimed


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_new_derived">new_derived</a>&lt;T: drop, DerivationKey: <b>copy</b>, drop, store&gt;(derivation_uid: &<b>mut</b> <a href="../dependencies/sui/object.md#sui_object_UID">sui::object::UID</a>, derivation_key: DerivationKey, ctx: &<b>mut</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>): <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;T&gt;
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_new_derived">new_derived</a>&lt;T: drop, DerivationKey: <b>copy</b> + drop + store&gt;(
    derivation_uid: &<b>mut</b> UID,
    derivation_key: DerivationKey,
    ctx: &<b>mut</b> TxContext,
): <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt; {
    <b>assert</b>!(
        !derived_object::exists(derivation_uid, derivation_key),
        <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_EPermissionedGroupAlreadyExists">EPermissionedGroupAlreadyExists</a>,
    );
    <b>let</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_creator">creator</a> = ctx.sender();
    // Initialize <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_creator">creator</a> with <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a> and <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ExtensionPermissionsManager">ExtensionPermissionsManager</a>
    <b>let</b> <b>mut</b> creator_permissions = vec_set::empty&lt;TypeName&gt;();
    creator_permissions.insert(type_name::with_defining_ids&lt;<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a>&gt;());
    creator_permissions.insert(type_name::with_defining_ids&lt;<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ExtensionPermissionsManager">ExtensionPermissionsManager</a>&gt;());
    <b>let</b> <b>mut</b> permissions_table = table::new&lt;<b>address</b>, VecSet&lt;TypeName&gt;&gt;(ctx);
    permissions_table.add(<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_creator">creator</a>, creator_permissions);
    <b>let</b> group = <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt; {
        id: derived_object::claim(derivation_uid, derivation_key),
        permissions: permissions_table,
        <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_administrators_count">administrators_count</a>: 1,
        <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_creator">creator</a>,
    };
    event::emit(<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_GroupDerived">GroupDerived</a>&lt;T&gt; {
        group_id: object::id(&group),
        <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_creator">creator</a>,
        parent_id: object::uid_to_inner(derivation_uid),
        derivation_key_type: type_name::with_defining_ids&lt;DerivationKey&gt;(),
    });
    group
}
</code></pre>



</details>

<a name="permissioned_groups_permissioned_group_grant_permission"></a>

## Function `grant_permission`

Grants a permission to a member.
If the member doesn't exist, they are automatically added to the group.
Emits both <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_MemberAdded">MemberAdded</a></code> (if new) and <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionsGranted">PermissionsGranted</a></code> events.

Permission requirements:
- To grant <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code>: caller must have <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code>
- To grant any other permission: caller must have <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> OR
<code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ExtensionPermissionsManager">ExtensionPermissionsManager</a></code>


<a name="@Type_Parameters_11"></a>

### Type Parameters

- <code>T</code>: Package witness type
- <code>NewPermission</code>: Permission type to grant


<a name="@Parameters_12"></a>

### Parameters

- <code>self</code>: Mutable reference to the PermissionedGroup
- <code>member</code>: Address of the member to grant permission to
- <code>ctx</code>: Transaction context


<a name="@Aborts_13"></a>

### Aborts

- <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ENotPermitted">ENotPermitted</a></code>: if caller doesn't have appropriate manager permission


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_grant_permission">grant_permission</a>&lt;T: drop, NewPermission: drop&gt;(self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;T&gt;, member: <b>address</b>, ctx: &<a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_grant_permission">grant_permission</a>&lt;T: drop, NewPermission: drop&gt;(
    self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt;,
    member: <b>address</b>,
    ctx: &TxContext,
) {
    // Verify caller <b>has</b> permission to grant this permission type
    self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_assert_can_manage_permission">assert_can_manage_permission</a>&lt;T, NewPermission&gt;(ctx.sender());
    // <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_internal_grant_permission">internal_grant_permission</a> handles member addition and permission granting
    self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_internal_grant_permission">internal_grant_permission</a>&lt;T, NewPermission&gt;(member);
}
</code></pre>



</details>

<a name="permissioned_groups_permissioned_group_object_grant_permission"></a>

## Function `object_grant_permission`

Grants a permission to the transaction sender via an actor object.
Enables third-party contracts to grant permissions with custom logic.
If the sender is not already a member, they are automatically added.

Permission requirements:
- To grant <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code>: actor must have <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code>
- To grant any other permission: actor must have <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> OR
<code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ExtensionPermissionsManager">ExtensionPermissionsManager</a></code>


<a name="@Type_Parameters_14"></a>

### Type Parameters

- <code>T</code>: Package witness type
- <code>NewPermission</code>: Permission type to grant


<a name="@Parameters_15"></a>

### Parameters

- <code>self</code>: Mutable reference to the PermissionedGroup
- <code>actor_object</code>: UID of the actor object with appropriate manager permission
- <code>ctx</code>: Transaction context (sender will receive the permission)


<a name="@Aborts_16"></a>

### Aborts

- <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ENotPermitted">ENotPermitted</a></code>: if actor_object doesn't have appropriate manager permission


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_object_grant_permission">object_grant_permission</a>&lt;T: drop, NewPermission: drop&gt;(self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;T&gt;, actor_object: &<a href="../dependencies/sui/object.md#sui_object_UID">sui::object::UID</a>, ctx: &<b>mut</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_object_grant_permission">object_grant_permission</a>&lt;T: drop, NewPermission: drop&gt;(
    self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt;,
    actor_object: &UID,
    ctx: &<b>mut</b> TxContext,
) {
    <b>let</b> actor_address = actor_object.to_address();
    <b>let</b> member = ctx.sender();
    // Verify actor <b>has</b> permission to grant this permission type
    self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_assert_can_manage_permission">assert_can_manage_permission</a>&lt;T, NewPermission&gt;(actor_address);
    // <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_internal_grant_permission">internal_grant_permission</a> handles member addition and permission granting
    self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_internal_grant_permission">internal_grant_permission</a>&lt;T, NewPermission&gt;(member);
}
</code></pre>



</details>

<a name="permissioned_groups_permissioned_group_remove_member"></a>

## Function `remove_member`

Removes a member from the PermissionedGroup.
Requires <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> permission as this is a powerful admin operation.


<a name="@Parameters_17"></a>

### Parameters

- <code>self</code>: Mutable reference to the PermissionedGroup
- <code>member</code>: Address of the member to remove
- <code>ctx</code>: Transaction context


<a name="@Aborts_18"></a>

### Aborts

- <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ENotPermitted">ENotPermitted</a></code>: if caller doesn't have <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> permission
- <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_EMemberNotFound">EMemberNotFound</a></code>: if member doesn't exist
- <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ELastAdministrator">ELastAdministrator</a></code>: if removing would leave no Administrators


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_remove_member">remove_member</a>&lt;T: drop&gt;(self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;T&gt;, member: <b>address</b>, ctx: &<a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_remove_member">remove_member</a>&lt;T: drop&gt;(
    self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt;,
    member: <b>address</b>,
    ctx: &TxContext,
) {
    <b>assert</b>!(self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_has_permission">has_permission</a>&lt;T, <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a>&gt;(ctx.sender()), <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ENotPermitted">ENotPermitted</a>);
    <b>assert</b>!(self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_is_member">is_member</a>&lt;T&gt;(member), <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_EMemberNotFound">EMemberNotFound</a>);
    self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_safe_decrement_administrators_count">safe_decrement_administrators_count</a>(member);
    self.permissions.remove(member);
    event::emit(<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_MemberRemoved">MemberRemoved</a>&lt;T&gt; {
        group_id: object::id(self),
        member,
    });
}
</code></pre>



</details>

<a name="permissioned_groups_permissioned_group_object_remove_member"></a>

## Function `object_remove_member`

Removes the transaction sender from the group via an actor object.
Enables third-party contracts to implement custom leave logic.
The actor object must have <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> permission on the group.


<a name="@Parameters_19"></a>

### Parameters

- <code>self</code>: Mutable reference to the PermissionedGroup
- <code>actor_object</code>: UID of the actor object with <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> permission
- <code>ctx</code>: Transaction context (sender will be removed)


<a name="@Aborts_20"></a>

### Aborts

- <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ENotPermitted">ENotPermitted</a></code>: if actor_object doesn't have <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> permission
- <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_EMemberNotFound">EMemberNotFound</a></code>: if sender is not a member
- <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ELastAdministrator">ELastAdministrator</a></code>: if removing would leave no Administrators


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_object_remove_member">object_remove_member</a>&lt;T: drop&gt;(self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;T&gt;, actor_object: &<a href="../dependencies/sui/object.md#sui_object_UID">sui::object::UID</a>, ctx: &<b>mut</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_object_remove_member">object_remove_member</a>&lt;T: drop&gt;(
    self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt;,
    actor_object: &UID,
    ctx: &<b>mut</b> TxContext,
) {
    <b>let</b> actor_address = actor_object.to_address();
    <b>assert</b>!(self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_has_permission">has_permission</a>&lt;T, <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a>&gt;(actor_address), <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ENotPermitted">ENotPermitted</a>);
    <b>let</b> member = ctx.sender();
    <b>assert</b>!(self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_is_member">is_member</a>&lt;T&gt;(member), <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_EMemberNotFound">EMemberNotFound</a>);
    self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_safe_decrement_administrators_count">safe_decrement_administrators_count</a>(member);
    self.permissions.remove(member);
    event::emit(<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_MemberRemoved">MemberRemoved</a>&lt;T&gt; {
        group_id: object::id(self),
        member,
    });
}
</code></pre>



</details>

<a name="permissioned_groups_permissioned_group_revoke_permission"></a>

## Function `revoke_permission`

Revokes a permission from a member.
If this is the member's last permission, they are automatically removed from the group.
Emits <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionsRevoked">PermissionsRevoked</a></code> and potentially <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_MemberRemoved">MemberRemoved</a></code> events.

Permission requirements:
- To revoke <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code>: caller must have <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code>
- To revoke any other permission: caller must have <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> OR
<code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ExtensionPermissionsManager">ExtensionPermissionsManager</a></code>


<a name="@Type_Parameters_21"></a>

### Type Parameters

- <code>T</code>: Package witness type
- <code>ExistingPermission</code>: Permission type to revoke


<a name="@Parameters_22"></a>

### Parameters

- <code>self</code>: Mutable reference to the PermissionedGroup
- <code>member</code>: Address of the member to revoke permission from
- <code>ctx</code>: Transaction context


<a name="@Aborts_23"></a>

### Aborts

- <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ENotPermitted">ENotPermitted</a></code>: if caller doesn't have appropriate manager permission
- <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_EMemberNotFound">EMemberNotFound</a></code>: if member doesn't exist
- <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ELastAdministrator">ELastAdministrator</a></code>: if revoking <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> would leave no administrators


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_revoke_permission">revoke_permission</a>&lt;T: drop, ExistingPermission: drop&gt;(self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;T&gt;, member: <b>address</b>, ctx: &<a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_revoke_permission">revoke_permission</a>&lt;T: drop, ExistingPermission: drop&gt;(
    self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt;,
    member: <b>address</b>,
    ctx: &TxContext,
) {
    // Verify caller <b>has</b> permission to revoke this permission type
    self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_assert_can_manage_permission">assert_can_manage_permission</a>&lt;T, ExistingPermission&gt;(ctx.sender());
    <b>assert</b>!(self.permissions.contains(member), <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_EMemberNotFound">EMemberNotFound</a>);
    self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_internal_revoke_permission">internal_revoke_permission</a>&lt;T, ExistingPermission&gt;(member);
}
</code></pre>



</details>

<a name="permissioned_groups_permissioned_group_object_revoke_permission"></a>

## Function `object_revoke_permission`

Revokes a permission from the transaction sender via an actor object.
Enables third-party contracts to revoke permissions with custom logic.
If this is the sender's last permission, they are automatically removed from the group.

Permission requirements:
- To revoke <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code>: actor must have <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code>
- To revoke any other permission: actor must have <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> OR
<code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ExtensionPermissionsManager">ExtensionPermissionsManager</a></code>


<a name="@Type_Parameters_24"></a>

### Type Parameters

- <code>T</code>: Package witness type
- <code>ExistingPermission</code>: Permission type to revoke


<a name="@Parameters_25"></a>

### Parameters

- <code>self</code>: Mutable reference to the PermissionedGroup
- <code>actor_object</code>: UID of the actor object with appropriate manager permission
- <code>ctx</code>: Transaction context (sender will have the permission revoked)


<a name="@Aborts_26"></a>

### Aborts

- <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ENotPermitted">ENotPermitted</a></code>: if actor_object doesn't have appropriate manager permission
- <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_EMemberNotFound">EMemberNotFound</a></code>: if sender is not a member
- <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ELastAdministrator">ELastAdministrator</a></code>: if revoking <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> would leave no administrators


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_object_revoke_permission">object_revoke_permission</a>&lt;T: drop, ExistingPermission: drop&gt;(self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;T&gt;, actor_object: &<a href="../dependencies/sui/object.md#sui_object_UID">sui::object::UID</a>, ctx: &<b>mut</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_object_revoke_permission">object_revoke_permission</a>&lt;T: drop, ExistingPermission: drop&gt;(
    self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt;,
    actor_object: &UID,
    ctx: &<b>mut</b> TxContext,
) {
    <b>let</b> actor_address = actor_object.to_address();
    <b>let</b> member = ctx.sender();
    // Verify actor <b>has</b> permission to revoke this permission type
    self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_assert_can_manage_permission">assert_can_manage_permission</a>&lt;T, ExistingPermission&gt;(actor_address);
    <b>assert</b>!(self.permissions.contains(member), <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_EMemberNotFound">EMemberNotFound</a>);
    self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_internal_revoke_permission">internal_revoke_permission</a>&lt;T, ExistingPermission&gt;(member);
}
</code></pre>



</details>

<a name="permissioned_groups_permissioned_group_has_permission"></a>

## Function `has_permission`

Checks if the given address has the specified permission.


<a name="@Type_Parameters_27"></a>

### Type Parameters

- <code>T</code>: Package witness type
- <code>Permission</code>: Permission type to check


<a name="@Parameters_28"></a>

### Parameters

- <code>self</code>: Reference to the PermissionedGroup
- <code>member</code>: Address to check


<a name="@Returns_29"></a>

### Returns

<code><b>true</b></code> if the address has the permission, <code><b>false</b></code> otherwise.


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_has_permission">has_permission</a>&lt;T: drop, Permission: drop&gt;(self: &<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;T&gt;, member: <b>address</b>): bool
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_has_permission">has_permission</a>&lt;T: drop, Permission: drop&gt;(
    self: &<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt;,
    member: <b>address</b>,
): bool {
    self.permissions.borrow(member).contains(&type_name::with_defining_ids&lt;Permission&gt;())
}
</code></pre>



</details>

<a name="permissioned_groups_permissioned_group_is_member"></a>

## Function `is_member`

Checks if the given address is a member of the group.


<a name="@Parameters_30"></a>

### Parameters

- <code>self</code>: Reference to the PermissionedGroup
- <code>member</code>: Address to check


<a name="@Returns_31"></a>

### Returns

<code><b>true</b></code> if the address is a member, <code><b>false</b></code> otherwise.


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_is_member">is_member</a>&lt;T: drop&gt;(self: &<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;T&gt;, member: <b>address</b>): bool
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_is_member">is_member</a>&lt;T: drop&gt;(self: &<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt;, member: <b>address</b>): bool {
    self.permissions.contains(member)
}
</code></pre>



</details>

<a name="permissioned_groups_permissioned_group_creator"></a>

## Function `creator`

Returns the creator's address of the PermissionedGroup.


<a name="@Parameters_32"></a>

### Parameters

- <code>self</code>: Reference to the PermissionedGroup


<a name="@Returns_33"></a>

### Returns

The address of the creator.


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_creator">creator</a>&lt;T: drop&gt;(self: &<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;T&gt;): <b>address</b>
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_creator">creator</a>&lt;T: drop&gt;(self: &<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt;): <b>address</b> {
    self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_creator">creator</a>
}
</code></pre>



</details>

<a name="permissioned_groups_permissioned_group_administrators_count"></a>

## Function `administrators_count`

Returns the number of <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code>s in the PermissionedGroup.


<a name="@Parameters_34"></a>

### Parameters

- <code>self</code>: Reference to the PermissionedGroup


<a name="@Returns_35"></a>

### Returns

The count of <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code>s.


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_administrators_count">administrators_count</a>&lt;T: drop&gt;(self: &<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;T&gt;): u64
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_administrators_count">administrators_count</a>&lt;T: drop&gt;(self: &<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt;): u64 {
    self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_administrators_count">administrators_count</a>
}
</code></pre>



</details>

<a name="permissioned_groups_permissioned_group_assert_can_manage_permission"></a>

## Function `assert_can_manage_permission`

Asserts that the manager has permission to manage (grant/revoke) the specified permission type.
- To manage <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code>: manager must have <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code>
- To manage any other permission: manager must have <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> OR
<code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ExtensionPermissionsManager">ExtensionPermissionsManager</a></code>


<pre><code><b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_assert_can_manage_permission">assert_can_manage_permission</a>&lt;T: drop, Permission: drop&gt;(self: &<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;T&gt;, manager: <b>address</b>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_assert_can_manage_permission">assert_can_manage_permission</a>&lt;T: drop, Permission: drop&gt;(
    self: &<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt;,
    manager: <b>address</b>,
) {
    <b>let</b> permission_type = type_name::with_defining_ids&lt;Permission&gt;();
    <b>let</b> managing_core_manager =
        permission_type == type_name::with_defining_ids&lt;<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a>&gt;();
    <b>if</b> (managing_core_manager) {
        // Only <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a> can manage <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a>
        <b>assert</b>!(self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_has_permission">has_permission</a>&lt;T, <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a>&gt;(manager), <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ENotPermitted">ENotPermitted</a>);
    } <b>else</b> {
        // For all other permissions, either <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a> or <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ExtensionPermissionsManager">ExtensionPermissionsManager</a>
        // can manage
        <b>assert</b>!(
            self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_has_permission">has_permission</a>&lt;T, <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a>&gt;(manager) ||
            self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_has_permission">has_permission</a>&lt;T, <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ExtensionPermissionsManager">ExtensionPermissionsManager</a>&gt;(manager),
            <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ENotPermitted">ENotPermitted</a>,
        );
    };
}
</code></pre>



</details>

<a name="permissioned_groups_permissioned_group_internal_add_member"></a>

## Function `internal_add_member`

Internal helper to add a member to the PermissionedGroup.
Emits <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_MemberAdded">MemberAdded</a></code> event.


<pre><code><b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_internal_add_member">internal_add_member</a>&lt;T: drop&gt;(self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;T&gt;, new_member: <b>address</b>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_internal_add_member">internal_add_member</a>&lt;T: drop&gt;(self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt;, new_member: <b>address</b>) {
    <b>let</b> is_new_member = !self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_is_member">is_member</a>&lt;T&gt;(new_member);
    <b>if</b> (is_new_member) {
        self.permissions.add(new_member, vec_set::empty&lt;TypeName&gt;());
        event::emit(<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_MemberAdded">MemberAdded</a>&lt;T&gt; {
            group_id: object::id(self),
            member: new_member,
        });
    };
}
</code></pre>



</details>

<a name="permissioned_groups_permissioned_group_safe_decrement_administrators_count"></a>

## Function `safe_decrement_administrators_count`

Decrements administrators_count if member has <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code>.
Used when revoking <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code> permission or removing a member.
Aborts if this would leave no administrators.


<pre><code><b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_safe_decrement_administrators_count">safe_decrement_administrators_count</a>&lt;T: drop&gt;(self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;T&gt;, member: <b>address</b>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_safe_decrement_administrators_count">safe_decrement_administrators_count</a>&lt;T: drop&gt;(self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt;, member: <b>address</b>) {
    <b>let</b> member_permissions_set = self.permissions.borrow(member);
    <b>if</b> (member_permissions_set.contains(&type_name::with_defining_ids&lt;<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a>&gt;())) {
        <b>assert</b>!(self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_administrators_count">administrators_count</a> &gt; 1, <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_ELastAdministrator">ELastAdministrator</a>);
        self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_administrators_count">administrators_count</a> = self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_administrators_count">administrators_count</a> - 1;
    };
}
</code></pre>



</details>

<a name="permissioned_groups_permissioned_group_internal_grant_permission"></a>

## Function `internal_grant_permission`

Internal helper to grant a permission to a member.
Adds the member if they don't exist, then grants the permission.
Increments administrators_count if granting <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a></code>.
Emits <code><a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_MemberAdded">MemberAdded</a></code> event if member is new.


<pre><code><b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_internal_grant_permission">internal_grant_permission</a>&lt;T: drop, NewPermission: drop&gt;(self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;T&gt;, member: <b>address</b>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_internal_grant_permission">internal_grant_permission</a>&lt;T: drop, NewPermission: drop&gt;(
    self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt;,
    member: <b>address</b>,
) {
    // Add member <b>if</b> they don't exist
    self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_internal_add_member">internal_add_member</a>(member);
    // Grant the permission
    <b>let</b> member_permissions_set = self.permissions.borrow_mut(member);
    member_permissions_set.insert(type_name::with_defining_ids&lt;NewPermission&gt;());
    // Track <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a> count
    <b>if</b> (
        type_name::with_defining_ids&lt;NewPermission&gt;() == type_name::with_defining_ids&lt;<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a>&gt;()
    ) {
        self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_administrators_count">administrators_count</a> = self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_administrators_count">administrators_count</a> + 1;
    };
    event::emit(<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionsGranted">PermissionsGranted</a>&lt;T&gt; {
        group_id: object::id(self),
        member,
        permissions: vector[type_name::with_defining_ids&lt;NewPermission&gt;()],
    });
}
</code></pre>



</details>

<a name="permissioned_groups_permissioned_group_internal_revoke_permission"></a>

## Function `internal_revoke_permission`

Internal helper to remove a member from the PermissionedGroup.


<pre><code><b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_internal_revoke_permission">internal_revoke_permission</a>&lt;T: drop, ExistingPermission: drop&gt;(self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;T&gt;, member: <b>address</b>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>fun</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_internal_revoke_permission">internal_revoke_permission</a>&lt;T: drop, ExistingPermission: drop&gt;(
    self: &<b>mut</b> <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">PermissionedGroup</a>&lt;T&gt;,
    member: <b>address</b>,
) {
    // Check <b>if</b> revoking <a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a>
    <b>if</b> (
        type_name::with_defining_ids&lt;ExistingPermission&gt;() == type_name::with_defining_ids&lt;<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_Administrator">Administrator</a>&gt;()
    ) {
        self.<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_safe_decrement_administrators_count">safe_decrement_administrators_count</a>(member);
    };
    // Revoke the permission
    {
        <b>let</b> member_permissions_set = self.permissions.borrow_mut(member);
        member_permissions_set.remove(&type_name::with_defining_ids&lt;ExistingPermission&gt;());
    };
    event::emit(<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionsRevoked">PermissionsRevoked</a>&lt;T&gt; {
        group_id: object::id(self),
        member,
        permissions: vector[type_name::with_defining_ids&lt;ExistingPermission&gt;()],
    });
    // If member <b>has</b> no permissions left, remove them from the group
    <b>let</b> member_permissions_set = self.permissions.borrow(member);
    <b>if</b> (member_permissions_set.is_empty()) {
        self.permissions.remove(member);
        event::emit(<a href="../permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_MemberRemoved">MemberRemoved</a>&lt;T&gt; {
            group_id: object::id(self),
            member,
        });
    };
}
</code></pre>



</details>
