import { generateEvenProofBundle, type EvenProofBundle } from './generateEvenProof.js';

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

    setStatus('Compiling the shared o1js program in your browser.');
    setStage('proof', 'active');
    const bundle = await generateEvenProofBundle(numberInput.value);
    renderLocalProof(bundle);
    setStage('proof', 'done');

    setStatus('Sending only the proof object to Project Teh Tarik server.');
    setStage('server', 'active');
    const responsePromise = fetch('/api/tee', {
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

function mustElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`missing #${id}`);
  }
  return element as T;
}
