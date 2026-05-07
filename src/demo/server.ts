import crypto from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { EvenProofBundle } from './generateEvenProof.js';
import { sendFramedJson, type VsockClientOptions } from '../parent/vsockClient.js';

type DemoServerDependencies = {
  sendToTee?: (request: unknown) => Promise<unknown>;
};

type DemoVerifyRequest = {
  type: 'verify';
  nonce: string;
  proof: unknown;
  expectedPublicInput: string[];
  expectedPublicOutput: string[];
};

export function createDemoServer(
  dependencies: DemoServerDependencies = {}
): http.Server {
  const sendToTee = dependencies.sendToTee ?? sendVerifyRequestToTee;

  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        writeJson(res, 200, { ok: true, name: 'Project Bubblegum' });
        return;
      }

      if (req.method === 'POST' && req.url === '/api/tee') {
        const proofBundle = await readProofBundleRequest(req);
        const teeRequest = createDemoVerifyRequest(proofBundle);
        const teeResponse = await sendToTee(teeRequest);

        writeJson(res, 200, {
          proofBundle,
          teeRequest,
          teeResponse,
        });
        return;
      }

      writeJson(res, 404, { error: 'not found' });
    } catch (error) {
      writeJson(res, 400, { error: errorMessage(error) });
    }
  });
}

export function createDemoVerifyRequest(
  proofBundle: EvenProofBundle,
  nonce = randomNonce()
): DemoVerifyRequest {
  return {
    type: 'verify',
    nonce,
    proof: proofBundle.proof,
    expectedPublicInput: proofBundle.expectedPublicInput,
    expectedPublicOutput: proofBundle.expectedPublicOutput,
  };
}

export async function sendVerifyRequestToTee(request: unknown): Promise<unknown> {
  return sendFramedJson(request, teeClientOptionsFromEnv());
}

function teeClientOptionsFromEnv(): VsockClientOptions {
  const mode = process.env.PARENT_CLIENT_MODE === 'tcp' ? 'tcp' : 'vsock';
  return {
    mode,
    port: Number(process.env.VSOCK_PORT ?? '5000'),
    cid: mode === 'vsock' ? Number(process.env.ENCLAVE_CID ?? '16') : undefined,
    host: process.env.TCP_HOST ?? '127.0.0.1',
    maxFrameBytes: Number(process.env.MAX_FRAME_BYTES ?? 16 * 1024 * 1024),
  };
}

async function readProofBundleRequest(req: IncomingMessage): Promise<EvenProofBundle> {
  const body = await readJsonBody(req);
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    typeof body.number !== 'string' ||
    typeof body.square !== 'string' ||
    !isRecord(body.proof) ||
    !isStringArray(body.expectedPublicInput) ||
    !isStringArray(body.expectedPublicOutput)
  ) {
    throw new Error('request body must include proof bundle');
  }

  return {
    number: body.number,
    square: body.square,
    proof: body.proof,
    expectedPublicInput: body.expectedPublicInput,
    expectedPublicOutput: body.expectedPublicOutput,
  };
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    throw new Error('request body is required');
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

function randomNonce(): string {
  return crypto.randomBytes(32).toString('base64');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = Number(process.env.DEMO_PORT ?? '8080');
  createDemoServer().listen(port, () => {
    process.stdout.write(`Project Bubblegum demo server listening on ${port}\n`);
  });
}
