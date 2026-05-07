import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type AttestationRequest = {
  publicKeyDer: Buffer;
  nonce: string;
  transcriptHash: string;
};

export type AttestationProvider = {
  attest(req: AttestationRequest): Promise<string>;
};

export function createAttestationProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env
): AttestationProvider {
  if (env.ALLOW_FAKE_ATTESTATION === '1') {
    return createFakeAttestationProvider();
  }

  throw new Error('Nitro attestation provider is not configured');
}

export function createNsmAttestationProvider(
  command = 'nsm-attest'
): AttestationProvider {
  return {
    async attest(req) {
      const { stdout } = await execFileAsync(command, [
        '--public-key-der-b64',
        req.publicKeyDer.toString('base64'),
        '--nonce-b64',
        Buffer.from(req.nonce).toString('base64'),
        '--user-data-hex',
        req.transcriptHash,
      ]);
      return parseNsmAttestationOutput(stdout);
    },
  };
}

export function createFakeAttestationProvider(): AttestationProvider {
  return {
    async attest(req) {
      return Buffer.from(
        JSON.stringify({
          kind: 'fake-nitro-attestation',
          publicKeyDer: req.publicKeyDer.toString('base64'),
          nonce: req.nonce,
          transcriptHash: req.transcriptHash,
        })
      ).toString('base64');
    },
  };
}

function parseNsmAttestationOutput(stdout: string): string {
  const parsed = JSON.parse(stdout);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof parsed.attestationDocument !== 'string' ||
    parsed.attestationDocument.length === 0
  ) {
    throw new Error('invalid nsm-attest output');
  }
  return parsed.attestationDocument;
}
