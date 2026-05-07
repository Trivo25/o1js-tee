import type { VerifyResult, WorkerError } from '../enclave/worker.js';
import type { VerifyRequest } from '../enclave/verifyRequest.js';

export type VerifyProtocolRequest = VerifyRequest & {
  type: 'verify';
};

export type WorkerProtocolResponse = VerifyResult | WorkerError;

export function isVerifyProtocolRequest(
  value: unknown
): value is VerifyProtocolRequest {
  return (
    isRecord(value) &&
    value.type === 'verify' &&
    typeof value.nonce === 'string' &&
    isRecord(value.proof)
  );
}

export function isWorkerProtocolResponse(
  value: unknown
): value is WorkerProtocolResponse {
  return (
    isVerifyResult(value) ||
    (isRecord(value) &&
      value.type === 'error' &&
      typeof value.error === 'string')
  );
}

function isVerifyResult(value: unknown): value is VerifyResult {
  return (
    isRecord(value) &&
    value.type === 'verifyResult' &&
    isRecord(value.transcript) &&
    typeof value.transcriptHash === 'string' &&
    typeof value.signature === 'string' &&
    typeof value.signingPublicKeyDer === 'string' &&
    typeof value.attestationDocument === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
