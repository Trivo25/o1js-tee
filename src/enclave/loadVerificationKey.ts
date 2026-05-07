import fs from 'node:fs/promises';
import type { SerializedVerificationKey } from './verifyRequest.js';

export async function loadVerificationKey(
  path: string
): Promise<SerializedVerificationKey> {
  const parsed = JSON.parse(await fs.readFile(path, 'utf8'));
  assertSerializedVerificationKey(parsed);
  return parsed;
}

export function assertSerializedVerificationKey(
  value: unknown
): asserts value is SerializedVerificationKey {
  if (!isRecord(value)) {
    throw new Error('verification key must be an object');
  }

  if (typeof value.data !== 'string' || value.data.length === 0) {
    throw new Error('verification key missing data');
  }

  if (typeof value.hash !== 'string' || value.hash.length === 0) {
    throw new Error('verification key missing hash');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
