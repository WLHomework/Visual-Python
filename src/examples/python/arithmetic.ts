import type { ExampleProject } from "../types";

type SerializedBlock = Record<string, unknown> & { next?: { block: SerializedBlock } };

const number = (value: number): SerializedBlock => ({ type: "math_number", fields: { NUM: value } });
const variable = (name: string): SerializedBlock => ({ type: "variables_get", fields: { VAR: { name } } });
const input = (block: SerializedBlock) => ({ block });
const arithmetic = (operator: string): SerializedBlock => ({
  type: "math_arithmetic",
  fields: { OP: operator },
  inputs: { A: input(variable("a")), B: input(variable("b")) },
});
const print = (value: SerializedBlock): SerializedBlock => ({ type: "python_print", inputs: { VALUE: input(value) } });
const chain = (blocks: SerializedBlock[]) => {
  blocks.slice(0, -1).forEach((block, index) => { block.next = { block: blocks[index + 1] }; });
  return blocks[0];
};

export const arithmeticExample: ExampleProject = {
  id: "python-arithmetic",
  title: "四则运算",
  projectName: "arithmetic.vpy",
  workspace: {
    blocks: {
      languageVersion: 0,
      blocks: [chain([
        { type: "variables_set", x: 96, y: 72, fields: { VAR: { name: "a" } }, inputs: { VALUE: input(number(17)) } },
        { type: "variables_set", fields: { VAR: { name: "b" } }, inputs: { VALUE: input(number(5)) } },
        print(arithmetic("ADD")),
        print(arithmetic("MINUS")),
        print(arithmetic("MULTIPLY")),
        print(arithmetic("DIVIDE")),
        print({ type: "python_floor_divide", inputs: { A: input(variable("a")), B: input(variable("b")) } }),
        print({ type: "math_modulo", inputs: { DIVIDEND: input(variable("a")), DIVISOR: input(variable("b")) } }),
        print(arithmetic("POWER")),
      ])],
    },
  },
};
