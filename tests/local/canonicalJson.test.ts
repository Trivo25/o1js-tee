import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalJson,
  equalCanonicalJson,
  sha256Canonical,
} from '../../src/enclave/canonicalJson.js';

test('canonicalJson orders object keys deterministically', () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
});

test('equalCanonicalJson ignores object key insertion order', () => {
  assert.equal(equalCanonicalJson({ b: [2], a: 1 }, { a: 1, b: [2] }), true);
});

test('sha256Canonical hashes canonical representation', () => {
  assert.equal(
    sha256Canonical({ b: 2, a: 1 }),
    sha256Canonical({ a: 1, b: 2 })
  );
});

test('canonicalJson rejects unsupported values', () => {
  assert.throws(() => canonicalJson(Number.NaN), /NaN is not allowed/);
});
