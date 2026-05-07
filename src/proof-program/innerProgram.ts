import { Field, ZkProgram } from 'o1js';

export const InnerProgram = ZkProgram({
  name: 'inner-add-program',
  publicInput: Field,
  publicOutput: Field,
  methods: {
    addSecret: {
      privateInputs: [Field],
      async method(publicInput: Field, secret: Field) {
        return {
          publicOutput: publicInput.add(secret),
        };
      },
    },
  },
});
