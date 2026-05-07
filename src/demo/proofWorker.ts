import { UInt64, setNumberOfWorkers, verify } from 'o1js';
import { InnerProgram } from '../proof-program/innerProgram.js';
import {
  parseEvenDemoNumber,
  type EvenProofBundle,
} from './generateEvenProof.js';

// fall back to single-threaded WASM — avoids nested-worker COI propagation issues on github pages
//setNumberOfWorkers(1);

export type ProofWorkerRequest = { id: string; input: string };
export type ProofWorkerResponse =
  | { id: string; type: 'progress'; stage: string }
  | { id: string; type: 'done'; bundle: EvenProofBundle }
  | { id: string; type: 'error'; error: string };

console.log('[proof-worker] module evaluated', {
  crossOriginIsolated: (self as unknown as { crossOriginIsolated?: boolean })
    .crossOriginIsolated,
  sharedArrayBuffer: typeof SharedArrayBuffer,
  hardwareConcurrency: navigator.hardwareConcurrency,
});

self.addEventListener(
  'message',
  async (event: MessageEvent<ProofWorkerRequest>) => {
    let { id, input } = event.data;
    try {
      console.log('[proof-worker] request received', id);
      progress(id, 'parsing input');
      let number = parseEvenDemoNumber(input);
      let publicSquare = number.mul(number);

      progress(id, 'compiling program');
      console.time('[proof-worker] compile');
      let { verificationKey } = await InnerProgram.compile();
      console.timeEnd('[proof-worker] compile');

      progress(id, 'generating proof');
      console.time('[proof-worker] prove');
      let { proof } = await InnerProgram.proveEvenSquare(publicSquare, number);
      console.timeEnd('[proof-worker] prove');
      let proofJson = proof.toJSON();

      progress(id, 'verifying proof locally');
      console.time('[proof-worker] verify');
      let ok = await verify(proofJson, verificationKey);
      console.timeEnd('[proof-worker] verify');
      if (!ok) {
        throw new Error('generated proof did not verify locally');
      }

      let bundle: EvenProofBundle = {
        number: number.toString(),
        square: publicSquare.toString(),
        proof: proofJson,
        expectedPublicInput: [publicSquare.toString()],
        expectedPublicOutput: ['1'],
      };
      send({ id, type: 'done', bundle });
    } catch (err) {
      console.error('[proof-worker] failed', err);
      let error =
        err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      send({ id, type: 'error', error });
    }
  },
);

function progress(id: string, stage: string) {
  send({ id, type: 'progress', stage });
}

function send(message: ProofWorkerResponse): void {
  (self as unknown as Worker).postMessage(message);
}

// silence unused import warning when types are used at runtime
void UInt64;
