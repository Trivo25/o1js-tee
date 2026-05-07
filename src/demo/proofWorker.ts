import { generateEvenProofBundle, type EvenProofBundle } from './generateEvenProof.js';

export type ProofWorkerRequest = { id: string; input: string };
export type ProofWorkerResponse =
  | { id: string; type: 'progress'; stage: 'compile' | 'prove' }
  | { id: string; type: 'done'; bundle: EvenProofBundle }
  | { id: string; type: 'error'; error: string };

let ready = false;

self.addEventListener('message', async (event: MessageEvent<ProofWorkerRequest>) => {
  let { id, input } = event.data;
  try {
    if (!ready) {
      send({ id, type: 'progress', stage: 'compile' });
    }
    send({ id, type: 'progress', stage: 'prove' });
    let bundle = await generateEvenProofBundle(input);
    ready = true;
    send({ id, type: 'done', bundle });
  } catch (err) {
    let error = err instanceof Error ? err.message : String(err);
    send({ id, type: 'error', error });
  }
});

function send(message: ProofWorkerResponse): void {
  (self as unknown as Worker).postMessage(message);
}
