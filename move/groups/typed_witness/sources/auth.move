module typed_witness::auth;

use std::type_name;

const ENotAuthorized: u64 = 0;

/// Typed witness authentication token indicating permission to perform an action.
///
/// The phantom type `Permission` represents the specific permission granted by this token.
/// The Auth<SpecificPermission> is only usable in the module that defines `SpecificPermission`
/// e.g. Auth<MintNFTPermission> could only be used in the module that defines MintNFTPermission,
/// and a mint function requiring an Auth<MintNFTPermission> argument.
public struct Auth<phantom Permission: drop>() has drop;
