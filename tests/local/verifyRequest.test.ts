import assert from 'node:assert/strict';
import test from 'node:test';
import { assertValidVerifyRequest } from '../../src/enclave/verifyRequest.js';

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
