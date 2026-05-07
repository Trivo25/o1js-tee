import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createAttestationProviderFromEnv,
  createFakeAttestationProvider,
  createNsmAttestationProvider,
} from '../../src/enclave/attest.js';

test('createAttestationProviderFromEnv fails closed by default', () => {
  assert.throws(
    () => createAttestationProviderFromEnv({}),
    /Nitro attestation provider is not configured/
  );
});

test('createAttestationProviderFromEnv enables fake provider explicitly', async () => {
  const provider = createAttestationProviderFromEnv({
    ALLOW_FAKE_ATTESTATION: '1',
  });

  const attestationDocument = await provider.attest({
    publicKeyDer: Buffer.from('public-key'),
    nonce: 'nonce-1',
    transcriptHash: 'abc123',
  });

  assert.deepEqual(decodeFakeAttestation(attestationDocument), {
    kind: 'fake-nitro-attestation',
    publicKeyDer: Buffer.from('public-key').toString('base64'),
    nonce: 'nonce-1',
    transcriptHash: 'abc123',
  });
});

test('createFakeAttestationProvider binds request fields', async () => {
  const attestationDocument = await createFakeAttestationProvider().attest({
    publicKeyDer: Buffer.from([1, 2, 3]),
    nonce: 'nonce-2',
    transcriptHash: 'def456',
  });

  const decoded = decodeFakeAttestation(attestationDocument);

  assert.equal(decoded.publicKeyDer, Buffer.from([1, 2, 3]).toString('base64'));
  assert.equal(decoded.nonce, 'nonce-2');
  assert.equal(decoded.transcriptHash, 'def456');
});

test('createNsmAttestationProvider passes expected helper arguments', async () => {
  const logPath = path.join(await makeTempDir(), 'args.json');
  const helperPath = await writeExecutable(
    `#!/bin/sh
node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))" "${logPath}" "$@"
printf '{"attestationDocument":"doc-b64"}'
`
  );

  const provider = createNsmAttestationProvider(helperPath);
  const attestationDocument = await provider.attest({
    publicKeyDer: Buffer.from('public-key'),
    nonce: 'nonce-1',
    transcriptHash: 'abc123',
  });

  const args = JSON.parse(await fs.readFile(logPath, 'utf8'));

  assert.equal(attestationDocument, 'doc-b64');
  assert.deepEqual(args, [
    '--public-key-der-b64',
    Buffer.from('public-key').toString('base64'),
    '--nonce-b64',
    Buffer.from('nonce-1').toString('base64'),
    '--user-data-hex',
    'abc123',
  ]);
});

test('createNsmAttestationProvider rejects malformed helper output', async () => {
  const helperPath = await writeExecutable(
    `#!/bin/sh
printf '{"unexpected":"value"}'
`
  );

  await assert.rejects(
    () =>
      createNsmAttestationProvider(helperPath).attest({
        publicKeyDer: Buffer.from('public-key'),
        nonce: 'nonce-1',
        transcriptHash: 'abc123',
      }),
    /invalid nsm-attest output/
  );
});

function decodeFakeAttestation(attestationDocument: string): any {
  return JSON.parse(Buffer.from(attestationDocument, 'base64').toString('utf8'));
}

async function writeExecutable(contents: string): Promise<string> {
  const file = path.join(await makeTempDir(), 'nsm-attest-stub');
  await fs.writeFile(file, contents, { mode: 0o700 });
  return file;
}

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'o1js-tee-attest-'));
}
