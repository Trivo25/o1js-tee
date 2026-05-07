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
