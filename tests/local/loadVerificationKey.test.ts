import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertSerializedVerificationKey,
  loadVerificationKey,
} from '../../src/enclave/loadVerificationKey.js';

test('loadVerificationKey reads generated fixture key', async () => {
  const verificationKey = await loadVerificationKey('fixtures/verification-key.json');

  assert.equal(typeof verificationKey.data, 'string');
  assert.equal(typeof verificationKey.hash, 'string');
  assert.notEqual(verificationKey.data.length, 0);
  assert.notEqual(verificationKey.hash.length, 0);
});

test('assertSerializedVerificationKey rejects non-object values', () => {
  assert.throws(
    () => assertSerializedVerificationKey(null),
    /verification key must be an object/
  );
});

test('assertSerializedVerificationKey rejects missing data', () => {
  assert.throws(
    () => assertSerializedVerificationKey({ hash: '1' }),
    /verification key missing data/
  );
});

test('assertSerializedVerificationKey rejects missing hash', () => {
  assert.throws(
    () => assertSerializedVerificationKey({ data: 'base64-key' }),
    /verification key missing hash/
  );
});

test('loadVerificationKey rejects malformed JSON', async () => {
  const file = await writeTempFile('not json');

  await assert.rejects(() => loadVerificationKey(file), SyntaxError);
});

async function writeTempFile(contents: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'o1js-tee-vk-'));
  const file = path.join(dir, 'verification-key.json');
  await fs.writeFile(file, contents);
  return file;
}
