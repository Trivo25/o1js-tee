#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const image = process.argv[2] ?? 'o1js-nitro-verifier:local';
const dockerBin = process.env.DOCKER_BIN ?? '/usr/local/bin/docker';

const proof = await readJson('fixtures/valid-proof.json');
const expectedPublic = await readJson('fixtures/expected-public.json');
const request = {
  type: 'verify',
  nonce: 'container-smoke-nonce',
  proof,
  expectedPublicInput: expectedPublic.publicInput,
  expectedPublicOutput: expectedPublic.publicOutput,
};

const child = spawn(
  dockerBin,
  ['run', '--rm', '-i', '-e', 'ALLOW_FAKE_ATTESTATION=1', image],
  {
    stdio: ['pipe', 'pipe', 'pipe'],
  }
);

const stdout = collect(child.stdout);
const stderr = collectText(child.stderr);

child.stdin.end(encodeFrame(request));

const [exitCode] = await onceExit(child);
const stderrText = await stderr;
if (exitCode !== 0) {
  throw new Error(`container exited with ${exitCode}: ${stderrText}`);
}

const response = decodeFrame(Buffer.concat(await stdout));
if (response.type !== 'verifyResult') {
  throw new Error(`expected verifyResult, got ${JSON.stringify(response)}`);
}
if (response.transcript?.ok !== true) {
  throw new Error(`expected ok=true, got ${JSON.stringify(response.transcript)}`);
}
if (response.transcript.nonce !== request.nonce) {
  throw new Error(`nonce mismatch: ${response.transcript.nonce}`);
}
if (typeof response.signature !== 'string' || response.signature.length === 0) {
  throw new Error('missing signature');
}
if (
  typeof response.attestationDocument !== 'string' ||
  response.attestationDocument.length === 0
) {
  throw new Error('missing attestation document');
}

console.log('container smoke ok');

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

function encodeFrame(value) {
  const payload = Buffer.from(JSON.stringify(value), 'utf8');
  const frame = Buffer.allocUnsafe(4 + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}

function decodeFrame(frame) {
  if (frame.length < 4) {
    throw new Error('truncated response header');
  }
  const payloadLength = frame.readUInt32BE(0);
  const expectedLength = 4 + payloadLength;
  if (frame.length !== expectedLength) {
    throw new Error(`unexpected response frame length ${frame.length}`);
  }
  return JSON.parse(frame.subarray(4).toString('utf8'));
}

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks;
}

async function collectText(stream) {
  return Buffer.concat(await collect(stream)).toString('utf8');
}

function onceExit(child) {
  return new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve([code, signal]));
  });
}
