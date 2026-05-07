import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { createFakeAttestationProvider } from '../../src/enclave/attest.js';
import { loadVerificationKey } from '../../src/enclave/loadVerificationKey.js';
import {
  createEphemeralSigner,
  verifySignature,
} from '../../src/enclave/signing.js';
import { createVerifyHandler } from '../../src/enclave/worker.js';

test('createVerifyHandler returns signed attested result for valid proof', async () => {
  const proof = await readJson('fixtures/valid-proof.json');
  const expectedPublic = await readJson('fixtures/expected-public.json');
  const verificationKey = await loadVerificationKey('fixtures/verification-key.json');
  const signer = createEphemeralSigner();
  const handler = createVerifyHandler({
    verificationKey,
    signer,
    attestationProvider: createFakeAttestationProvider(),
  });

  const result = await handler({
    nonce: 'nonce-1',
    proof,
    expectedPublicInput: expectedPublic.publicInput,
    expectedPublicOutput: expectedPublic.publicOutput,
  });

  assert.equal(result.type, 'verifyResult');
  assert.equal(result.transcript.ok, true);
  assert.equal(result.transcript.nonce, 'nonce-1');
  assert.equal(
    verifySignature(
      Buffer.from(result.signingPublicKeyDer, 'base64'),
      Buffer.from(result.transcriptHash, 'hex'),
      Buffer.from(result.signature, 'base64')
    ),
    true
  );

  const attestation = decodeFakeAttestation(result.attestationDocument);
  assert.equal(attestation.publicKeyDer, result.signingPublicKeyDer);
  assert.equal(attestation.nonce, 'nonce-1');
  assert.equal(attestation.transcriptHash, result.transcriptHash);
});

test('createVerifyHandler signs attested result for rejected proof', async () => {
  const proof = await readJson('fixtures/valid-proof.json');
  const verificationKey = await loadVerificationKey('fixtures/verification-key.json');
  const handler = createVerifyHandler({
    verificationKey,
    signer: createEphemeralSigner(),
    attestationProvider: createFakeAttestationProvider(),
  });

  const result = await handler({
    nonce: 'nonce-1',
    proof,
    expectedPublicOutput: ['43'],
  });

  assert.equal(result.transcript.ok, false);
  assert.equal(result.signature.length > 0, true);
  assert.equal(result.attestationDocument.length > 0, true);
});

async function readJson(path: string): Promise<any> {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

function decodeFakeAttestation(attestationDocument: string): any {
  return JSON.parse(Buffer.from(attestationDocument, 'base64').toString('utf8'));
}
