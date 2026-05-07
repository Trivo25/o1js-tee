import type { JsonProof } from 'o1js';
import type { VerifyResult } from '../enclave/worker.js';
import { sha256Canonical } from '../enclave/canonicalJson.js';
import { verifySignature } from '../enclave/signing.js';
import type { VerificationKeyInput } from '../enclave/verifyRequest.js';

export type SignedResultVerificationOptions = {
  nonce: string;
  proof?: JsonProof;
  verificationKey?: VerificationKeyInput;
  requireOk?: boolean;
};

export function assertValidSignedVerifyResult(
  result: VerifyResult,
  options: SignedResultVerificationOptions
): void {
  const requireOk = options.requireOk ?? true;
  const expectedTranscriptHash = sha256Canonical(result.transcript);

  if (result.transcriptHash !== expectedTranscriptHash) {
    throw new Error('transcript hash mismatch');
  }

  if (result.transcript.nonce !== options.nonce) {
    throw new Error('nonce mismatch');
  }

  if (requireOk && result.transcript.ok !== true) {
    throw new Error('proof was not accepted by enclave policy');
  }

  if (
    options.proof !== undefined &&
    result.transcript.proofHash !== sha256Canonical(options.proof)
  ) {
    throw new Error('proof hash mismatch');
  }

  if (
    options.verificationKey !== undefined &&
    result.transcript.verificationKeyHash !== sha256Canonical(options.verificationKey)
  ) {
    throw new Error('verification key hash mismatch');
  }

  if (
    !verifySignature(
      Buffer.from(result.signingPublicKeyDer, 'base64'),
      Buffer.from(result.transcriptHash, 'hex'),
      Buffer.from(result.signature, 'base64')
    )
  ) {
    throw new Error('signature verification failed');
  }
}
