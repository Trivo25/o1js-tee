import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEphemeralSigner,
  verifySignature,
} from '../../src/enclave/signing.js';

test('createEphemeralSigner signs messages with exported DER public key', () => {
  const signer = createEphemeralSigner();
  const message = Buffer.from(
    '7b1d0e8b9f1a495c9b7215c43c3efc70655ee0a70fd9f8df4a7dd76da67a2f79',
    'hex'
  );

  const signature = signer.sign(message);

  assert.equal(signer.signingPublicKeyDer.length, 44);
  assert.equal(signature.length, 64);
  assert.equal(
    verifySignature(signer.signingPublicKeyDer, message, signature),
    true
  );
});

test('verifySignature rejects modified messages', () => {
  const signer = createEphemeralSigner();
  const signature = signer.sign('message-1');

  assert.equal(
    verifySignature(signer.signingPublicKeyDer, 'message-2', signature),
    false
  );
});
