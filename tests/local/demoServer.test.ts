import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDemoServer,
  createDemoVerifyRequest,
} from '../../src/demo/server.js';
import type { EvenProofBundle } from '../../src/demo/generateEvenProof.js';

test('createDemoServer returns an HTTP server', () => {
  const server = createDemoServer();

  assert.equal(typeof server.listen, 'function');
});

test('createDemoVerifyRequest builds TEE verify request', () => {
  const request = createDemoVerifyRequest(fakeProofBundle('10'), 'nonce-1');

  assert.deepEqual(request, {
    type: 'verify',
    nonce: 'nonce-1',
    proof: { demo: 'proof', number: '10' },
    expectedPublicInput: ['100'],
    expectedPublicOutput: ['1'],
  });
});

test('createDemoVerifyRequest generates nonce by default', () => {
  const request = createDemoVerifyRequest(fakeProofBundle('10'));

  assert.equal(typeof request.nonce, 'string');
  assert.equal(request.nonce.length > 0, true);
});

function fakeProofBundle(number: string): EvenProofBundle {
  return {
    number,
    square: '100',
    proof: { demo: 'proof', number },
    expectedPublicInput: ['100'],
    expectedPublicOutput: ['1'],
  };
}
