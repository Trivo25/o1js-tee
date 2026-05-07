import { generateEvenProofBundle } from './generateEvenProof.js';

const number = process.argv[2];
const apiBase = (process.env.TEE_API_URL ?? 'http://localhost:8080').replace(/\/+$/, '');

if (number === undefined) {
  process.stderr.write(
    'usage: TEE_API_URL=<base> npm run demo:tee-cli -- <even-number>\n' +
      '  default TEE_API_URL=http://localhost:8080\n'
  );
  process.exitCode = 1;
} else {
  void main(number);
}

async function main(input: string): Promise<void> {
  console.log(`Generating proof for ${input} ...`);
  const bundle = await generateEvenProofBundle(input);

  const url = `${apiBase}/api/tee`;
  console.log(`POST ${url}`);

  console.time('tee-roundtrip');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proof: bundle.proof }),
  });
  console.timeEnd('tee-roundtrip');

  const body = await response.text();
  if (!response.ok) {
    process.stderr.write(`HTTP ${response.status}\n${body}\n`);
    process.exitCode = 1;
    return;
  }

  const parsed = JSON.parse(body) as {
    teeRequest?: { nonce?: string };
    teeResponse?: {
      transcript?: { ok?: boolean; nonce?: string; proofHash?: string };
      transcriptHash?: string;
      signature?: string;
      signingPublicKeyDer?: string;
      attestationDocument?: string;
    };
    error?: string;
  };

  const transcript = parsed.teeResponse?.transcript;
  console.log('');
  console.log('=== TEE result ===');
  console.log(`verdict:           ${transcript?.ok === true ? 'verified' : 'rejected'}`);
  console.log(`nonce:             ${transcript?.nonce ?? parsed.teeRequest?.nonce ?? '-'}`);
  console.log(`proofHash:         ${transcript?.proofHash ?? '-'}`);
  console.log(`transcriptHash:    ${parsed.teeResponse?.transcriptHash ?? '-'}`);
  console.log(`signature:         ${shorten(parsed.teeResponse?.signature)}`);
  console.log(`signingPubkey:     ${shorten(parsed.teeResponse?.signingPublicKeyDer)}`);
  console.log(`attestationDoc:    ${shorten(parsed.teeResponse?.attestationDocument, 80)}`);

  if (transcript?.ok !== true) {
    process.exitCode = 1;
  }
}

function shorten(value: unknown, max = 48): string {
  if (typeof value !== 'string' || value.length === 0) return '-';
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}
