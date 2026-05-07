import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createFakeAttestationProvider } from '../../src/enclave/attest.js';
import { loadVerificationKey } from '../../src/enclave/loadVerificationKey.js';
import {
  LengthPrefixedJsonReader,
  writeLengthPrefixedJson,
} from '../../src/protocol/lengthPrefixedJson.js';
import {
  createEphemeralSigner,
  verifySignature,
} from '../../src/enclave/signing.js';
import {
  createDefaultVerifyHandler,
  createVerifyHandler,
  handleWorkerMessage,
  runWorkerStreams,
  type VerifyResult,
} from '../../src/enclave/worker.js';

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

test('createDefaultVerifyHandler loads env-configured fixed key', async () => {
  const handler = await createDefaultVerifyHandler({
    VERIFICATION_KEY_PATH: 'fixtures/verification-key.json',
    ALLOW_FAKE_ATTESTATION: '1',
  });

  assert.equal(typeof handler, 'function');
});

test('handleWorkerMessage rejects unsupported request types', async () => {
  const response = await handleWorkerMessage(
    { type: 'unknown' },
    async () => mockVerifyResult()
  );

  assert.deepEqual(response, {
    type: 'error',
    error: 'unsupported request type',
  });
});

test('handleWorkerMessage converts malformed verify requests to error responses', async () => {
  const verificationKey = await loadVerificationKey('fixtures/verification-key.json');
  const handler = createVerifyHandler({
    verificationKey,
    signer: createEphemeralSigner(),
    attestationProvider: createFakeAttestationProvider(),
  });

  const response = await handleWorkerMessage({ type: 'verify' }, handler);

  assert.deepEqual(response, {
    type: 'error',
    error: 'missing nonce',
  });
});

test('runWorkerStreams reads framed requests and writes framed responses', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const outputReader = new LengthPrefixedJsonReader(output);

  await writeLengthPrefixedJson(input, { type: 'verify', nonce: 'nonce-1' });
  input.end();

  await runWorkerStreams({
    readable: input,
    writable: output,
    handleVerifyRequest: async () => mockVerifyResult(),
    maxFrameBytes: 1024,
  });

  assert.deepEqual(await outputReader.read(1024), mockVerifyResult());
});

test('runWorkerStreams writes error response for malformed frames', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const outputReader = new LengthPrefixedJsonReader(output);

  input.end(Buffer.from([0, 0, 0]));

  await runWorkerStreams({
    readable: input,
    writable: output,
    handleVerifyRequest: async () => mockVerifyResult(),
    maxFrameBytes: 1024,
  });

  assert.deepEqual(await outputReader.read(1024), {
    type: 'error',
    error: 'truncated frame header',
  });
});

async function readJson(path: string): Promise<any> {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

function decodeFakeAttestation(attestationDocument: string): any {
  return JSON.parse(Buffer.from(attestationDocument, 'base64').toString('utf8'));
}

function mockVerifyResult(): VerifyResult {
  return {
    type: 'verifyResult',
    transcript: {
      ok: true,
      nonce: 'nonce-1',
      proofHash: 'proof-hash',
      verificationKeyHash: 'vk-hash',
      publicInput: [],
      publicOutput: [],
      policyVersion: 'o1js-nitro-verifier-v1',
    },
    transcriptHash: 'transcript-hash',
    signature: 'signature',
    signingPublicKeyDer: 'public-key',
    attestationDocument: 'attestation',
  };
}
