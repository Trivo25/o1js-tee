import type { VerifyResult } from '../enclave/worker.js';
import {
  assertValidSignedVerifyResult,
  type SignedResultVerificationOptions,
} from './verifySignedResult.js';

export type AttestationBinding = {
  nonce: string;
  transcriptHash: string;
  signingPublicKeyDer: string;
};

export type AttestationVerifier = {
  verifyAttestation(
    attestationDocument: string,
    expected: AttestationBinding
  ): Promise<void> | void;
};

export type AttestedResultVerificationOptions =
  SignedResultVerificationOptions & {
    attestationVerifier: AttestationVerifier;
  };

export async function assertValidAttestedVerifyResult(
  result: VerifyResult,
  options: AttestedResultVerificationOptions
): Promise<void> {
  assertValidSignedVerifyResult(result, options);

  await options.attestationVerifier.verifyAttestation(result.attestationDocument, {
    nonce: result.transcript.nonce,
    transcriptHash: result.transcriptHash,
    signingPublicKeyDer: result.signingPublicKeyDer,
  });
}
