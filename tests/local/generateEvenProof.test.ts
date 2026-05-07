import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateEvenProofBundle,
  parseEvenDemoNumber,
} from '../../src/demo/generateEvenProof.js';

test('parseEvenDemoNumber accepts even non-negative integers', () => {
  assert.equal(parseEvenDemoNumber('10').toString(), '10');
});

test('parseEvenDemoNumber rejects odd integers', () => {
  assert.throws(() => parseEvenDemoNumber('11'), /number must be even/);
});

test('parseEvenDemoNumber rejects non-integers', () => {
  assert.throws(
    () => parseEvenDemoNumber('10.5'),
    /number must be a non-negative integer/
  );
});

test('generateEvenProofBundle returns proof and TEE policy inputs', async () => {
  const bundle = await generateEvenProofBundle('10');

  assert.equal(bundle.number, '10');
  assert.equal(bundle.square, '100');
  assert.deepEqual(bundle.expectedPublicInput, ['100']);
  assert.deepEqual(bundle.expectedPublicOutput, ['1']);
  assert.equal(typeof bundle.proof, 'object');
});
