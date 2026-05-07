import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { assertValidSignedVerifyResult } from '../../src/client/verifySignedResult.js';
import { createFakeAttestationProvider } from '../../src/enclave/attest.js';
import { loadVerificationKey } from '../../src/enclave/loadVerificationKey.js';
import { createEphemeralSigner } from '../../src/enclave/signing.js';
import {
  createVerifyHandler,
  type VerifyResult,
} from '../../src/enclave/worker.js';

test('assertValidSignedVerifyResult accepts signed enclave result', async () => {
  const { result, proof, verificationKey } = await signedFixtureResult();

  assert.doesNotThrow(() =>
    assertValidSignedVerifyResult(result, {
      nonce: 'nonce-1',
      proof,
      verificationKey,
    })
  );
});

test('assertValidSignedVerifyResult rejects transcript hash mismatch', async () => {
  const { result, proof, verificationKey } = await signedFixtureResult();

  assert.throws(
    () =>
      assertValidSignedVerifyResult(
        { ...result, transcriptHash: '00' },
        {
          nonce: 'nonce-1',
          proof,
          verificationKey,
        }
      ),
    /transcript hash mismatch/
  );
});

test('assertValidSignedVerifyResult rejects nonce mismatch', async () => {
  const { result, proof, verificationKey } = await signedFixtureResult();

  assert.throws(
    () =>
      assertValidSignedVerifyResult(result, {
        nonce: 'different-nonce',
        proof,
        verificationKey,
      }),
    /nonce mismatch/
  );
});

test('assertValidSignedVerifyResult rejects non-ok transcript by default', async () => {
  const { proof, verificationKey } = await signedFixtureResult();
  const result = await rejectedSignedFixtureResult();

  assert.throws(
    () =>
      assertValidSignedVerifyResult(result, {
        nonce: 'nonce-1',
        proof,
        verificationKey,
      }),
    /proof was not accepted/
  );
});

test('assertValidSignedVerifyResult can accept rejected transcript explicitly', async () => {
  const { proof, verificationKey } = await signedFixtureResult();
  const result = await rejectedSignedFixtureResult();

  assert.doesNotThrow(() =>
    assertValidSignedVerifyResult(result, {
      nonce: 'nonce-1',
      proof,
      verificationKey,
      requireOk: false,
    })
  );
});

test('assertValidSignedVerifyResult rejects proof hash mismatch', async () => {
  const { result, verificationKey } = await signedFixtureResult();
  const differentProof = { ...(await readJson('fixtures/valid-proof.json')) };
  differentProof.publicOutput = ['different'];

  assert.throws(
    () =>
      assertValidSignedVerifyResult(result, {
        nonce: 'nonce-1',
        proof: differentProof,
        verificationKey,
      }),
    /proof hash mismatch/
  );
});

test('assertValidSignedVerifyResult rejects verification key hash mismatch', async () => {
  const { result, proof, verificationKey } = await signedFixtureResult();

  assert.throws(
    () =>
      assertValidSignedVerifyResult(result, {
        nonce: 'nonce-1',
        proof,
        verificationKey: { ...verificationKey, hash: 'different' },
      }),
    /verification key hash mismatch/
  );
});

test('assertValidSignedVerifyResult rejects signature mismatch', async () => {
  const { result, proof, verificationKey } = await signedFixtureResult();

  assert.throws(
    () =>
      assertValidSignedVerifyResult(
        { ...result, signature: Buffer.from('bad-signature').toString('base64') },
        {
          nonce: 'nonce-1',
          proof,
          verificationKey,
        }
      ),
    /signature verification failed/
  );
});

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

async function rejectedSignedFixtureResult(): Promise<VerifyResult> {
  const proof = await readJson('fixtures/valid-proof.json');
  const verificationKey = await loadVerificationKey('fixtures/verification-key.json');
  const handler = createVerifyHandler({
    verificationKey,
    signer: createEphemeralSigner(),
    attestationProvider: createFakeAttestationProvider(),
  });

  return handler({
    nonce: 'nonce-1',
    proof,
    expectedPublicOutput: ['different'],
  });
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}
