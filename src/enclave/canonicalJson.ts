import crypto from 'node:crypto';
import canonicalize from 'canonicalize';

export function canonicalJson(value: unknown): string {
  const encoded = canonicalize(value);
  if (encoded === undefined) {
    throw new Error('canonicalization failed');
  }
  return encoded;
}

export function sha256Canonical(value: unknown): string {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function equalCanonicalJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
