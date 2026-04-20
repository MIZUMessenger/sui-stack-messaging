/**
 * Adapter that wraps dapp-kit's signPersonalMessage into a Signer-compatible object
 * for use with the messaging SDK's relayer transport.
 *
 * Lazily extracts the public key from the first signature when the wallet
 * doesn't expose publicKey upfront, which is useful for wallet adapters that
 * derive the signing identity dynamically, including zkLogin-backed wallets.
 */
import { Signer, parseSerializedSignature, SIGNATURE_FLAG_TO_SCHEME } from '@mysten/sui/cryptography';
import type { PublicKey, SignatureScheme } from '@mysten/sui/cryptography';
import { publicKeyFromRawBytes, publicKeyFromSuiBytes } from '@mysten/sui/verify';
import { toBase64 } from '@mysten/sui/utils';

export type SignPersonalMessageFn = (args: {
  message: Uint8Array;
}) => Promise<{ signature: string }>;

export class DappKitSigner extends Signer {
  readonly #address: string;
  #publicKey: PublicKey | null;
  readonly #signPersonalMessage: SignPersonalMessageFn;

  constructor(opts: {
    address: string;
    publicKeyBytes?: Uint8Array;
    signPersonalMessage: SignPersonalMessageFn;
  }) {
    super();
    this.#address = opts.address;
    this.#publicKey =
      opts.publicKeyBytes?.length
        ? publicKeyFromSuiBytes(opts.publicKeyBytes)
        : null;
    this.#signPersonalMessage = opts.signPersonalMessage;
  }

  async sign(_bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    throw new Error(
      'DappKitSigner.sign() is not supported. Use signPersonalMessage() instead.',
    );
  }

  override async signPersonalMessage(
    bytes: Uint8Array,
  ): Promise<{ bytes: string; signature: string }> {
    const { signature } = await this.#signPersonalMessage({
      message: bytes,
    });

    // Extract public key from the signature if not already known
    if (!this.#publicKey) {
      const parsed = parseSerializedSignature(signature);
      if ('publicKey' in parsed && parsed.publicKey) {
        this.#publicKey = publicKeyFromRawBytes(
          parsed.signatureScheme,
          parsed.publicKey,
        );
      }
    }

    return { bytes: toBase64(bytes), signature };
  }

  getKeyScheme(): SignatureScheme {
    if (!this.#publicKey) {
      return 'ED25519'; // default until first signature resolves it
    }
    return SIGNATURE_FLAG_TO_SCHEME[
      this.#publicKey.flag() as keyof typeof SIGNATURE_FLAG_TO_SCHEME
    ] ?? 'ED25519';
  }

  getPublicKey(): PublicKey {
    if (!this.#publicKey) {
      throw new Error(
        'Public key not yet available. It will be resolved after the first signPersonalMessage call.',
      );
    }
    return this.#publicKey;
  }

  override toSuiAddress(): string {
    return this.#address;
  }
}
