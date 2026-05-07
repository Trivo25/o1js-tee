import assert from 'node:assert/strict';
import cbor, { Tagged } from 'cbor';
import test from 'node:test';
import {
  assertNitroAttestationBinding,
  parseNitroAttestationDocument,
} from '../../src/client/nitroAttestation.js';

const SIGNING_PUBLIC_KEY = Buffer.from('signing-public-key');
const NONCE = 'nonce-1';
const TRANSCRIPT_HASH = '0a0b0c';

test('parseNitroAttestationDocument parses tagged COSE_Sign1 document', () => {
  const parsed = parseNitroAttestationDocument(makeAttestationDocument());

  assert.equal(parsed.algorithm, -35);
  assert.equal(parsed.moduleId, 'module-1');
  assert.equal(parsed.timestamp, 1_700_000_000_000);
  assert.equal(parsed.digest, 'SHA384');
  assert.deepEqual(parsed.pcrs.get(0), Buffer.alloc(48, 1));
  assert.deepEqual(parsed.certificate, Buffer.from([2]));
  assert.deepEqual(parsed.cabundle, [Buffer.from([3])]);
  assert.deepEqual(parsed.publicKey, SIGNING_PUBLIC_KEY);
  assert.deepEqual(parsed.nonce, Buffer.from(NONCE));
  assert.deepEqual(parsed.userData, Buffer.from(TRANSCRIPT_HASH, 'hex'));
});

test('parseNitroAttestationDocument parses untagged COSE_Sign1 document', () => {
  const parsed = parseNitroAttestationDocument(
    makeAttestationDocument({ tagged: false })
  );

  assert.equal(parsed.moduleId, 'module-1');
});

test('parseNitroAttestationDocument rejects wrong algorithm', () => {
  assert.throws(
    () => parseNitroAttestationDocument(makeAttestationDocument({ algorithm: -7 })),
    /algorithm must be ES384/
  );
});

test('parseNitroAttestationDocument rejects invalid PCR entries', () => {
  assert.throws(
    () =>
      parseNitroAttestationDocument(
        makeAttestationDocument({
          pcrs: new Map([[32, Buffer.alloc(48, 1)]]),
        })
      ),
    /pcrs contain invalid entry/
  );
});

test('assertNitroAttestationBinding accepts expected bindings', () => {
  const parsed = parseNitroAttestationDocument(makeAttestationDocument());

  assert.doesNotThrow(() =>
    assertNitroAttestationBinding(parsed, {
      nonce: NONCE,
      transcriptHash: TRANSCRIPT_HASH,
      signingPublicKeyDer: SIGNING_PUBLIC_KEY.toString('base64'),
    })
  );
});

test('assertNitroAttestationBinding rejects nonce mismatch', () => {
  const parsed = parseNitroAttestationDocument(makeAttestationDocument());

  assert.throws(
    () =>
      assertNitroAttestationBinding(parsed, {
        nonce: 'different',
        transcriptHash: TRANSCRIPT_HASH,
        signingPublicKeyDer: SIGNING_PUBLIC_KEY.toString('base64'),
      }),
    /nonce mismatch/
  );
});

test('assertNitroAttestationBinding rejects user data mismatch', () => {
  const parsed = parseNitroAttestationDocument(makeAttestationDocument());

  assert.throws(
    () =>
      assertNitroAttestationBinding(parsed, {
        nonce: NONCE,
        transcriptHash: 'ff',
        signingPublicKeyDer: SIGNING_PUBLIC_KEY.toString('base64'),
      }),
    /user data mismatch/
  );
});

test('assertNitroAttestationBinding rejects public key mismatch', () => {
  const parsed = parseNitroAttestationDocument(makeAttestationDocument());

  assert.throws(
    () =>
      assertNitroAttestationBinding(parsed, {
        nonce: NONCE,
        transcriptHash: TRANSCRIPT_HASH,
        signingPublicKeyDer: Buffer.from('different').toString('base64'),
      }),
    /public key mismatch/
  );
});

function makeAttestationDocument(options: {
  algorithm?: number;
  pcrs?: Map<number, Buffer>;
  tagged?: boolean;
} = {}): string {
  const protectedHeader = cbor.encodeCanonical(
    new Map([[1, options.algorithm ?? -35]])
  );
  const payload = cbor.encodeCanonical(
    new Map<string, unknown>([
      ['module_id', 'module-1'],
      ['timestamp', 1_700_000_000_000],
      ['digest', 'SHA384'],
      ['pcrs', options.pcrs ?? new Map([[0, Buffer.alloc(48, 1)]])],
      ['certificate', Buffer.from([2])],
      ['cabundle', [Buffer.from([3])]],
      ['public_key', SIGNING_PUBLIC_KEY],
      ['nonce', Buffer.from(NONCE)],
      ['user_data', Buffer.from(TRANSCRIPT_HASH, 'hex')],
    ])
  );
  const coseSign1 = [
    protectedHeader,
    new Map(),
    payload,
    Buffer.alloc(96, 4),
  ];

  return cbor
    .encode(options.tagged === false ? coseSign1 : new Tagged(18, coseSign1))
    .toString('base64');
}
