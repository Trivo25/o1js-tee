import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAttestationProviderFromEnv,
  createFakeAttestationProvider,
} from '../../src/enclave/attest.js';

test('createAttestationProviderFromEnv fails closed by default', () => {
  assert.throws(
    () => createAttestationProviderFromEnv({}),
    /Nitro attestation provider is not configured/
  );
});

test('createAttestationProviderFromEnv enables fake provider explicitly', async () => {
  const provider = createAttestationProviderFromEnv({
    ALLOW_FAKE_ATTESTATION: '1',
  });

  const attestationDocument = await provider.attest({
    publicKeyDer: Buffer.from('public-key'),
    nonce: 'nonce-1',
    transcriptHash: 'abc123',
  });

  assert.deepEqual(decodeFakeAttestation(attestationDocument), {
    kind: 'fake-nitro-attestation',
    publicKeyDer: Buffer.from('public-key').toString('base64'),
    nonce: 'nonce-1',
    transcriptHash: 'abc123',
  });
});

test('createFakeAttestationProvider binds request fields', async () => {
  const attestationDocument = await createFakeAttestationProvider().attest({
    publicKeyDer: Buffer.from([1, 2, 3]),
    nonce: 'nonce-2',
    transcriptHash: 'def456',
  });

  const decoded = decodeFakeAttestation(attestationDocument);

  assert.equal(decoded.publicKeyDer, Buffer.from([1, 2, 3]).toString('base64'));
  assert.equal(decoded.nonce, 'nonce-2');
  assert.equal(decoded.transcriptHash, 'def456');
});

function decodeFakeAttestation(attestationDocument: string): any {
  return JSON.parse(Buffer.from(attestationDocument, 'base64').toString('utf8'));
}
