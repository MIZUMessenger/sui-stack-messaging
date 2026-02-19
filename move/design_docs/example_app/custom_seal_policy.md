
<a name="example_app_custom_seal_policy"></a>

# Module `example_app::custom_seal_policy`

Module: custom_seal_policy

Example third-party app contract demonstrating subscription-based access control
for encrypted messaging content using a custom seal_approve function.


<a name="@Pattern_Overview_0"></a>

### Pattern Overview


This pattern implements subscription-based access to encrypted content:
- A service owner creates a Service linked to a MessagingGroup
- Users purchase time-limited Subscriptions by paying SUI
- The custom seal_approve validates subscription ownership and expiry


<a name="@Key_Design_Points_1"></a>

### Key Design Points


1. **No wrapper needed**: This pattern doesn't wrap MessagingGroup. Instead, it:
- References the MessagingGroup by ID (stored in Service)
- Uses its own packageId for Seal encryption

2. **Standard identity bytes**: Identity bytes are always the standard format
<code>[groupId (32 bytes)][keyVersion (8 bytes LE u64)]</code>, enforced by the SDK.
Custom <code><a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_seal_approve">seal_approve</a></code> validates these standard bytes via
<code><a href="../dependencies/messaging/seal_policies.md#messaging_seal_policies_validate_identity">messaging::seal_policies::validate_identity</a>()</code>.

3. **TS-SDK integration**: The SDK only needs to know:
- This package ID (for seal_approve calls)
- The Service and Subscription object IDs (passed as <code>TApproveContext</code>)


<a name="@Usage_Flow_2"></a>

### Usage Flow


1. Create MessagingGroup using <code><a href="../dependencies/messaging/messaging.md#messaging_messaging_create_group">messaging::messaging::create_group</a>()</code>
2. Create Service via <code><a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_create_service">create_service</a>(<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_group_id">group_id</a>, <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_fee">fee</a>, <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ttl">ttl</a>)</code>
3. Users subscribe via <code><a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_subscribe">subscribe</a>(service, payment, clock)</code>
4. Encrypt content using this package's ID with standard identity bytes
5. <code><a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_seal_approve">seal_approve</a></code> validates identity + subscription before decryption


    -  [Pattern Overview](#@Pattern_Overview_0)
    -  [Key Design Points](#@Key_Design_Points_1)
    -  [Usage Flow](#@Usage_Flow_2)
-  [Struct `Service`](#example_app_custom_seal_policy_Service)
-  [Struct `Subscription`](#example_app_custom_seal_policy_Subscription)
-  [Constants](#@Constants_3)
-  [Function `create_service`](#example_app_custom_seal_policy_create_service)
    -  [Parameters](#@Parameters_4)
    -  [Returns](#@Returns_5)
-  [Function `create_service_and_share`](#example_app_custom_seal_policy_create_service_and_share)
-  [Function `subscribe`](#example_app_custom_seal_policy_subscribe)
    -  [Parameters](#@Parameters_6)
    -  [Returns](#@Returns_7)
    -  [Aborts](#@Aborts_8)
-  [Function `subscribe_entry`](#example_app_custom_seal_policy_subscribe_entry)
-  [Function `transfer_subscription`](#example_app_custom_seal_policy_transfer_subscription)
-  [Function `fee`](#example_app_custom_seal_policy_fee)
-  [Function `ttl`](#example_app_custom_seal_policy_ttl)
-  [Function `group_id`](#example_app_custom_seal_policy_group_id)
-  [Function `subscription_service_id`](#example_app_custom_seal_policy_subscription_service_id)
-  [Function `created_at`](#example_app_custom_seal_policy_created_at)
-  [Function `is_subscription_valid`](#example_app_custom_seal_policy_is_subscription_valid)
-  [Function `check_policy`](#example_app_custom_seal_policy_check_policy)
    -  [Parameters](#@Parameters_9)
    -  [Returns](#@Returns_10)
-  [Function `seal_approve`](#example_app_custom_seal_policy_seal_approve)
    -  [Parameters](#@Parameters_11)
    -  [Aborts](#@Aborts_12)


<pre><code><b>use</b> <a href="../dependencies/messaging/encryption_history.md#messaging_encryption_history">messaging::encryption_history</a>;
<b>use</b> <a href="../dependencies/messaging/group_leaver.md#messaging_group_leaver">messaging::group_leaver</a>;
<b>use</b> <a href="../dependencies/messaging/group_manager.md#messaging_group_manager">messaging::group_manager</a>;
<b>use</b> <a href="../dependencies/messaging/messaging.md#messaging_messaging">messaging::messaging</a>;
<b>use</b> <a href="../dependencies/messaging/metadata.md#messaging_metadata">messaging::metadata</a>;
<b>use</b> <a href="../dependencies/messaging/seal_policies.md#messaging_seal_policies">messaging::seal_policies</a>;
<b>use</b> <a href="../dependencies/messaging/version.md#messaging_version">messaging::version</a>;
<b>use</b> <a href="../dependencies/permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group">permissioned_groups::permissioned_group</a>;
<b>use</b> <a href="../dependencies/permissioned_groups/permissions_table.md#permissioned_groups_permissions_table">permissioned_groups::permissions_table</a>;
<b>use</b> <a href="../dependencies/permissioned_groups/unpause_cap.md#permissioned_groups_unpause_cap">permissioned_groups::unpause_cap</a>;
<b>use</b> <a href="../dependencies/std/address.md#std_address">std::address</a>;
<b>use</b> <a href="../dependencies/std/ascii.md#std_ascii">std::ascii</a>;
<b>use</b> <a href="../dependencies/std/bcs.md#std_bcs">std::bcs</a>;
<b>use</b> <a href="../dependencies/std/internal.md#std_internal">std::internal</a>;
<b>use</b> <a href="../dependencies/std/option.md#std_option">std::option</a>;
<b>use</b> <a href="../dependencies/std/string.md#std_string">std::string</a>;
<b>use</b> <a href="../dependencies/std/type_name.md#std_type_name">std::type_name</a>;
<b>use</b> <a href="../dependencies/std/u128.md#std_u128">std::u128</a>;
<b>use</b> <a href="../dependencies/std/vector.md#std_vector">std::vector</a>;
<b>use</b> <a href="../dependencies/sui/accumulator.md#sui_accumulator">sui::accumulator</a>;
<b>use</b> <a href="../dependencies/sui/accumulator_settlement.md#sui_accumulator_settlement">sui::accumulator_settlement</a>;
<b>use</b> <a href="../dependencies/sui/address.md#sui_address">sui::address</a>;
<b>use</b> <a href="../dependencies/sui/bag.md#sui_bag">sui::bag</a>;
<b>use</b> <a href="../dependencies/sui/balance.md#sui_balance">sui::balance</a>;
<b>use</b> <a href="../dependencies/sui/bcs.md#sui_bcs">sui::bcs</a>;
<b>use</b> <a href="../dependencies/sui/clock.md#sui_clock">sui::clock</a>;
<b>use</b> <a href="../dependencies/sui/coin.md#sui_coin">sui::coin</a>;
<b>use</b> <a href="../dependencies/sui/config.md#sui_config">sui::config</a>;
<b>use</b> <a href="../dependencies/sui/deny_list.md#sui_deny_list">sui::deny_list</a>;
<b>use</b> <a href="../dependencies/sui/derived_object.md#sui_derived_object">sui::derived_object</a>;
<b>use</b> <a href="../dependencies/sui/dynamic_field.md#sui_dynamic_field">sui::dynamic_field</a>;
<b>use</b> <a href="../dependencies/sui/dynamic_object_field.md#sui_dynamic_object_field">sui::dynamic_object_field</a>;
<b>use</b> <a href="../dependencies/sui/event.md#sui_event">sui::event</a>;
<b>use</b> <a href="../dependencies/sui/funds_accumulator.md#sui_funds_accumulator">sui::funds_accumulator</a>;
<b>use</b> <a href="../dependencies/sui/hash.md#sui_hash">sui::hash</a>;
<b>use</b> <a href="../dependencies/sui/hex.md#sui_hex">sui::hex</a>;
<b>use</b> <a href="../dependencies/sui/object.md#sui_object">sui::object</a>;
<b>use</b> <a href="../dependencies/sui/package.md#sui_package">sui::package</a>;
<b>use</b> <a href="../dependencies/sui/party.md#sui_party">sui::party</a>;
<b>use</b> <a href="../dependencies/sui/protocol_config.md#sui_protocol_config">sui::protocol_config</a>;
<b>use</b> <a href="../dependencies/sui/sui.md#sui_sui">sui::sui</a>;
<b>use</b> <a href="../dependencies/sui/table.md#sui_table">sui::table</a>;
<b>use</b> <a href="../dependencies/sui/table_vec.md#sui_table_vec">sui::table_vec</a>;
<b>use</b> <a href="../dependencies/sui/transfer.md#sui_transfer">sui::transfer</a>;
<b>use</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context">sui::tx_context</a>;
<b>use</b> <a href="../dependencies/sui/types.md#sui_types">sui::types</a>;
<b>use</b> <a href="../dependencies/sui/url.md#sui_url">sui::url</a>;
<b>use</b> <a href="../dependencies/sui/vec_map.md#sui_vec_map">sui::vec_map</a>;
<b>use</b> <a href="../dependencies/sui/vec_set.md#sui_vec_set">sui::vec_set</a>;
<b>use</b> <a href="../dependencies/suins/constants.md#suins_constants">suins::constants</a>;
<b>use</b> <a href="../dependencies/suins/controller.md#suins_controller">suins::controller</a>;
<b>use</b> <a href="../dependencies/suins/domain.md#suins_domain">suins::domain</a>;
<b>use</b> <a href="../dependencies/suins/name_record.md#suins_name_record">suins::name_record</a>;
<b>use</b> <a href="../dependencies/suins/registry.md#suins_registry">suins::registry</a>;
<b>use</b> <a href="../dependencies/suins/subdomain_registration.md#suins_subdomain_registration">suins::subdomain_registration</a>;
<b>use</b> <a href="../dependencies/suins/suins.md#suins_suins">suins::suins</a>;
<b>use</b> <a href="../dependencies/suins/suins_registration.md#suins_suins_registration">suins::suins_registration</a>;
</code></pre>



<a name="example_app_custom_seal_policy_Service"></a>

## Struct `Service`

A subscription service that gates access to a MessagingGroup's encrypted content.
The service can be shared so anyone can subscribe.


<pre><code><b>public</b> <b>struct</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">Service</a>&lt;<b>phantom</b> Token&gt; <b>has</b> key
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
<code><a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_group_id">group_id</a>: <a href="../dependencies/sui/object.md#sui_object_ID">sui::object::ID</a></code>
</dt>
<dd>
 The MessagingGroup this service is associated with (for reference only)
</dd>
<dt>
<code><a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_fee">fee</a>: u64</code>
</dt>
<dd>
 Subscription fee in the Token's smallest unit
</dd>
<dt>
<code><a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ttl">ttl</a>: u64</code>
</dt>
<dd>
 Time-to-live for subscriptions in milliseconds
</dd>
<dt>
<code>owner: <b>address</b></code>
</dt>
<dd>
 Address that receives subscription payments
</dd>
</dl>


</details>

<a name="example_app_custom_seal_policy_Subscription"></a>

## Struct `Subscription`

A time-limited subscription to a Service.
Only has <code>key</code> (no <code>store</code>) so it can only be transferred, not wrapped.


<pre><code><b>public</b> <b>struct</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Subscription">Subscription</a>&lt;<b>phantom</b> Token&gt; <b>has</b> key
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
<code>service_id: <a href="../dependencies/sui/object.md#sui_object_ID">sui::object::ID</a></code>
</dt>
<dd>
 The service this subscription belongs to
</dd>
<dt>
<code><a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_created_at">created_at</a>: u64</code>
</dt>
<dd>
 Timestamp (ms) when the subscription was created
</dd>
</dl>


</details>

<a name="@Constants_3"></a>

## Constants


<a name="example_app_custom_seal_policy_EInvalidFee"></a>



<pre><code><b>const</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_EInvalidFee">EInvalidFee</a>: u64 = 0;
</code></pre>



<a name="example_app_custom_seal_policy_ENoAccess"></a>



<pre><code><b>const</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ENoAccess">ENoAccess</a>: u64 = 1;
</code></pre>



<a name="example_app_custom_seal_policy_create_service"></a>

## Function `create_service`

Creates a new subscription service for a MessagingGroup.


<a name="@Parameters_4"></a>

### Parameters

- <code><a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_group_id">group_id</a></code>: The ID of the MessagingGroup this service controls access to
- <code><a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_fee">fee</a></code>: Subscription fee in MIST
- <code><a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ttl">ttl</a></code>: Subscription duration in milliseconds
- <code>ctx</code>: Transaction context


<a name="@Returns_5"></a>

### Returns

- A new Service object (should be shared for public access)


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_create_service">create_service</a>&lt;Token: drop&gt;(<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_group_id">group_id</a>: <a href="../dependencies/sui/object.md#sui_object_ID">sui::object::ID</a>, <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_fee">fee</a>: u64, <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ttl">ttl</a>: u64, ctx: &<b>mut</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>): <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">example_app::custom_seal_policy::Service</a>&lt;Token&gt;
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_create_service">create_service</a>&lt;Token: drop&gt;(
    <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_group_id">group_id</a>: ID,
    <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_fee">fee</a>: u64,
    <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ttl">ttl</a>: u64,
    ctx: &<b>mut</b> TxContext,
): <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">Service</a>&lt;Token&gt; {
    <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">Service</a>&lt;Token&gt; {
        id: object::new(ctx),
        <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_group_id">group_id</a>,
        <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_fee">fee</a>,
        <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ttl">ttl</a>,
        owner: ctx.sender(),
    }
}
</code></pre>



</details>

<a name="example_app_custom_seal_policy_create_service_and_share"></a>

## Function `create_service_and_share`

Creates and shares a new subscription service.
Convenience entry function for simpler CLI usage.


<pre><code><b>entry</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_create_service_and_share">create_service_and_share</a>&lt;Token: drop&gt;(<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_group_id">group_id</a>: <a href="../dependencies/sui/object.md#sui_object_ID">sui::object::ID</a>, <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_fee">fee</a>: u64, <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ttl">ttl</a>: u64, ctx: &<b>mut</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>entry</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_create_service_and_share">create_service_and_share</a>&lt;Token: drop&gt;(
    <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_group_id">group_id</a>: ID,
    <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_fee">fee</a>: u64,
    <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ttl">ttl</a>: u64,
    ctx: &<b>mut</b> TxContext,
) {
    transfer::share_object(<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_create_service">create_service</a>&lt;Token&gt;(<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_group_id">group_id</a>, <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_fee">fee</a>, <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ttl">ttl</a>, ctx));
}
</code></pre>



</details>

<a name="example_app_custom_seal_policy_subscribe"></a>

## Function `subscribe`

Purchases a subscription to the service.
The subscription is valid for <code>service.<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ttl">ttl</a></code> milliseconds from creation.


<a name="@Parameters_6"></a>

### Parameters

- <code>service</code>: Reference to the Service
- <code>payment</code>: SUI coin for payment (must equal service.fee)
- <code>clock</code>: Clock for timestamp
- <code>ctx</code>: Transaction context


<a name="@Returns_7"></a>

### Returns

- A new Subscription object


<a name="@Aborts_8"></a>

### Aborts

- <code><a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_EInvalidFee">EInvalidFee</a></code>: if payment amount doesn't match service fee


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_subscribe">subscribe</a>&lt;Token: drop&gt;(service: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">example_app::custom_seal_policy::Service</a>&lt;Token&gt;, payment: <a href="../dependencies/sui/coin.md#sui_coin_Coin">sui::coin::Coin</a>&lt;Token&gt;, clock: &<a href="../dependencies/sui/clock.md#sui_clock_Clock">sui::clock::Clock</a>, ctx: &<b>mut</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>): <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Subscription">example_app::custom_seal_policy::Subscription</a>&lt;Token&gt;
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_subscribe">subscribe</a>&lt;Token: drop&gt;(
    service: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">Service</a>&lt;Token&gt;,
    payment: Coin&lt;Token&gt;,
    clock: &Clock,
    ctx: &<b>mut</b> TxContext,
): <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Subscription">Subscription</a>&lt;Token&gt; {
    <b>assert</b>!(payment.value() == service.<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_fee">fee</a>, <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_EInvalidFee">EInvalidFee</a>);
    // Transfer payment to service owner
    transfer::public_transfer(payment, service.owner);
    <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Subscription">Subscription</a>&lt;Token&gt; {
        id: object::new(ctx),
        service_id: object::id(service),
        <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_created_at">created_at</a>: clock.timestamp_ms(),
    }
}
</code></pre>



</details>

<a name="example_app_custom_seal_policy_subscribe_entry"></a>

## Function `subscribe_entry`

Purchases a subscription and transfers it to the sender.
Convenience entry function for simpler CLI usage.


<pre><code><b>entry</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_subscribe_entry">subscribe_entry</a>&lt;Token: drop&gt;(service: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">example_app::custom_seal_policy::Service</a>&lt;Token&gt;, payment: <a href="../dependencies/sui/coin.md#sui_coin_Coin">sui::coin::Coin</a>&lt;Token&gt;, clock: &<a href="../dependencies/sui/clock.md#sui_clock_Clock">sui::clock::Clock</a>, ctx: &<b>mut</b> <a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>entry</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_subscribe_entry">subscribe_entry</a>&lt;Token: drop&gt;(
    service: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">Service</a>&lt;Token&gt;,
    payment: Coin&lt;Token&gt;,
    clock: &Clock,
    ctx: &<b>mut</b> TxContext,
) {
    <b>let</b> sub = <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_subscribe">subscribe</a>&lt;Token&gt;(service, payment, clock, ctx);
    transfer::transfer(sub, ctx.sender());
}
</code></pre>



</details>

<a name="example_app_custom_seal_policy_transfer_subscription"></a>

## Function `transfer_subscription`

Transfers a subscription to another address.
This allows gifting or selling subscriptions.


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_transfer_subscription">transfer_subscription</a>&lt;Token: drop&gt;(sub: <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Subscription">example_app::custom_seal_policy::Subscription</a>&lt;Token&gt;, to: <b>address</b>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_transfer_subscription">transfer_subscription</a>&lt;Token: drop&gt;(sub: <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Subscription">Subscription</a>&lt;Token&gt;, to: <b>address</b>) {
    transfer::transfer(sub, to);
}
</code></pre>



</details>

<a name="example_app_custom_seal_policy_fee"></a>

## Function `fee`

Returns the fee for this service.


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_fee">fee</a>&lt;Token: drop&gt;(service: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">example_app::custom_seal_policy::Service</a>&lt;Token&gt;): u64
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_fee">fee</a>&lt;Token: drop&gt;(service: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">Service</a>&lt;Token&gt;): u64 {
    service.<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_fee">fee</a>
}
</code></pre>



</details>

<a name="example_app_custom_seal_policy_ttl"></a>

## Function `ttl`

Returns the TTL for this service.


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ttl">ttl</a>&lt;Token: drop&gt;(service: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">example_app::custom_seal_policy::Service</a>&lt;Token&gt;): u64
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ttl">ttl</a>&lt;Token: drop&gt;(service: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">Service</a>&lt;Token&gt;): u64 {
    service.<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ttl">ttl</a>
}
</code></pre>



</details>

<a name="example_app_custom_seal_policy_group_id"></a>

## Function `group_id`

Returns the MessagingGroup ID this service is associated with.


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_group_id">group_id</a>&lt;Token: drop&gt;(service: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">example_app::custom_seal_policy::Service</a>&lt;Token&gt;): <a href="../dependencies/sui/object.md#sui_object_ID">sui::object::ID</a>
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_group_id">group_id</a>&lt;Token: drop&gt;(service: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">Service</a>&lt;Token&gt;): ID {
    service.<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_group_id">group_id</a>
}
</code></pre>



</details>

<a name="example_app_custom_seal_policy_subscription_service_id"></a>

## Function `subscription_service_id`

Returns the service ID this subscription belongs to.


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_subscription_service_id">subscription_service_id</a>&lt;Token: drop&gt;(sub: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Subscription">example_app::custom_seal_policy::Subscription</a>&lt;Token&gt;): <a href="../dependencies/sui/object.md#sui_object_ID">sui::object::ID</a>
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_subscription_service_id">subscription_service_id</a>&lt;Token: drop&gt;(sub: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Subscription">Subscription</a>&lt;Token&gt;): ID {
    sub.service_id
}
</code></pre>



</details>

<a name="example_app_custom_seal_policy_created_at"></a>

## Function `created_at`

Returns when this subscription was created.


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_created_at">created_at</a>&lt;Token: drop&gt;(sub: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Subscription">example_app::custom_seal_policy::Subscription</a>&lt;Token&gt;): u64
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_created_at">created_at</a>&lt;Token: drop&gt;(sub: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Subscription">Subscription</a>&lt;Token&gt;): u64 {
    sub.<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_created_at">created_at</a>
}
</code></pre>



</details>

<a name="example_app_custom_seal_policy_is_subscription_valid"></a>

## Function `is_subscription_valid`

Checks if a subscription is still valid (not expired).


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_is_subscription_valid">is_subscription_valid</a>&lt;Token: drop&gt;(sub: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Subscription">example_app::custom_seal_policy::Subscription</a>&lt;Token&gt;, service: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">example_app::custom_seal_policy::Service</a>&lt;Token&gt;, clock: &<a href="../dependencies/sui/clock.md#sui_clock_Clock">sui::clock::Clock</a>): bool
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>public</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_is_subscription_valid">is_subscription_valid</a>&lt;Token: drop&gt;(
    sub: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Subscription">Subscription</a>&lt;Token&gt;,
    service: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">Service</a>&lt;Token&gt;,
    clock: &Clock,
): bool {
    <b>if</b> (object::id(service) != sub.service_id) {
        <b>return</b> <b>false</b>
    };
    clock.timestamp_ms() &lt;= sub.<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_created_at">created_at</a> + service.<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ttl">ttl</a>
}
</code></pre>



</details>

<a name="example_app_custom_seal_policy_check_policy"></a>

## Function `check_policy`

Checks subscription-specific conditions for seal approval.


<a name="@Parameters_9"></a>

### Parameters

- <code>sub</code>: Reference to the user's Subscription
- <code>service</code>: Reference to the Service
- <code>group</code>: Reference to the PermissionedGroup<Messaging>
- <code>clock</code>: Clock for expiry validation
- <code>ctx</code>: Transaction context for sender verification


<a name="@Returns_10"></a>

### Returns

<code><b>true</b></code> if all conditions pass (group matches, caller is member,
subscription belongs to service, not expired), <code><b>false</b></code> otherwise.


<pre><code><b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_check_policy">check_policy</a>&lt;Token: drop&gt;(sub: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Subscription">example_app::custom_seal_policy::Subscription</a>&lt;Token&gt;, service: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">example_app::custom_seal_policy::Service</a>&lt;Token&gt;, group: &<a href="../dependencies/permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;<a href="../dependencies/messaging/messaging.md#messaging_messaging_Messaging">messaging::messaging::Messaging</a>&gt;, clock: &<a href="../dependencies/sui/clock.md#sui_clock_Clock">sui::clock::Clock</a>, ctx: &<a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>): bool
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_check_policy">check_policy</a>&lt;Token: drop&gt;(
    sub: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Subscription">Subscription</a>&lt;Token&gt;,
    service: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">Service</a>&lt;Token&gt;,
    group: &PermissionedGroup&lt;Messaging&gt;,
    clock: &Clock,
    ctx: &TxContext,
): bool {
    // Check <b>if</b> group matches the service's <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_group_id">group_id</a>
    <b>if</b> (object::id(group) != service.<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_group_id">group_id</a>) {
        <b>return</b> <b>false</b>
    };
    // Check <b>if</b> caller is a member of the group
    <b>if</b> (!group.is_member(ctx.sender())) {
        <b>return</b> <b>false</b>
    };
    // Check <b>if</b> subscription belongs to this service
    <b>if</b> (object::id(service) != sub.service_id) {
        <b>return</b> <b>false</b>
    };
    // Check <b>if</b> subscription <b>has</b> expired
    <b>if</b> (clock.timestamp_ms() &gt; sub.<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_created_at">created_at</a> + service.<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ttl">ttl</a>) {
        <b>return</b> <b>false</b>
    };
    <b>true</b>
}
</code></pre>



</details>

<a name="example_app_custom_seal_policy_seal_approve"></a>

## Function `seal_approve`

Custom seal_approve for subscription-based access.
Called by Seal key servers (via dry-run) to authorize decryption.

Identity bytes use the standard format <code>[groupId (32)][keyVersion (8 LE u64)]</code>,
validated by <code><a href="../dependencies/messaging/seal_policies.md#messaging_seal_policies_validate_identity">messaging::seal_policies::validate_identity</a>()</code>.


<a name="@Parameters_11"></a>

### Parameters

- <code>id</code>: Seal identity bytes <code>[<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_group_id">group_id</a> (32 bytes)][key_version (8 bytes LE u64)]</code>
- <code>sub</code>: The user's Subscription object
- <code>service</code>: The Service being accessed
- <code>group</code>: The MessagingGroup (must match service.group_id)
- <code>encryption_history</code>: The EncryptionHistory (must belong to group)
- <code>clock</code>: Clock for expiry validation
- <code>ctx</code>: Transaction context for sender verification


<a name="@Aborts_12"></a>

### Aborts

- <code><a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ENoAccess">ENoAccess</a></code>: if subscription-specific checks fail
- via <code>validate_identity</code>: if identity bytes are malformed, group_id mismatch,
encryption_history mismatch, or key_version doesn't exist


<pre><code><b>entry</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_seal_approve">seal_approve</a>&lt;Token: drop&gt;(id: vector&lt;u8&gt;, sub: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Subscription">example_app::custom_seal_policy::Subscription</a>&lt;Token&gt;, service: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">example_app::custom_seal_policy::Service</a>&lt;Token&gt;, group: &<a href="../dependencies/permissioned_groups/permissioned_group.md#permissioned_groups_permissioned_group_PermissionedGroup">permissioned_groups::permissioned_group::PermissionedGroup</a>&lt;<a href="../dependencies/messaging/messaging.md#messaging_messaging_Messaging">messaging::messaging::Messaging</a>&gt;, encryption_history: &<a href="../dependencies/messaging/encryption_history.md#messaging_encryption_history_EncryptionHistory">messaging::encryption_history::EncryptionHistory</a>, clock: &<a href="../dependencies/sui/clock.md#sui_clock_Clock">sui::clock::Clock</a>, ctx: &<a href="../dependencies/sui/tx_context.md#sui_tx_context_TxContext">sui::tx_context::TxContext</a>)
</code></pre>



<details>
<summary>Implementation</summary>


<pre><code><b>entry</b> <b>fun</b> <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_seal_approve">seal_approve</a>&lt;Token: drop&gt;(
    id: vector&lt;u8&gt;,
    sub: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Subscription">Subscription</a>&lt;Token&gt;,
    service: &<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_Service">Service</a>&lt;Token&gt;,
    group: &PermissionedGroup&lt;Messaging&gt;,
    encryption_history: &EncryptionHistory,
    clock: &Clock,
    ctx: &TxContext,
) {
    // Reuse standard identity validation (groupId, keyVersion, encHistory match)
    <a href="../dependencies/messaging/seal_policies.md#messaging_seal_policies_validate_identity">messaging::seal_policies::validate_identity</a>(group, encryption_history, id);
    // Custom checks: subscription + service + membership
    <b>assert</b>!(<a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_check_policy">check_policy</a>(sub, service, group, clock, ctx), <a href="../example_app/custom_seal_policy.md#example_app_custom_seal_policy_ENoAccess">ENoAccess</a>);
}
</code></pre>



</details>
