import type { AttestationProvider } from './attest.js';
import type { EphemeralSigner } from './signing.js';
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
