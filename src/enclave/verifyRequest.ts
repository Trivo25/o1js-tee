import { verify, type JsonProof, type VerificationKey } from 'o1js';
import {
  equalCanonicalJson,
  sha256Canonical,
} from './canonicalJson.js';

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

export type SerializedVerificationKey = {
  data: string;
  hash: string;
};

export type VerificationKeyInput = VerificationKey | SerializedVerificationKey | string;

export async function verifyRequest(
  req: unknown,
  verificationKey: VerificationKeyInput
): Promise<{ transcript: VerifyTranscript; transcriptHash: string }> {
  assertValidVerifyRequest(req);

  const policyOk = publicInputMatches(req) && publicOutputMatches(req);
  const proofOk = policyOk ? await verifyProof(req.proof, verificationKey) : false;

  return buildTranscript(req, verificationKey, policyOk && proofOk);
}

export function buildPolicyTranscript(
  req: unknown,
  verificationKey: VerificationKeyInput
): { transcript: VerifyTranscript; transcriptHash: string } {
  assertValidVerifyRequest(req);

  return buildTranscript(
    req,
    verificationKey,
    publicInputMatches(req) && publicOutputMatches(req)
  );
}

function buildTranscript(
  req: VerifyRequest,
  verificationKey: VerificationKeyInput,
  ok: boolean
): { transcript: VerifyTranscript; transcriptHash: string } {
  const transcript: VerifyTranscript = {
    ok,
    nonce: req.nonce,
    proofHash: sha256Canonical(req.proof),
    verificationKeyHash: sha256Canonical(verificationKey),
    publicInput: req.proof.publicInput,
    publicOutput: req.proof.publicOutput,
    policyVersion: 'o1js-nitro-verifier-v1',
  };

  return {
    transcript,
    transcriptHash: sha256Canonical(transcript),
  };
}

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

function publicInputMatches(req: VerifyRequest): boolean {
  return (
    req.expectedPublicInput === undefined ||
    equalCanonicalJson(req.proof.publicInput, req.expectedPublicInput)
  );
}

function publicOutputMatches(req: VerifyRequest): boolean {
  return (
    req.expectedPublicOutput === undefined ||
    equalCanonicalJson(req.proof.publicOutput, req.expectedPublicOutput)
  );
}

async function verifyProof(
  proof: JsonProof,
  verificationKey: VerificationKeyInput
): Promise<boolean> {
  try {
    return await verify(proof, verificationKeyForO1js(verificationKey));
  } catch {
    return false;
  }
}

function verificationKeyForO1js(
  verificationKey: VerificationKeyInput
): VerificationKey | string {
  return typeof verificationKey === 'string'
    ? verificationKey
    : verificationKey.data;
}
