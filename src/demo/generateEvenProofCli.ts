import { generateEvenProofBundle } from './generateEvenProof.js';

const number = process.argv[2];

if (number === undefined) {
  process.stderr.write('usage: npm run demo:generate-proof -- <even-number>\n');
  process.exitCode = 1;
} else {
  generateEvenProofBundle(number)
    .then((bundle) => {
      process.stdout.write(`${JSON.stringify(bundle, null, 2)}\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(`${errorMessage(error)}\n`);
      process.exitCode = 1;
    });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
