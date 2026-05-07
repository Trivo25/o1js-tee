import type { JsonProof, VerificationKey } from 'o1js';

export type VerifyRequest = {
  nonce: string;
  proof: JsonProof;
  expectedPublicInput?: string[];
  expectedPublicOutput?: string[];
};

export type VerifyTranscript = {
  ok: boolean;
  nonce: string;
  proofHash: string;
  verificationKeyHash: string;
  publicInput: unknown;
  publicOutput: unknown;
  policyVersion: 'o1js-nitro-verifier-v1';
};

export type VerificationKeyInput = VerificationKey | string;

export function assertValidVerifyRequest(req: unknown): asserts req is VerifyRequest {
  if (!isRecord(req)) {
    throw new Error('request must be an object');
  }

  if (typeof req.nonce !== 'string' || req.nonce.length === 0) {
    throw new Error('missing nonce');
  }

  if (!isRecord(req.proof)) {
    throw new Error('missing proof');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
