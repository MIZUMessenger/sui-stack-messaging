//! Sui signature schemes used by relayer auth.
//! - Ed25519 (flag 0x00): 32-byte public key, 64-byte signature
//! - Secp256k1 (flag 0x01): 33-byte compressed public key, 64-byte signature
//! - Secp256r1 (flag 0x02): 33-byte compressed public key, 64-byte signature
//! - ZkLogin (flag 0x05): variable-length public identifier, non-compact signature

use std::fmt;

/// Sui signature schemes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SignatureScheme {
    Ed25519,

    Secp256k1,

    Secp256r1,

    ZkLogin,
}

impl SignatureScheme {
    pub fn from_flag(flag: u8) -> Option<Self> {
        match flag {
            0x00 => Some(SignatureScheme::Ed25519),
            0x01 => Some(SignatureScheme::Secp256k1),
            0x02 => Some(SignatureScheme::Secp256r1),
            0x05 => Some(SignatureScheme::ZkLogin),
            _ => None,
        }
    }

    /// Returns the flag byte for this scheme.
    pub fn flag(&self) -> u8 {
        match self {
            SignatureScheme::Ed25519 => 0x00,
            SignatureScheme::Secp256k1 => 0x01,
            SignatureScheme::Secp256r1 => 0x02,
            SignatureScheme::ZkLogin => 0x05,
        }
    }

    /// Returns the expected fixed public key length in bytes, if the scheme has one.
    pub fn public_key_length(&self) -> Option<usize> {
        match self {
            SignatureScheme::Ed25519 => Some(32),
            SignatureScheme::Secp256k1 => Some(33),
            SignatureScheme::Secp256r1 => Some(33),
            SignatureScheme::ZkLogin => None,
        }
    }

    /// Returns the expected fixed raw signature length in bytes, if the scheme uses one.
    #[allow(dead_code)]
    pub fn signature_length(&self) -> Option<usize> {
        match self {
            SignatureScheme::Ed25519 | SignatureScheme::Secp256k1 | SignatureScheme::Secp256r1 => {
                Some(64)
            }
            SignatureScheme::ZkLogin => None,
        }
    }

    /// Validates the public key bytes or public identifier for this scheme.
    pub fn validate_public_key(&self, public_key_bytes: &[u8]) -> Result<(), String> {
        match self {
            SignatureScheme::Ed25519 => {
                validate_fixed_public_key_length(self, public_key_bytes, 32)
            }
            SignatureScheme::Secp256k1 => {
                validate_fixed_public_key_length(self, public_key_bytes, 33)
            }
            SignatureScheme::Secp256r1 => {
                validate_fixed_public_key_length(self, public_key_bytes, 33)
            }
            SignatureScheme::ZkLogin => validate_zklogin_public_identifier(public_key_bytes),
        }
    }

    /// Whether the relayer's current header auth format can verify this scheme.
    pub fn supports_raw_signature_auth(&self) -> bool {
        self.signature_length().is_some()
    }
}

impl fmt::Display for SignatureScheme {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SignatureScheme::Ed25519 => write!(f, "Ed25519"),
            SignatureScheme::Secp256k1 => write!(f, "Secp256k1"),
            SignatureScheme::Secp256r1 => write!(f, "Secp256r1"),
            SignatureScheme::ZkLogin => write!(f, "ZkLogin"),
        }
    }
}

fn validate_fixed_public_key_length(
    scheme: &SignatureScheme,
    public_key_bytes: &[u8],
    expected_len: usize,
) -> Result<(), String> {
    if public_key_bytes.len() != expected_len {
        return Err(format!(
            "Expected {} bytes for {}, got {}",
            expected_len,
            scheme,
            public_key_bytes.len()
        ));
    }

    Ok(())
}

fn validate_zklogin_public_identifier(public_key_bytes: &[u8]) -> Result<(), String> {
    let iss_len = *public_key_bytes
        .first()
        .ok_or_else(|| "Empty zkLogin public identifier".to_string())? as usize;
    let issuer_end = 1 + iss_len;

    if public_key_bytes.len() < issuer_end {
        return Err(format!(
            "zkLogin issuer length {} exceeds available bytes {}",
            iss_len,
            public_key_bytes.len().saturating_sub(1)
        ));
    }

    let issuer_bytes = &public_key_bytes[1..issuer_end];
    std::str::from_utf8(issuer_bytes)
        .map_err(|e| format!("zkLogin issuer is not valid UTF-8: {}", e))?;

    let address_seed_bytes = &public_key_bytes[issuer_end..];
    if address_seed_bytes.is_empty() {
        return Err("zkLogin public identifier missing address seed".to_string());
    }

    if address_seed_bytes.len() > 32 {
        return Err(format!(
            "zkLogin address seed must be at most 32 bytes, got {}",
            address_seed_bytes.len()
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_flag() {
        assert_eq!(
            SignatureScheme::from_flag(0x00),
            Some(SignatureScheme::Ed25519)
        );
        assert_eq!(
            SignatureScheme::from_flag(0x01),
            Some(SignatureScheme::Secp256k1)
        );
        assert_eq!(
            SignatureScheme::from_flag(0x02),
            Some(SignatureScheme::Secp256r1)
        );
        assert_eq!(
            SignatureScheme::from_flag(0x05),
            Some(SignatureScheme::ZkLogin)
        );
        assert_eq!(SignatureScheme::from_flag(0x03), None);
        assert_eq!(SignatureScheme::from_flag(0xFF), None);
    }

    #[test]
    fn test_flag() {
        assert_eq!(SignatureScheme::Ed25519.flag(), 0x00);
        assert_eq!(SignatureScheme::Secp256k1.flag(), 0x01);
        assert_eq!(SignatureScheme::Secp256r1.flag(), 0x02);
        assert_eq!(SignatureScheme::ZkLogin.flag(), 0x05);
    }

    #[test]
    fn test_public_key_length() {
        assert_eq!(SignatureScheme::Ed25519.public_key_length(), Some(32));
        assert_eq!(SignatureScheme::Secp256k1.public_key_length(), Some(33));
        assert_eq!(SignatureScheme::Secp256r1.public_key_length(), Some(33));
        assert_eq!(SignatureScheme::ZkLogin.public_key_length(), None);
    }

    #[test]
    fn test_validate_zklogin_public_identifier() {
        let mut zklogin_public_identifier = vec![27];
        zklogin_public_identifier.extend_from_slice(b"https://accounts.google.com");
        zklogin_public_identifier.extend_from_slice(&[0u8; 32]);

        assert!(SignatureScheme::ZkLogin
            .validate_public_key(&zklogin_public_identifier)
            .is_ok());
    }

    #[test]
    fn test_validate_zklogin_public_identifier_requires_address_seed() {
        let mut zklogin_public_identifier = vec![3];
        zklogin_public_identifier.extend_from_slice(b"iss");

        let error = SignatureScheme::ZkLogin
            .validate_public_key(&zklogin_public_identifier)
            .unwrap_err();
        assert_eq!(error, "zkLogin public identifier missing address seed");
    }
}
