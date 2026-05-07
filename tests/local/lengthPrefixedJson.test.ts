import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  decodeLengthPrefixedJson,
  encodeLengthPrefixedJson,
  LengthPrefixedJsonReader,
  writeLengthPrefixedJson,
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

test('LengthPrefixedJsonReader reads multiple frames from a stream', async () => {
  const stream = new PassThrough();
  const reader = new LengthPrefixedJsonReader(stream);

  await writeLengthPrefixedJson(stream, { n: 1 });
  await writeLengthPrefixedJson(stream, { n: 2 });
  stream.end();

  assert.deepEqual(await reader.read(1024), { n: 1 });
  assert.deepEqual(await reader.read(1024), { n: 2 });
  assert.equal(await reader.read(1024), undefined);
});

test('LengthPrefixedJsonReader preserves partial frame chunks', async () => {
  const frame = encodeLengthPrefixedJson({ ok: true });
  const stream = new PassThrough();
  const reader = new LengthPrefixedJsonReader(stream);

  stream.write(frame.subarray(0, 2));
  stream.end(frame.subarray(2));

  assert.deepEqual(await reader.read(1024), { ok: true });
});

test('LengthPrefixedJsonReader rejects truncated stream header', async () => {
  const stream = new PassThrough();
  const reader = new LengthPrefixedJsonReader(stream);

  stream.end(Buffer.from([0, 0, 0]));

  await assert.rejects(() => reader.read(1024), /truncated frame header/);
});

test('LengthPrefixedJsonReader rejects truncated stream payload', async () => {
  const stream = new PassThrough();
  const reader = new LengthPrefixedJsonReader(stream);
  const frame = encodeLengthPrefixedJson({ ok: true });

  stream.end(frame.subarray(0, frame.length - 1));

  await assert.rejects(() => reader.read(1024), /truncated frame payload/);
});

test('writeLengthPrefixedJson writes decodable frames', async () => {
  const stream = new PassThrough();

  await writeLengthPrefixedJson(stream, { ok: true });

  const frame = stream.read() as Buffer;
  assert.deepEqual(decodeLengthPrefixedJson(frame, 1024), { ok: true });
});
