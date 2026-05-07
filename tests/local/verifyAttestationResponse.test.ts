import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  assertValidAttestedVerifyResult,
  type AttestationBinding,
  type AttestationVerifier,
} from '../../src/client/verifyAttestationResponse.js';
import { createFakeAttestationProvider } from '../../src/enclave/attest.js';
import { loadVerificationKey } from '../../src/enclave/loadVerificationKey.js';
import { createEphemeralSigner } from '../../src/enclave/signing.js';
import { createVerifyHandler } from '../../src/enclave/worker.js';

test('assertValidAttestedVerifyResult verifies signature and attestation binding', async () => {
  const { result, proof, verificationKey } = await signedFixtureResult();
  const attestationVerifier = new RecordingAttestationVerifier();

  await assert.doesNotReject(() =>
    assertValidAttestedVerifyResult(result, {
      nonce: 'nonce-1',
      proof,
      verificationKey,
      attestationVerifier,
    })
  );

  assert.deepEqual(attestationVerifier.calls, [
    {
      attestationDocument: result.attestationDocument,
      expected: {
        nonce: 'nonce-1',
        transcriptHash: result.transcriptHash,
        signingPublicKeyDer: result.signingPublicKeyDer,
      },
    },
  ]);
});

test('assertValidAttestedVerifyResult rejects signed-result failures before attestation', async () => {
  const { result, proof, verificationKey } = await signedFixtureResult();
  const attestationVerifier = new RecordingAttestationVerifier();

  await assert.rejects(
    () =>
      assertValidAttestedVerifyResult(result, {
        nonce: 'different-nonce',
        proof,
        verificationKey,
        attestationVerifier,
      }),
    /nonce mismatch/
  );

  assert.deepEqual(attestationVerifier.calls, []);
});

test('assertValidAttestedVerifyResult propagates attestation verifier failure', async () => {
  const { result, proof, verificationKey } = await signedFixtureResult();

  await assert.rejects(
    () =>
      assertValidAttestedVerifyResult(result, {
        nonce: 'nonce-1',
        proof,
        verificationKey,
        attestationVerifier: {
          verifyAttestation() {
            throw new Error('attestation rejected');
          },
        },
      }),
    /attestation rejected/
  );
});

class RecordingAttestationVerifier implements AttestationVerifier {
  calls: Array<{
    attestationDocument: string;
    expected: AttestationBinding;
  }> = [];

  verifyAttestation(
    attestationDocument: string,
    expected: AttestationBinding
  ): void {
    this.calls.push({ attestationDocument, expected });
  }
}

async function signedFixtureResult() {
  const proof = await readJson('fixtures/valid-proof.json');
  const expectedPublic = await readJson('fixtures/expected-public.json');
  const verificationKey = await loadVerificationKey('fixtures/verification-key.json');
  const handler = createVerifyHandler({
    verificationKey,
    signer: createEphemeralSigner(),
    attestationProvider: createFakeAttestationProvider(),
  });
  const result = await handler({
    nonce: 'nonce-1',
    proof,
    expectedPublicInput: expectedPublic.publicInput,
    expectedPublicOutput: expectedPublic.publicOutput,
  });

  return { result, proof, verificationKey };
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}
