import crypto, { type KeyObject } from 'node:crypto';

export type EphemeralSigner = {
  signingPublicKeyDer: Buffer;
  sign(message: Buffer | string): Buffer;
};

export function createEphemeralSigner(): EphemeralSigner {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  return {
    signingPublicKeyDer: exportPublicKeyDer(publicKey),
    sign(message) {
      return crypto.sign(null, toBuffer(message), privateKey);
    },
  };
}

export function exportPublicKeyDer(publicKey: KeyObject): Buffer {
  return publicKey.export({
    type: 'spki',
    format: 'der',
  });
}

export function verifySignature(
  signingPublicKeyDer: Buffer,
  message: Buffer | string,
  signature: Buffer
): boolean {
  const publicKey = crypto.createPublicKey({
    key: signingPublicKeyDer,
    type: 'spki',
    format: 'der',
  });

  return crypto.verify(null, toBuffer(message), publicKey, signature);
}

function toBuffer(message: Buffer | string): Buffer {
  return Buffer.isBuffer(message) ? message : Buffer.from(message);
}
