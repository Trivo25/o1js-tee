import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sendFramedJson } from '../../src/parent/vsockClient.js';

test('sendFramedJson exchanges framed JSON through helper subprocess', async () => {
  const helperPath = await writeHelperStub();
  const response = await sendFramedJson(
    { type: 'verify', nonce: 'nonce-1', proof: {} },
    {
      mode: 'tcp',
      port: 1,
      helperPath,
      pythonBin: process.execPath,
    }
  );

  assert.deepEqual(response, {
    type: 'ok',
    request: { type: 'verify', nonce: 'nonce-1', proof: {} },
  });
});

test('sendFramedJson requires cid for vsock mode', async () => {
  await assert.rejects(
    () => sendFramedJson({}, { port: 5000 }),
    /cid is required for vsock mode/
  );
});

async function writeHelperStub(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'o1js-tee-vsock-'));
  const file = path.join(dir, 'helper.mjs');
  await fs.writeFile(
    file,
    `
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = Buffer.concat(chunks);
const payloadLength = input.readUInt32BE(0);
const request = JSON.parse(input.subarray(4, 4 + payloadLength).toString('utf8'));
const payload = Buffer.from(JSON.stringify({ type: 'ok', request }), 'utf8');
const frame = Buffer.allocUnsafe(4 + payload.length);
frame.writeUInt32BE(payload.length, 0);
payload.copy(frame, 4);
process.stdout.write(frame);
`
  );
  return file;
}
