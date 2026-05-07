import { UInt64, verify } from 'o1js';
import { InnerProgram } from '../proof-program/innerProgram.js';

export type EvenProofBundle = {
  number: string;
  square: string;
  proof: unknown;
  expectedPublicInput: string[];
  expectedPublicOutput: string[];
};

export async function generateEvenProofBundle(
  input: string | number | bigint
): Promise<EvenProofBundle> {
  const number = parseEvenDemoNumber(input);
  const publicSquare = number.mul(number);

  console.time('compile');
  const { verificationKey } = await InnerProgram.compile();
  console.timeEnd('compile');

  console.time('prove');
  const { proof } = await InnerProgram.proveEvenSquare(publicSquare, number);
  console.timeEnd('prove');
  const proofJson = proof.toJSON();

  console.time('verify');
  const ok = await verify(proofJson, verificationKey);
  console.timeEnd('verify');
  if (!ok) {
    throw new Error('generated proof did not verify locally');
  }

  return {
    number: number.toString(),
    square: publicSquare.toString(),
    proof: proofJson,
    expectedPublicInput: [publicSquare.toString()],
    expectedPublicOutput: ['1'],
  };
}

export function parseEvenDemoNumber(input: string | number | bigint): UInt64 {
  const raw = String(input).trim();
  if (!/^[0-9]+$/.test(raw)) {
    throw new Error('number must be a non-negative integer');
  }

  const number = UInt64.from(raw);
  if (number.mod(UInt64.from(2)).toString() !== '0') {
    throw new Error('number must be even');
  }

  return number;
}
