import cbor, { Tagged } from 'cbor';

const COSE_SIGN1_TAG = 18;
const COSE_ALGORITHM_HEADER = 1;
const COSE_ES384_ALGORITHM = -35;

export type ParsedNitroAttestationDocument = {
  protectedHeader: Buffer;
  payload: Buffer;
  signature: Buffer;
  algorithm: number;
  moduleId: string;
  timestamp: number;
  digest: 'SHA384';
  pcrs: Map<number, Buffer>;
  certificate: Buffer;
  cabundle: Buffer[];
  publicKey?: Buffer;
  userData?: Buffer;
  nonce?: Buffer;
};

export type NitroAttestationBinding = {
  nonce: string;
  transcriptHash: string;
  signingPublicKeyDer: string;
};

export function parseNitroAttestationDocument(
  attestationDocument: string
): ParsedNitroAttestationDocument {
  const decoded = decodeCbor(Buffer.from(attestationDocument, 'base64'));
  const coseSign1 = unwrapCoseSign1(decoded);
  const [protectedHeader, unprotectedHeader, payload, signature] = coseSign1;

  if (!Buffer.isBuffer(protectedHeader)) {
    throw new Error('attestation protected header must be bytes');
  }
  if (!isEmptyUnprotectedHeader(unprotectedHeader)) {
    throw new Error('attestation unprotected header must be empty');
  }
  if (!Buffer.isBuffer(payload)) {
    throw new Error('attestation payload must be bytes');
  }
  if (!Buffer.isBuffer(signature) || signature.length !== 96) {
    throw new Error('attestation signature must be 96 bytes');
  }

  const protectedMap = decodeMap(protectedHeader, 'attestation protected header');
  const algorithm = protectedMap.get(COSE_ALGORITHM_HEADER);
  if (algorithm !== COSE_ES384_ALGORITHM) {
    throw new Error('attestation signature algorithm must be ES384');
  }

  const payloadMap = decodeMap(payload, 'attestation payload');
  const digest = requiredString(payloadMap, 'digest');
  if (digest !== 'SHA384') {
    throw new Error('attestation digest must be SHA384');
  }

  return {
    protectedHeader,
    payload,
    signature,
    algorithm,
    moduleId: requiredString(payloadMap, 'module_id'),
    timestamp: requiredNumber(payloadMap, 'timestamp'),
    digest,
    pcrs: requiredPcrs(payloadMap),
    certificate: requiredBuffer(payloadMap, 'certificate'),
    cabundle: requiredBufferArray(payloadMap, 'cabundle'),
    publicKey: optionalBuffer(payloadMap, 'public_key'),
    userData: optionalBuffer(payloadMap, 'user_data'),
    nonce: optionalBuffer(payloadMap, 'nonce'),
  };
}

export function assertNitroAttestationBinding(
  parsed: ParsedNitroAttestationDocument,
  expected: NitroAttestationBinding
): void {
  assertBufferEqual(
    parsed.nonce,
    Buffer.from(expected.nonce),
    'attestation nonce mismatch'
  );
  assertBufferEqual(
    parsed.userData,
    Buffer.from(expected.transcriptHash, 'hex'),
    'attestation user data mismatch'
  );
  assertBufferEqual(
    parsed.publicKey,
    Buffer.from(expected.signingPublicKeyDer, 'base64'),
    'attestation public key mismatch'
  );
}

function unwrapCoseSign1(value: unknown): unknown[] {
  const untagged = value instanceof Tagged ? unwrapTaggedCoseSign1(value) : value;
  if (!Array.isArray(untagged) || untagged.length !== 4) {
    throw new Error('attestation document must be COSE_Sign1');
  }
  return untagged;
}

function unwrapTaggedCoseSign1(value: Tagged): unknown {
  if (value.tag !== COSE_SIGN1_TAG) {
    throw new Error('attestation document must use COSE_Sign1 tag');
  }
  return value.value;
}

function isEmptyUnprotectedHeader(value: unknown): boolean {
  if (value instanceof Map) return value.size === 0;
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

function decodeMap(buffer: Buffer, label: string): Map<unknown, unknown> {
  const decoded = decodeCbor(buffer);
  if (!(decoded instanceof Map)) {
    throw new Error(`${label} must be a map`);
  }
  return decoded;
}

function decodeCbor(buffer: Buffer): unknown {
  return cbor.decodeFirstSync(buffer, { preferMap: true });
}

function requiredString(map: Map<unknown, unknown>, key: string): string {
  const value = map.get(key);
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`attestation ${key} must be a string`);
  }
  return value;
}

function requiredNumber(map: Map<unknown, unknown>, key: string): number {
  const value = map.get(key);
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`attestation ${key} must be an integer`);
  }
  return value;
}

function requiredBuffer(map: Map<unknown, unknown>, key: string): Buffer {
  const value = map.get(key);
  if (!Buffer.isBuffer(value) || value.length === 0) {
    throw new Error(`attestation ${key} must be bytes`);
  }
  return value;
}

function optionalBuffer(map: Map<unknown, unknown>, key: string): Buffer | undefined {
  const value = map.get(key);
  if (value === undefined) return undefined;
  if (!Buffer.isBuffer(value)) {
    throw new Error(`attestation ${key} must be bytes`);
  }
  return value;
}

function requiredBufferArray(map: Map<unknown, unknown>, key: string): Buffer[] {
  const value = map.get(key);
  if (!Array.isArray(value) || value.some((entry) => !Buffer.isBuffer(entry))) {
    throw new Error(`attestation ${key} must be byte array`);
  }
  return value;
}

function requiredPcrs(map: Map<unknown, unknown>): Map<number, Buffer> {
  const value = map.get('pcrs');
  if (!(value instanceof Map) || value.size === 0) {
    throw new Error('attestation pcrs must be a map');
  }

  for (const [index, pcr] of value) {
    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 31 ||
      !Buffer.isBuffer(pcr) ||
      ![32, 48, 64].includes(pcr.length)
    ) {
      throw new Error('attestation pcrs contain invalid entry');
    }
  }

  return value;
}

function assertBufferEqual(
  actual: Buffer | undefined,
  expected: Buffer,
  message: string
): void {
  if (actual === undefined || actual.length !== expected.length) {
    throw new Error(message);
  }
  if (!cryptoTimingSafeEqual(actual, expected)) {
    throw new Error(message);
  }
}

function cryptoTimingSafeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && Buffer.compare(a, b) === 0;
}
