import { Field, UInt64, ZkProgram } from 'o1js';

export const InnerProgram = ZkProgram({
  name: 'even-square-program',
  publicInput: UInt64,
  publicOutput: Field,
  methods: {
    proveEvenSquare: {
      privateInputs: [UInt64],
      async method(publicSquare: UInt64, number: UInt64) {
        number.mul(number).assertEquals(publicSquare);
        number.mod(UInt64.from(2)).assertEquals(UInt64.zero);

        return {
          publicOutput: Field(1),
        };
      },
    },
  },
});
