import process from 'node:process';
import type { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { AttestationProvider } from './attest.js';
import { createAttestationProviderFromEnv } from './attest.js';
import { loadVerificationKey } from './loadVerificationKey.js';
import {
  LengthPrefixedJsonReader,
  writeLengthPrefixedJson,
} from '../protocol/lengthPrefixedJson.js';
import { createEphemeralSigner, type EphemeralSigner } from './signing.js';
import {
  verifyRequest,
  type SerializedVerificationKey,
  type VerifyTranscript,
} from './verifyRequest.js';

export type VerifyResult = {
  type: 'verifyResult';
  transcript: VerifyTranscript;
  transcriptHash: string;
  signature: string;
  signingPublicKeyDer: string;
  attestationDocument: string;
};

export type WorkerError = {
  type: 'error';
  error: string;
};

export type WorkerResponse = VerifyResult | WorkerError;

export type VerifyHandlerOptions = {
  verificationKey: SerializedVerificationKey;
  signer: EphemeralSigner;
  attestationProvider: AttestationProvider;
};

export function createVerifyHandler(options: VerifyHandlerOptions) {
  return async function handleVerifyRequest(req: unknown): Promise<VerifyResult> {
    const { transcript, transcriptHash } = await verifyRequest(
      req,
      options.verificationKey
    );
    const transcriptHashBytes = Buffer.from(transcriptHash, 'hex');
    const signature = options.signer.sign(transcriptHashBytes);
    const attestationDocument = await options.attestationProvider.attest({
      publicKeyDer: options.signer.signingPublicKeyDer,
      nonce: transcript.nonce,
      transcriptHash,
    });

    return {
      type: 'verifyResult',
      transcript,
      transcriptHash,
      signature: signature.toString('base64'),
      signingPublicKeyDer: options.signer.signingPublicKeyDer.toString('base64'),
      attestationDocument,
    };
  };
}

export async function createDefaultVerifyHandler(
  env: NodeJS.ProcessEnv = process.env
) {
  const verificationKeyPath = env.VERIFICATION_KEY_PATH;
  if (!verificationKeyPath) {
    throw new Error('VERIFICATION_KEY_PATH is required');
  }

  return createVerifyHandler({
    verificationKey: await loadVerificationKey(verificationKeyPath),
    signer: createEphemeralSigner(),
    attestationProvider: createAttestationProviderFromEnv(env),
  });
}

export async function handleWorkerMessage(
  message: unknown,
  handleVerifyRequest: (req: unknown) => Promise<VerifyResult>
): Promise<WorkerResponse> {
  if (!isRecord(message) || message.type !== 'verify') {
    return {
      type: 'error',
      error: 'unsupported request type',
    };
  }

  try {
    return await handleVerifyRequest(message);
  } catch (error) {
    return {
      type: 'error',
      error: errorMessage(error),
    };
  }
}

export async function runWorkerStreams(options: {
  readable: Readable;
  writable: Writable;
  handleVerifyRequest: (req: unknown) => Promise<VerifyResult>;
  maxFrameBytes: number;
}): Promise<void> {
  const reader = new LengthPrefixedJsonReader(options.readable);

  while (true) {
    let message: unknown | undefined;
    try {
      message = await reader.read(options.maxFrameBytes);
    } catch (error) {
      await writeLengthPrefixedJson(options.writable, {
        type: 'error',
        error: errorMessage(error),
      });
      return;
    }

    if (message === undefined) return;

    await writeLengthPrefixedJson(
      options.writable,
      await handleWorkerMessage(message, options.handleVerifyRequest)
    );
  }
}

export async function runDefaultWorker(
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await runWorkerStreams({
    readable: process.stdin,
    writable: process.stdout,
    handleVerifyRequest: await createDefaultVerifyHandler(env),
    maxFrameBytes: Number(env.MAX_FRAME_BYTES ?? 16 * 1024 * 1024),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDefaultWorker().catch((error: unknown) => {
    process.stderr.write(`${errorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
