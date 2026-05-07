import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isVerifyProtocolRequest,
  isWorkerProtocolResponse,
} from '../../src/protocol/schemas.js';

test('isVerifyProtocolRequest accepts minimal verify request', () => {
  assert.equal(
    isVerifyProtocolRequest({
      type: 'verify',
      nonce: 'nonce-1',
      proof: {
        publicInput: ['10'],
        publicOutput: ['42'],
        maxProofsVerified: 0,
        proof: 'base64-proof',
      },
    }),
    true
  );
});

test('isVerifyProtocolRequest rejects missing type', () => {
  assert.equal(
    isVerifyProtocolRequest({
      nonce: 'nonce-1',
      proof: {},
    }),
    false
  );
});

test('isVerifyProtocolRequest rejects missing proof', () => {
  assert.equal(
    isVerifyProtocolRequest({
      type: 'verify',
      nonce: 'nonce-1',
    }),
    false
  );
});

test('isWorkerProtocolResponse accepts verify result', () => {
  assert.equal(
    isWorkerProtocolResponse({
      type: 'verifyResult',
      transcript: { ok: true },
      transcriptHash: 'hash',
      signature: 'signature',
      signingPublicKeyDer: 'public-key',
      attestationDocument: 'attestation',
    }),
    true
  );
});

test('isWorkerProtocolResponse accepts error response', () => {
  assert.equal(
    isWorkerProtocolResponse({
      type: 'error',
      error: 'missing nonce',
    }),
    true
  );
});

test('isWorkerProtocolResponse rejects incomplete verify result', () => {
  assert.equal(
    isWorkerProtocolResponse({
      type: 'verifyResult',
      transcriptHash: 'hash',
    }),
    false
  );
});
