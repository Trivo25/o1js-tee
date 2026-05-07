import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeLengthPrefixedJson,
  encodeLengthPrefixedJson,
} from '../../src/protocol/lengthPrefixedJson.js';

test('length-prefixed JSON round trips values', () => {
  const value = {
    type: 'verify',
    nonce: 'nonce-1',
    proof: { publicInput: ['10'], publicOutput: ['42'] },
  };

  assert.deepEqual(
    decodeLengthPrefixedJson(encodeLengthPrefixedJson(value), 1024),
    value
  );
});

test('decodeLengthPrefixedJson rejects truncated header', () => {
  assert.throws(
    () => decodeLengthPrefixedJson(Buffer.from([0, 0, 0]), 1024),
    /truncated frame header/
  );
});

test('decodeLengthPrefixedJson rejects oversized frame', () => {
  const frame = encodeLengthPrefixedJson({ payload: 'too large' });

  assert.throws(
    () => decodeLengthPrefixedJson(frame, 1),
    /frame exceeds maximum size/
  );
});

test('decodeLengthPrefixedJson rejects truncated payload', () => {
  const frame = encodeLengthPrefixedJson({ ok: true });

  assert.throws(
    () => decodeLengthPrefixedJson(frame.subarray(0, frame.length - 1), 1024),
    /truncated frame payload/
  );
});

test('decodeLengthPrefixedJson rejects malformed JSON', () => {
  const payload = Buffer.from('{bad json', 'utf8');
  const frame = Buffer.allocUnsafe(4 + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, 4);

  assert.throws(() => decodeLengthPrefixedJson(frame, 1024), SyntaxError);
});

test('decodeLengthPrefixedJson rejects trailing bytes', () => {
  const frame = Buffer.concat([
    encodeLengthPrefixedJson({ ok: true }),
    Buffer.from([1]),
  ]);

  assert.throws(
    () => decodeLengthPrefixedJson(frame, 1024),
    /frame has trailing bytes/
  );
});
