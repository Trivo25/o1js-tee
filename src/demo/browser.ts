import type { EvenProofBundle } from './generateEvenProof.js';
import type { ProofWorkerRequest, ProofWorkerResponse } from './proofWorker.js';

type StageId = 'proof' | 'server' | 'tee' | 'verified' | 'response';
type StageState = 'idle' | 'active' | 'done' | 'error';

type TeeApiResponse = {
  teeRequest?: {
    nonce?: string;
    expectedPublicInput?: string[];
    expectedPublicOutput?: string[];
  };
  teeResponse?: {
    transcript?: {
      ok?: boolean;
      nonce?: string;
      proofHash?: string;
      verificationKeyHash?: string;
      publicInput?: string[];
      publicOutput?: string[];
      policyVersion?: string;
    };
    transcriptHash?: string;
    signature?: string;
    signingPublicKeyDer?: string;
    attestationDocument?: string;
  };
};

const stages: StageId[] = ['proof', 'server', 'tee', 'verified', 'response'];
const form = mustElement<HTMLFormElement>('proof-form');
const numberInput = mustElement<HTMLInputElement>('number-input');
const submitButton = mustElement<HTMLButtonElement>('submit-button');
const statusText = mustElement('status-text');
const localProof = mustElement('local-proof');
const teeResponse = mustElement('tee-response');
const transcriptGrid = mustElement('transcript-grid');
const apiBase = resolveApiBase();
const proofWorker = createProofWorker();

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void runDemo();
});

if (!globalThis.crossOriginIsolated) {
  setStatus('Proof generation needs COOP/COEP headers and a secure local or HTTPS origin.');
}

async function runDemo(): Promise<void> {
  resetUi();
  setBusy(true);

  try {
    if (!globalThis.crossOriginIsolated) {
      throw new Error(
        'Proof generation needs cross-origin isolation. Use this server with COOP/COEP headers from localhost, an SSH tunnel, or HTTPS.'
      );
    }

    setStatus('Compiling the o1js program in a background worker.');
    setStage('proof', 'active');
    const bundle = await runProofInWorker(numberInput.value, (stage) => {
      if (stage === 'prove') setStatus('Generating the proof in a background worker.');
    });
    renderLocalProof(bundle);
    setStage('proof', 'done');

    setStatus(`Sending only the proof object to ${apiOriginLabel()} server.`);
    setStage('server', 'active');
    const responsePromise = fetch(teeApiUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proof: bundle.proof }),
    });
    setStage('tee', 'active');

    const response = await responsePromise;
    setStage('server', 'done');
    const body = (await response.json()) as TeeApiResponse & { error?: string };
    if (!response.ok) {
      throw new Error(body.error ?? `TEE request failed with ${response.status}`);
    }

    const ok = body.teeResponse?.transcript?.ok === true;
    setStage('tee', ok ? 'done' : 'error');
    setStage('verified', ok ? 'done' : 'error');
    if (!ok) {
      throw new Error('TEE transcript did not verify the proof');
    }

    setStatus('TEE signed the verified transcript.');
    renderTeeResponse(body);
    setStage('response', 'done');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Proof flow failed.');
    const activeStage = stages.find((stage) => stageElement(stage).dataset.state === 'active');
    if (activeStage) {
      setStage(activeStage, 'error');
    }
  } finally {
    setBusy(false);
  }
}

function resetUi(): void {
  for (const stage of stages) {
    setStage(stage, 'idle');
  }
  localProof.textContent = 'Waiting for a browser-generated proof.';
  teeResponse.textContent = 'Waiting for the enclave response.';
  transcriptGrid.replaceChildren();
}

function renderLocalProof(bundle: EvenProofBundle): void {
  localProof.textContent = JSON.stringify(
    {
      number: bundle.number,
      publicSquare: bundle.square,
      proofPublicInput: publicValue(bundle.proof, 'publicInput'),
      proofPublicOutput: publicValue(bundle.proof, 'publicOutput'),
    },
    null,
    2
  );
}

function renderTeeResponse(body: TeeApiResponse): void {
  const transcript = body.teeResponse?.transcript;
  transcriptGrid.replaceChildren(
    fact('TEE verdict', transcript?.ok === true ? 'verified' : 'rejected'),
    fact('TEE nonce', transcript?.nonce ?? body.teeRequest?.nonce ?? '-'),
    fact('Public input', (transcript?.publicInput ?? []).join(', ') || '-'),
    fact('Public output', (transcript?.publicOutput ?? []).join(', ') || '-'),
    fact('Transcript hash', shorten(body.teeResponse?.transcriptHash)),
    fact('Signature', shorten(body.teeResponse?.signature)),
    fact('Attestation', shorten(body.teeResponse?.attestationDocument))
  );

  teeResponse.textContent = JSON.stringify(
    {
      transcript: body.teeResponse?.transcript,
      transcriptHash: body.teeResponse?.transcriptHash,
      signature: body.teeResponse?.signature,
      signingPublicKeyDer: body.teeResponse?.signingPublicKeyDer,
      attestationDocument: shorten(body.teeResponse?.attestationDocument, 160),
    },
    null,
    2
  );
}

function fact(label: string, value: string): HTMLElement {
  const item = document.createElement('div');
  item.className = 'fact';

  const term = document.createElement('span');
  term.textContent = label;

  const detail = document.createElement('strong');
  detail.textContent = value;

  item.append(term, detail);
  return item;
}

function setStage(stage: StageId, state: StageState): void {
  stageElement(stage).dataset.state = state;
}

function stageElement(stage: StageId): HTMLElement {
  return mustElement(`stage-${stage}`);
}

function setStatus(message: string): void {
  statusText.textContent = message;
}

function setBusy(isBusy: boolean): void {
  submitButton.disabled = isBusy;
  numberInput.disabled = isBusy;
  submitButton.textContent = isBusy ? 'Running' : 'Generate and verify';
}

function publicValue(proof: unknown, key: 'publicInput' | 'publicOutput'): unknown {
  if (typeof proof !== 'object' || proof === null || Array.isArray(proof)) {
    return undefined;
  }
  return (proof as Record<string, unknown>)[key];
}

function shorten(value: unknown, maxLength = 42): string {
  if (typeof value !== 'string' || value.length === 0) {
    return '-';
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

function teeApiUrl(): string {
  if (!apiBase) {
    return '/api/tee';
  }
  return new URL('/api/tee', apiBase).toString();
}

function apiOriginLabel(): string {
  if (!apiBase) {
    return 'Project Teh Tarik';
  }
  return new URL(apiBase).origin;
}

function resolveApiBase(): string | undefined {
  const queryApi = new URLSearchParams(location.search).get('api')?.trim();
  if (queryApi) {
    const normalized = normalizeApiBase(queryApi);
    rememberApiBase(normalized);
    return normalized;
  }

  const metaApi = document.querySelector<HTMLMetaElement>('meta[name="tee-api-base"]')?.content.trim();
  if (metaApi) {
    return normalizeApiBase(metaApi);
  }

  const storedApi = readRememberedApiBase();
  return storedApi ? normalizeApiBase(storedApi) : undefined;
}

function normalizeApiBase(value: string): string {
  const url = new URL(value);
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function rememberApiBase(value: string): void {
  try {
    localStorage.setItem('project-teh-tarik-api-base', value);
  } catch {
    // Browsers can disable storage; the query parameter still works for this page load.
  }
}

function readRememberedApiBase(): string | undefined {
  try {
    return localStorage.getItem('project-teh-tarik-api-base') ?? undefined;
  } catch {
    return undefined;
  }
}

function mustElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`missing #${id}`);
  }
  return element as T;
}

function createProofWorker(): Worker {
  const worker = new Worker(new URL('./proof-worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('error', (event) => {
    console.error('proof worker error', event);
    setStatus(`Worker error: ${event.message ?? 'unknown'}`);
  });
  worker.addEventListener('messageerror', (event) => {
    console.error('proof worker messageerror', event);
  });
  return worker;
}

function runProofInWorker(
  input: string,
  onProgress: (stage: 'compile' | 'prove') => void
): Promise<EvenProofBundle> {
  const id = crypto.randomUUID();
  return new Promise<EvenProofBundle>((resolve, reject) => {
    function onMessage(event: MessageEvent<ProofWorkerResponse>) {
      const data = event.data;
      if (data.id !== id) return;
      if (data.type === 'progress') {
        onProgress(data.stage);
        return;
      }
      proofWorker.removeEventListener('message', onMessage);
      if (data.type === 'done') resolve(data.bundle);
      else reject(new Error(data.error));
    }
    proofWorker.addEventListener('message', onMessage);
    const request: ProofWorkerRequest = { id, input };
    proofWorker.postMessage(request);
  });
}
