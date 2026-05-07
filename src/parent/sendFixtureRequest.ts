import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { sendFramedJson } from './vsockClient.js';

const mode = envMode();
const port = Number(process.env.VSOCK_PORT ?? '5000');
const response = await sendFramedJson(await fixtureRequest(), {
  mode,
  port,
  cid: mode === 'vsock' ? Number(process.env.ENCLAVE_CID ?? '16') : undefined,
  host: process.env.TCP_HOST ?? '127.0.0.1',
  maxFrameBytes: Number(process.env.MAX_FRAME_BYTES ?? 16 * 1024 * 1024),
});

process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);

async function fixtureRequest() {
  const proof = await readJson(process.env.PROOF_PATH ?? 'fixtures/valid-proof.json');
  const expectedPublic = await readJson(
    process.env.EXPECTED_PUBLIC_PATH ?? 'fixtures/expected-public.json'
  );

  return {
    type: 'verify',
    nonce: process.env.NONCE ?? randomNonce(),
    proof,
    expectedPublicInput: expectedPublic.publicInput,
    expectedPublicOutput: expectedPublic.publicOutput,
  };
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

function envMode(): 'vsock' | 'tcp' {
  if (process.env.PARENT_CLIENT_MODE === 'tcp') return 'tcp';
  return 'vsock';
}

function randomNonce(): string {
  return crypto.randomBytes(32).toString('base64');
}
