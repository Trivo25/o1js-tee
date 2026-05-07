import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { sha256Canonical } from '../../src/enclave/canonicalJson.js';
import {
  assertValidVerifyRequest,
  buildPolicyTranscript,
  verifyRequest,
} from '../../src/enclave/verifyRequest.js';

const proof = {
  publicInput: ['10'],
  publicOutput: ['42'],
  maxProofsVerified: 0,
  proof: 'base64-proof',
} as const;

const verificationKey = {
  data: 'base64-verification-key',
  hash: '123',
};

test('assertValidVerifyRequest accepts minimal request shape', () => {
  assert.doesNotThrow(() =>
    assertValidVerifyRequest({
      nonce: 'nonce-1',
      proof: {
        publicInput: ['10'],
        publicOutput: ['42'],
        maxProofsVerified: 0,
        proof: 'base64-proof',
      },
    })
  );
});

test('assertValidVerifyRequest rejects non-object requests', () => {
  assert.throws(() => assertValidVerifyRequest(null), /request must be an object/);
});

test('assertValidVerifyRequest rejects missing nonce', () => {
  assert.throws(() => assertValidVerifyRequest({ proof: {} }), /missing nonce/);
});

test('assertValidVerifyRequest rejects empty nonce', () => {
  assert.throws(
    () => assertValidVerifyRequest({ nonce: '', proof: {} }),
    /missing nonce/
  );
});

test('assertValidVerifyRequest rejects missing proof', () => {
  assert.throws(
    () => assertValidVerifyRequest({ nonce: 'nonce-1' }),
    /missing proof/
  );
});

test('buildPolicyTranscript accepts matching expected public values', () => {
  const { transcript, transcriptHash } = buildPolicyTranscript(
    {
      nonce: 'nonce-1',
      proof,
      expectedPublicInput: ['10'],
      expectedPublicOutput: ['42'],
    },
    verificationKey
  );

  assert.equal(transcript.ok, true);
  assert.equal(transcript.nonce, 'nonce-1');
  assert.equal(transcript.proofHash, sha256Canonical(proof));
  assert.equal(transcript.verificationKeyHash, sha256Canonical(verificationKey));
  assert.deepEqual(transcript.publicInput, ['10']);
  assert.deepEqual(transcript.publicOutput, ['42']);
  assert.equal(transcript.policyVersion, 'o1js-nitro-verifier-v1');
  assert.equal(transcriptHash, sha256Canonical(transcript));
});

test('buildPolicyTranscript rejects mismatched expected public input', () => {
  const { transcript } = buildPolicyTranscript(
    {
      nonce: 'nonce-1',
      proof,
      expectedPublicInput: ['11'],
      expectedPublicOutput: ['42'],
    },
    verificationKey
  );

  assert.equal(transcript.ok, false);
});

test('buildPolicyTranscript rejects mismatched expected public output', () => {
  const { transcript } = buildPolicyTranscript(
    {
      nonce: 'nonce-1',
      proof,
      expectedPublicInput: ['10'],
      expectedPublicOutput: ['43'],
    },
    verificationKey
  );

  assert.equal(transcript.ok, false);
});

test('verifyRequest accepts generated fixture proof', async () => {
  const fixtureProof = await readJson('fixtures/valid-proof.json');
  const fixtureVerificationKey = await readJson('fixtures/verification-key.json');
  const expectedPublic = await readJson('fixtures/expected-public.json');

  const { transcript, transcriptHash } = await verifyRequest(
    {
      nonce: 'nonce-1',
      proof: fixtureProof,
      expectedPublicInput: expectedPublic.publicInput,
      expectedPublicOutput: expectedPublic.publicOutput,
    },
    fixtureVerificationKey
  );

  assert.equal(transcript.ok, true);
  assert.equal(transcript.proofHash, sha256Canonical(fixtureProof));
  assert.equal(
    transcript.verificationKeyHash,
    sha256Canonical(fixtureVerificationKey)
  );
  assert.equal(transcriptHash, sha256Canonical(transcript));
});

test('verifyRequest rejects mismatched expected public output before proof verification', async () => {
  const fixtureProof = await readJson('fixtures/valid-proof.json');
  const fixtureVerificationKey = await readJson('fixtures/verification-key.json');

  const { transcript } = await verifyRequest(
    {
      nonce: 'nonce-1',
      proof: {
        ...fixtureProof,
        proof: 'not-base64-proof',
      },
      expectedPublicOutput: ['43'],
    },
    fixtureVerificationKey
  );

  assert.equal(transcript.ok, false);
});

test('verifyRequest rejects invalid verification key', async () => {
  const fixtureProof = await readJson('fixtures/valid-proof.json');

  const { transcript } = await verifyRequest(
    {
      nonce: 'nonce-1',
      proof: fixtureProof,
    },
    {
      data: 'not-a-verification-key',
      hash: '0',
    }
  );

  assert.equal(transcript.ok, false);
});

async function readJson(path: string): Promise<any> {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}
