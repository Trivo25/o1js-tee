#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';

const image = process.argv[2] ?? 'o1js-nitro-verifier:local';
const dockerBin = process.env.DOCKER_BIN ?? '/usr/local/bin/docker';
const host = '127.0.0.1';
const port = Number(process.env.CONTAINER_SMOKE_PORT ?? (await getFreePort()));
const containerName = `o1js-tee-smoke-${process.pid}`;

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
  [
    'run',
    '--rm',
    '--name',
    containerName,
    '-p',
    `${host}:${port}:5000`,
    '-e',
    'ALLOW_FAKE_ATTESTATION=1',
    '-e',
    'SHIM_LISTEN_MODE=tcp',
    '-e',
    'TCP_HOST=0.0.0.0',
    image,
  ],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);

const stderr = collectText(child.stderr);

const socket = await connectWithRetry(host, port);
socket.end(encodeFrame(request));
const responseFrame = Buffer.concat(await collect(socket));

await docker(['stop', containerName]);
await onceExit(child);

const response = decodeFrame(responseFrame);
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

async function connectWithRetry(host, port) {
  const deadline = Date.now() + 15_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await connect(host, port);
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw new Error(`container port did not open: ${lastError}`);
}

function connect(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (typeof address !== 'object' || address === null) {
        server.close(() => reject(new Error('failed to allocate TCP port')));
        return;
      }
      const freePort = address.port;
      server.close(() => resolve(freePort));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function docker(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(dockerBin, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${dockerBin} ${args.join(' ')} failed: ${stderr}`));
      }
    });
  });
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
