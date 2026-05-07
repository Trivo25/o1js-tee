import fs from 'node:fs/promises';
import { UInt64, verify } from 'o1js';
import { InnerProgram } from './innerProgram.js';

const fixturesDir = 'fixtures';

const { verificationKey } = await InnerProgram.compile();

const number = UInt64.from(10);
const publicSquare = number.mul(number);
const { proof } = await InnerProgram.proveEvenSquare(publicSquare, number);
const proofJson = proof.toJSON();

const verified = await verify(proofJson, verificationKey);
if (!verified) {
  throw new Error('generated proof did not verify');
}

await fs.mkdir(fixturesDir, { recursive: true });

await fs.writeFile(
  `${fixturesDir}/verification-key.json`,
  `${JSON.stringify(verificationKey, null, 2)}\n`
);

await fs.writeFile(
  `${fixturesDir}/valid-proof.json`,
  `${JSON.stringify(proofJson, null, 2)}\n`
);

await fs.writeFile(
  `${fixturesDir}/expected-public.json`,
  `${JSON.stringify(
    {
      publicInput: ['100'],
      publicOutput: ['1'],
    },
    null,
    2
  )}\n`
);
