//! Signature verification and Sui address derivation.
//! The relayer verifies raw header signatures for keypair schemes and can
//! derive addresses for additional schemes such as zkLogin.
//! - Ed25519 (flag 0x00): 32-byte public key
//! - Secp256k1 (flag 0x01): 33-byte compressed public key
//! - Secp256r1 (flag 0x02): 33-byte compressed public key
//! - ZkLogin (flag 0x05): variable-length public identifier

use base64::{engine::general_purpose::STANDARD, Engine as _};
use blake2::{digest::consts::U32, Blake2b, Digest};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use sui_crypto::{SuiVerifier, UserSignatureVerifier};
use sui_sdk_types::{PersonalMessage, UserSignature};

use super::schemes::SignatureScheme;
use super::types::AuthError;
use crate::config::Config;

const VERIFY_ZKLOGIN_SIGNATURE_QUERY: &str = r#"query verifyZkLoginSignature($bytes: Base64!, $signature: Base64!, $intentScope: ZkLoginIntentScope!, $author: SuiAddress!) {
  verifyZkLoginSignature(bytes: $bytes, signature: $signature, intentScope: $intentScope, author: $author) {
    success
  }
}"#;

#[derive(Serialize)]
struct VerifyZkLoginSignatureRequest<'a> {
    query: &'static str,
    variables: VerifyZkLoginSignatureVariables<'a>,
}

#[derive(Serialize)]
struct VerifyZkLoginSignatureVariables<'a> {
    bytes: String,
    signature: String,
    #[serde(rename = "intentScope")]
    intent_scope: &'static str,
    author: &'a str,
}

#[derive(Deserialize)]
struct VerifyZkLoginSignatureResponse {
    data: Option<VerifyZkLoginSignatureData>,
    errors: Option<Vec<GraphqlError>>,
}

#[derive(Deserialize)]
struct VerifyZkLoginSignatureData {
    #[serde(rename = "verifyZkLoginSignature")]
    verify_zklogin_signature: Option<ZkLoginVerifyResult>,
}

#[derive(Deserialize)]
struct ZkLoginVerifyResult {
    success: Option<bool>,
}

#[derive(Deserialize)]
struct GraphqlError {
    message: String,
}

/// Default TTL for request timestamps (5 minutes).
#[allow(dead_code)]
pub const DEFAULT_REQUEST_TTL_SECONDS: i64 = 300;

/// Validates that a timestamp is within the acceptable TTL window.
pub fn validate_timestamp(timestamp: i64, ttl_seconds: i64) -> Result<(), AuthError> {
    let now = chrono::Utc::now().timestamp();

    let diff = (now - timestamp).abs();

    if diff > ttl_seconds {
        return Err(AuthError::RequestExpired {
            timestamp,
            server_time: now,
            ttl_seconds,
        });
    }

    Ok(())
}

/// Verifies a signature against a message.
pub async fn verify_signature(
    message: &[u8],
    signature_bytes: &[u8],
    public_key_bytes: &[u8],
    scheme: SignatureScheme,
    author: &str,
    config: &Config,
) -> Result<(), AuthError> {
    if let Err(e) = scheme.validate_public_key(public_key_bytes) {
        return Err(AuthError::InvalidPublicKeyFormat(e));
    }

    if scheme == SignatureScheme::ZkLogin {
        return verify_zklogin_signature_via_graphql(message, signature_bytes, author, config)
            .await;
    }

    if !scheme.supports_raw_signature_auth() {
        return Err(AuthError::SignatureVerificationFailed(format!(
            "{} is not supported by relayer raw header auth",
            scheme
        )));
    }

    let expected_sig_len = scheme.signature_length().expect("checked above");
    if signature_bytes.len() != expected_sig_len {
        return Err(AuthError::InvalidSignatureFormat(format!(
            "Expected {} bytes for {}, got {}",
            expected_sig_len,
            scheme,
            signature_bytes.len()
        )));
    }

    let mut serialized_sig = Vec::with_capacity(1 + expected_sig_len + public_key_bytes.len());
    serialized_sig.push(scheme.flag());
    serialized_sig.extend_from_slice(signature_bytes);
    serialized_sig.extend_from_slice(public_key_bytes);

    let user_signature = UserSignature::from_bytes(&serialized_sig).map_err(|e| {
        AuthError::InvalidSignatureFormat(format!("Failed to parse signature: {}", e))
    })?;

    let personal_message = PersonalMessage(Cow::Borrowed(message));

    let verifier = UserSignatureVerifier::default();

    verifier
        .verify_personal_message(&personal_message, &user_signature)
        .map_err(|e| AuthError::SignatureVerificationFailed(e.to_string()))?;

    Ok(())
}

async fn verify_zklogin_signature_via_graphql(
    message: &[u8],
    signature_bytes: &[u8],
    author: &str,
    config: &Config,
) -> Result<(), AuthError> {
    let graphql_url = config.sui_graphql_url.as_deref().ok_or_else(|| {
        AuthError::SignatureVerificationFailed(
            "zkLogin verification requires SUI_GRAPHQL_URL to be configured".to_string(),
        )
    })?;

    if signature_bytes.first() != Some(&SignatureScheme::ZkLogin.flag()) {
        return Err(AuthError::InvalidSignatureFormat(
            "Expected serialized zkLogin signature prefixed with 0x05".to_string(),
        ));
    }

    let request = VerifyZkLoginSignatureRequest {
        query: VERIFY_ZKLOGIN_SIGNATURE_QUERY,
        variables: VerifyZkLoginSignatureVariables {
            // GraphQL expects the ZkLoginIntentScope enum variant name.
            bytes: STANDARD.encode(message),
            signature: STANDARD.encode(signature_bytes),
            intent_scope: "PERSONAL_MESSAGE",
            author,
        },
    };

    let response = reqwest::Client::new()
        .post(graphql_url)
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            AuthError::SignatureVerificationFailed(format!("zkLogin GraphQL request failed: {}", e))
        })?;

    let status = response.status();
    let response_body = response.text().await.map_err(|e| {
        AuthError::SignatureVerificationFailed(format!(
            "Failed to read zkLogin GraphQL response: {}",
            e
        ))
    })?;

    if !status.is_success() {
        return Err(AuthError::SignatureVerificationFailed(format!(
            "zkLogin GraphQL request failed: HTTP {} {}",
            status.as_u16(),
            response_body
        )));
    }

    let response: VerifyZkLoginSignatureResponse =
        serde_json::from_str(&response_body).map_err(|e| {
            AuthError::SignatureVerificationFailed(format!(
                "Failed to decode zkLogin GraphQL response: {}",
                e
            ))
        })?;

    if let Some(errors) = response.errors {
        if !errors.is_empty() {
            return Err(AuthError::SignatureVerificationFailed(
                errors
                    .into_iter()
                    .map(|error| error.message)
                    .collect::<Vec<_>>()
                    .join("; "),
            ));
        }
    }

    if response
        .data
        .and_then(|data| data.verify_zklogin_signature)
        .and_then(|result| result.success)
        == Some(true)
    {
        return Ok(());
    }

    Err(AuthError::SignatureVerificationFailed(
        "zkLogin GraphQL verification returned success=false".to_string(),
    ))
}

/// Derives a Sui address from a public key and scheme.
/// Uses Blake2b-256 hash of (flag || public_key).
pub fn derive_sui_address(
    public_key_bytes: &[u8],
    scheme: SignatureScheme,
) -> Result<String, AuthError> {
    if let Err(e) = scheme.validate_public_key(public_key_bytes) {
        return Err(AuthError::InvalidPublicKeyFormat(e));
    }

    if scheme == SignatureScheme::ZkLogin {
        return derive_zklogin_address(public_key_bytes, false);
    }

    // Build the hash input: flag || public_key
    let mut hash_input = vec![scheme.flag()];
    hash_input.extend_from_slice(public_key_bytes);

    // Hash with Blake2b-256 to derive the address
    type Blake2b256 = Blake2b<U32>;
    let hash = Blake2b256::digest(&hash_input);

    // Return as hex string with 0x prefix
    Ok(format!("0x{}", hex::encode(hash)))
}

/// Verifies that the claimed address matches the public key.
pub fn verify_address_matches_pubkey(
    claimed_address: &str,
    public_key_bytes: &[u8],
    scheme: SignatureScheme,
) -> Result<String, AuthError> {
    if scheme == SignatureScheme::ZkLogin {
        let current_address = derive_zklogin_address(public_key_bytes, false)?;
        let legacy_address = derive_zklogin_address(public_key_bytes, true)?;

        if claimed_address == current_address {
            return Ok(current_address);
        }

        if claimed_address == legacy_address {
            return Ok(legacy_address);
        }

        return Err(AuthError::AddressMismatch {
            expected: format!("{} (legacy: {})", current_address, legacy_address),
            got: claimed_address.to_string(),
        });
    }

    let derived_address = derive_sui_address(public_key_bytes, scheme)?;

    if claimed_address != derived_address {
        return Err(AuthError::AddressMismatch {
            expected: derived_address.clone(),
            got: claimed_address.to_string(),
        });
    }

    Ok(derived_address)
}

fn derive_zklogin_address(public_key_bytes: &[u8], legacy: bool) -> Result<String, AuthError> {
    let normalized_key = normalize_zklogin_public_identifier(public_key_bytes, legacy)?;
    let mut hash_input = vec![SignatureScheme::ZkLogin.flag()];
    hash_input.extend_from_slice(&normalized_key);

    type Blake2b256 = Blake2b<U32>;
    let hash = Blake2b256::digest(&hash_input);
    Ok(format!("0x{}", hex::encode(hash)))
}

fn normalize_zklogin_public_identifier(
    public_key_bytes: &[u8],
    legacy: bool,
) -> Result<Vec<u8>, AuthError> {
    let issuer_len = *public_key_bytes
        .first()
        .ok_or_else(|| {
            AuthError::InvalidPublicKeyFormat("Empty zkLogin public identifier".to_string())
        })?
        as usize;
    let issuer_end = 1 + issuer_len;

    if public_key_bytes.len() < issuer_end {
        return Err(AuthError::InvalidPublicKeyFormat(format!(
            "zkLogin issuer length {} exceeds available bytes {}",
            issuer_len,
            public_key_bytes.len().saturating_sub(1)
        )));
    }

    let mut normalized = public_key_bytes[..issuer_end].to_vec();
    let address_seed_bytes = &public_key_bytes[issuer_end..];

    let normalized_seed = if legacy {
        trim_leading_zeros(address_seed_bytes)
    } else {
        left_pad_zeros(address_seed_bytes, 32)?
    };

    normalized.extend_from_slice(&normalized_seed);
    Ok(normalized)
}

fn trim_leading_zeros(bytes: &[u8]) -> Vec<u8> {
    match bytes.iter().position(|byte| *byte != 0) {
        Some(index) => bytes[index..].to_vec(),
        None => vec![0],
    }
}

fn left_pad_zeros(bytes: &[u8], width: usize) -> Result<Vec<u8>, AuthError> {
    if bytes.len() > width {
        return Err(AuthError::InvalidPublicKeyFormat(format!(
            "zkLogin address seed must be at most {} bytes, got {}",
            width,
            bytes.len()
        )));
    }

    let mut padded = vec![0; width - bytes.len()];
    padded.extend_from_slice(bytes);
    Ok(padded)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use serde_json::json;
    use sui_crypto::{
        ed25519::Ed25519PrivateKey, secp256k1::Secp256k1PrivateKey, secp256r1::Secp256r1PrivateKey,
        SuiSigner,
    };
    use wiremock::matchers::{body_string_contains, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    /// Extract raw 64-byte signature from UserSignature bytes.
    /// Format: flag (1 byte) || signature (64 bytes) || public_key
    fn extract_signature_bytes(user_sig_bytes: &[u8]) -> Vec<u8> {
        user_sig_bytes[1..65].to_vec()
    }

    /// Test Ed25519 signature verification with a real signature
    #[tokio::test]
    async fn test_verify_signature_ed25519() {
        let private_key_hex = "4ac9bd5399f7b41da4f00ec612c4e6521a1c756c41578ed5c15133f96ab9ea78";
        let public_key_hex = "dec9c24a98da1187e30a5824ca2ee1e91e956b7dd6970590651d7d46c5e2ed41";

        let private_key_bytes: [u8; 32] = hex::decode(private_key_hex).unwrap().try_into().unwrap();
        let public_key_bytes = hex::decode(public_key_hex).unwrap();

        // Create signing key using sui-crypto's Ed25519PrivateKey
        let signing_key = Ed25519PrivateKey::new(private_key_bytes);
        let message = b"test message";

        // Sign using SuiSigner trait (handles personal message format internally)
        let personal_message = PersonalMessage(Cow::Borrowed(message.as_slice()));
        let user_signature = signing_key
            .sign_personal_message(&personal_message)
            .unwrap();
        let signature_bytes = extract_signature_bytes(&user_signature.to_bytes());

        // Verify using our function
        let result = verify_signature(
            message,
            &signature_bytes,
            &public_key_bytes,
            SignatureScheme::Ed25519,
            "0x0",
            &Config::default(),
        )
        .await;
        assert!(result.is_ok(), "Ed25519 verification failed: {:?}", result);
    }

    /// Test Secp256k1 signature verification with a real signature
    #[tokio::test]
    async fn test_verify_signature_secp256k1() {
        let private_key_hex = "6ae98ba75c281c5ea3fb80f06f5f1afd8a6b69ec2a02186c73c928d67c96cd4b";

        let private_key_bytes: [u8; 32] = hex::decode(private_key_hex).unwrap().try_into().unwrap();

        // Create signing key using sui-crypto's Secp256k1PrivateKey
        let signing_key = Secp256k1PrivateKey::new(private_key_bytes).unwrap();
        let public_key_bytes = signing_key.public_key().as_bytes().to_vec();

        let message = b"test message";

        // Sign using SuiSigner trait
        let personal_message = PersonalMessage(Cow::Borrowed(message.as_slice()));
        let user_signature = signing_key
            .sign_personal_message(&personal_message)
            .unwrap();
        let signature_bytes = extract_signature_bytes(&user_signature.to_bytes());

        let result = verify_signature(
            message,
            &signature_bytes,
            &public_key_bytes,
            SignatureScheme::Secp256k1,
            "0x0",
            &Config::default(),
        )
        .await;
        assert!(
            result.is_ok(),
            "Secp256k1 verification failed: {:?}",
            result
        );
    }

    /// Test Secp256r1 signature verification
    #[tokio::test]
    async fn test_verify_signature_secp256r1() {
        let private_key_hex = "7e944e7562603f3a6a0d799ca760d9e113de997da5b6915f70716fb371efae90";

        let private_key_bytes: [u8; 32] = hex::decode(private_key_hex).unwrap().try_into().unwrap();

        let signing_key = Secp256r1PrivateKey::new(private_key_bytes);
        let public_key_bytes = signing_key.public_key().as_bytes().to_vec();

        let message = b"test message";

        let personal_message = PersonalMessage(Cow::Borrowed(message.as_slice()));
        let user_signature = signing_key
            .sign_personal_message(&personal_message)
            .unwrap();
        let signature_bytes = extract_signature_bytes(&user_signature.to_bytes());

        let result = verify_signature(
            message,
            &signature_bytes,
            &public_key_bytes,
            SignatureScheme::Secp256r1,
            "0x0",
            &Config::default(),
        )
        .await;
        assert!(
            result.is_ok(),
            "Secp256r1 verification failed: {:?}",
            result
        );
    }

    #[tokio::test]
    async fn test_verify_signature_zklogin_via_graphql() {
        let mock_server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(body_string_contains("verifyZkLoginSignature"))
            .and(body_string_contains("PERSONAL_MESSAGE"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": {
                    "verifyZkLoginSignature": {
                        "success": true
                    }
                }
            })))
            .mount(&mock_server)
            .await;

        let mut config = Config::default();
        config.sui_graphql_url = Some(mock_server.uri());

        let mut public_key_bytes = vec![3];
        public_key_bytes.extend_from_slice(b"iss");
        public_key_bytes.extend_from_slice(&[0u8; 32]);

        let signature_bytes = vec![SignatureScheme::ZkLogin.flag(), 0xAA, 0xBB, 0xCC];

        let result = verify_signature(
            b"test message",
            &signature_bytes,
            &public_key_bytes,
            SignatureScheme::ZkLogin,
            "0x123",
            &config,
        )
        .await;

        assert!(result.is_ok(), "zkLogin verification failed: {:?}", result);
    }

    #[tokio::test]
    async fn test_verify_signature_zklogin_requires_graphql_url() {
        let mut public_key_bytes = vec![3];
        public_key_bytes.extend_from_slice(b"iss");
        public_key_bytes.extend_from_slice(&[0u8; 32]);

        let signature_bytes = vec![SignatureScheme::ZkLogin.flag(), 0xAA, 0xBB];

        let result = verify_signature(
            b"test message",
            &signature_bytes,
            &public_key_bytes,
            SignatureScheme::ZkLogin,
            "0x123",
            &Config::default(),
        )
        .await;

        assert_eq!(
            result.unwrap_err().to_string(),
            "Signature verification failed: zkLogin verification requires SUI_GRAPHQL_URL to be configured"
        );
    }

    // ==================== Ed25519 Tests ====================

    /// Test Ed25519 address derivation
    #[test]
    fn test_derive_sui_address_ed25519() {
        let public_key_hex = "dec9c24a98da1187e30a5824ca2ee1e91e956b7dd6970590651d7d46c5e2ed41";
        let public_key_bytes = hex::decode(public_key_hex).unwrap();
        let expected_address = "0xc45d73cf687682db23be0ebdef5bc203585315b2d6a5a6a613b941e4d4a6a0e7";

        let derived = derive_sui_address(&public_key_bytes, SignatureScheme::Ed25519).unwrap();
        assert_eq!(derived, expected_address);
    }

    #[test]
    fn test_verify_address_matches_ed25519() {
        let public_key_hex = "dec9c24a98da1187e30a5824ca2ee1e91e956b7dd6970590651d7d46c5e2ed41";
        let public_key_bytes = hex::decode(public_key_hex).unwrap();
        let expected_address = "0xc45d73cf687682db23be0ebdef5bc203585315b2d6a5a6a613b941e4d4a6a0e7";

        let result = verify_address_matches_pubkey(
            expected_address,
            &public_key_bytes,
            SignatureScheme::Ed25519,
        );
        assert!(result.is_ok());
    }

    // ==================== Secp256k1 Tests ====================

    /// Test Secp256k1 address derivation
    #[test]
    fn test_derive_sui_address_secp256k1() {
        let public_key_hex = "024324a9c68113352194ff0b8bca673e6d01f67e97f80a827ee9ce898119da9f86";
        let public_key_bytes = hex::decode(public_key_hex).unwrap();
        let expected_address = "0x87ee5d74c3e7ae5145072943685451dfd71a8e911c04f0d90e636ec7d6483543";

        let derived = derive_sui_address(&public_key_bytes, SignatureScheme::Secp256k1).unwrap();
        assert_eq!(derived, expected_address);
    }

    #[test]
    fn test_verify_address_matches_secp256k1() {
        let public_key_hex = "024324a9c68113352194ff0b8bca673e6d01f67e97f80a827ee9ce898119da9f86";
        let public_key_bytes = hex::decode(public_key_hex).unwrap();
        let expected_address = "0x87ee5d74c3e7ae5145072943685451dfd71a8e911c04f0d90e636ec7d6483543";

        let result = verify_address_matches_pubkey(
            expected_address,
            &public_key_bytes,
            SignatureScheme::Secp256k1,
        );
        assert!(result.is_ok());
    }

    // ==================== Secp256r1 Tests ====================

    /// Test Secp256r1 address derivation
    #[test]
    fn test_derive_sui_address_secp256r1() {
        let public_key_hex = "027951b52f60955a34eaac3bb75d086d1c431e45a9b44d0730d29db84ec148511e";
        let public_key_bytes = hex::decode(public_key_hex).unwrap();
        let expected_address = "0x1f4283b353e5d5086bff6b7b68c4149a8c284fa53b0ca34a48cdfb407c6c2c09";

        let derived = derive_sui_address(&public_key_bytes, SignatureScheme::Secp256r1).unwrap();
        assert_eq!(derived, expected_address);
    }

    #[test]
    fn test_verify_address_matches_secp256r1() {
        let public_key_hex = "027951b52f60955a34eaac3bb75d086d1c431e45a9b44d0730d29db84ec148511e";
        let public_key_bytes = hex::decode(public_key_hex).unwrap();
        let expected_address = "0x1f4283b353e5d5086bff6b7b68c4149a8c284fa53b0ca34a48cdfb407c6c2c09";

        let result = verify_address_matches_pubkey(
            expected_address,
            &public_key_bytes,
            SignatureScheme::Secp256r1,
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_verify_address_matches_zklogin_accepts_current_and_legacy_addresses() {
        let mut public_key_bytes = vec![27];
        public_key_bytes.extend_from_slice(b"https://accounts.google.com");
        public_key_bytes.extend_from_slice(&[0u8; 31]);
        public_key_bytes.push(1);

        let current_address = derive_zklogin_address(&public_key_bytes, false).unwrap();
        let legacy_address = derive_zklogin_address(&public_key_bytes, true).unwrap();

        assert_ne!(current_address, legacy_address);
        assert!(
            verify_address_matches_pubkey(
                &current_address,
                &public_key_bytes,
                SignatureScheme::ZkLogin,
            )
            .is_ok()
        );
        assert!(
            verify_address_matches_pubkey(
                &legacy_address,
                &public_key_bytes,
                SignatureScheme::ZkLogin,
            )
            .is_ok()
        );
    }

    // ==================== Address Mismatch Test ====================

    #[test]
    fn test_verify_address_mismatch() {
        let public_key_hex = "dec9c24a98da1187e30a5824ca2ee1e91e956b7dd6970590651d7d46c5e2ed41";
        let public_key_bytes = hex::decode(public_key_hex).unwrap();
        let wrong_address = "0x1f4283b353e5d5086bff6b7b68c4149a8c284fa53b0ca34a48cdfb407c6c2c10";

        let result = verify_address_matches_pubkey(
            wrong_address,
            &public_key_bytes,
            SignatureScheme::Ed25519,
        );
        assert!(result.is_err());
    }

    // ==================== Timestamp Tests ====================

    #[test]
    fn test_validate_timestamp_valid() {
        let now = chrono::Utc::now().timestamp();
        let ttl = 300;

        assert!(validate_timestamp(now, ttl).is_ok());
        assert!(validate_timestamp(now - 60, ttl).is_ok());
        assert!(validate_timestamp(now + 60, ttl).is_ok());
    }

    #[test]
    fn test_validate_timestamp_expired() {
        let now = chrono::Utc::now().timestamp();
        let ttl = 300;

        assert!(validate_timestamp(now - 600, ttl).is_err());
        assert!(validate_timestamp(now + 600, ttl).is_err());
    }
}
