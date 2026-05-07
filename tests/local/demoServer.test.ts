import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDemoServer,
  createDemoVerifyRequest,
} from '../../src/demo/server.js';

test('createDemoServer returns an HTTP server', () => {
  const server = createDemoServer();

  assert.equal(typeof server.listen, 'function');
});

test('createDemoVerifyRequest builds TEE verify request', () => {
  const proof = fakeProof('10');
  const request = createDemoVerifyRequest(proof, 'nonce-1');

  assert.deepEqual(request, {
    type: 'verify',
    nonce: 'nonce-1',
    proof,
    expectedPublicInput: ['100'],
    expectedPublicOutput: ['1'],
  });
});

test('createDemoVerifyRequest generates nonce by default', () => {
  const request = createDemoVerifyRequest(fakeProof('10'));

  assert.equal(typeof request.nonce, 'string');
  assert.equal(request.nonce.length > 0, true);
});

test('createDemoVerifyRequest rejects proof without public values', () => {
  assert.throws(
    () => createDemoVerifyRequest({ proof: 'base64-proof' }),
    /proof.publicInput/
  );
});

function fakeProof(number: string): Record<string, unknown> {
  return {
    demo: 'proof',
    number,
    publicInput: ['100'],
    publicOutput: ['1'],
  };
}
