import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
      if (req.method === 'OPTIONS') {
        writeCorsPreflight(res);
        return;
      }

      if (req.method === 'GET' && req.url === '/health') {
        writeJson(res, 200, { ok: true, name: 'Project Teh Tarik' });
        return;
      }

      if (req.method === 'GET' && (await serveDemoAsset(req, res))) {
        return;
      }

      if (req.method === 'POST' && req.url === '/api/tee') {
        const proof = await readProofRequest(req);
        const teeRequest = createDemoVerifyRequest(proof);
        logApiRequest(req, teeRequest);
        const teeResponse = await sendToTee(teeRequest);
        logApiResponse(teeResponse);

        writeJson(res, 200, {
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
  proof: Record<string, unknown>,
  nonce = randomNonce()
): DemoVerifyRequest {
  return {
    type: 'verify',
    nonce,
    proof,
    expectedPublicInput: publicFieldArray(proof.publicInput, 'proof.publicInput'),
    expectedPublicOutput: publicFieldArray(proof.publicOutput, 'proof.publicOutput'),
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

async function readProofRequest(req: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readJsonBody(req);
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    !isRecord(body.proof)
  ) {
    throw new Error('request body must include proof object');
  }

  return body.proof;
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
    ...corsHeaders(),
    ...isolationHeaders(),
  });
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

function writeCorsPreflight(res: ServerResponse): void {
  res.writeHead(204, {
    ...corsHeaders(),
    ...isolationHeaders(),
  });
  res.end();
}

async function serveDemoAsset(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const asset = demoAssetForUrl(req.url ?? '/');
  if (!asset) {
    return false;
  }

  try {
    const body = await fs.readFile(asset.path);
    res.writeHead(200, {
      'content-type': asset.contentType,
      'cache-control': asset.cacheControl,
      ...corsHeaders(),
      ...isolationHeaders(),
    });
    res.end(body);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      writeJson(res, 404, { error: `${asset.name} has not been built` });
      return true;
    }
    throw error;
  }
}

function demoAssetForUrl(
  requestUrl: string
): { path: string; name: string; contentType: string; cacheControl: string } | undefined {
  const { pathname } = new URL(requestUrl, 'http://localhost');
  const root = path.resolve(process.cwd(), 'public/demo');

  if (pathname === '/' || pathname === '/demo' || pathname === '/demo/') {
    return {
      path: path.join(root, 'index.html'),
      name: 'Project Teh Tarik UI',
      contentType: 'text/html; charset=utf-8',
      cacheControl: 'no-store',
    };
  }

  // accept both /<file> and /demo/<file>
  let relative = pathname.startsWith('/demo/') ? pathname.slice('/demo/'.length) : pathname.slice(1);
  if (!relative || relative.includes('..') || relative.includes('/')) return undefined;

  const ext = path.extname(relative).toLowerCase();
  const contentType = MIME_TYPES[ext];
  if (!contentType) return undefined;

  return {
    path: path.join(root, relative),
    name: `Project Teh Tarik asset (${relative})`,
    contentType,
    cacheControl: 'no-store',
  };
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': process.env.CORS_ALLOW_ORIGIN ?? '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}

function logApiRequest(req: IncomingMessage, request: DemoVerifyRequest): void {
  const origin = req.headers.origin ?? 'direct';
  process.stdout.write(
    [
      'POST /api/tee',
      `origin=${origin}`,
      `nonce=${request.nonce}`,
      `publicInput=${JSON.stringify(request.expectedPublicInput)}`,
      `publicOutput=${JSON.stringify(request.expectedPublicOutput)}`,
    ].join(' ') + '\n'
  );
}

function logApiResponse(response: unknown): void {
  if (!isRecord(response)) {
    process.stdout.write('POST /api/tee response=non-object\n');
    return;
  }

  const transcript = isRecord(response.transcript) ? response.transcript : undefined;
  process.stdout.write(
    [
      'POST /api/tee result',
      `ok=${String(transcript?.ok ?? false)}`,
      `transcriptHash=${typeof response.transcriptHash === 'string' ? response.transcriptHash : '-'}`,
      `signature=${typeof response.signature === 'string' ? shortenForLog(response.signature) : '-'}`,
    ].join(' ') + '\n'
  );
}

function shortenForLog(value: string): string {
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 18)}...`;
}

function isolationHeaders(): Record<string, string> {
  return {
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-resource-policy': 'same-origin',
  };
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

function publicFieldArray(value: unknown, label: string): string[] {
  if (!isStringArray(value)) {
    throw new Error(`${label} must be a string array`);
  }
  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.DEMO_PORT ?? '8080');
  const host = process.env.DEMO_HOST ?? '127.0.0.1';
  createDemoServer().listen(port, host, () => {
    process.stdout.write(`Project Teh Tarik demo server listening on http://${host}:${port}/\n`);
  });
}
