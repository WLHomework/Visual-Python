export type SerializedBlock = Record<string, any> & { next?: { block: SerializedBlock } };

export const input = (block: SerializedBlock) => ({ block });
export const text = (value: string): SerializedBlock => ({ type: "text", fields: { TEXT: value } });
export const number = (value: number): SerializedBlock => ({ type: "math_number", fields: { NUM: value } });
export const boolean = (value: boolean): SerializedBlock => ({ type: "logic_boolean", fields: { BOOL: value ? "TRUE" : "FALSE" } });
export const variable = (name: string): SerializedBlock => ({ type: "variables_get", fields: { VAR: { name } } });
export const setVariable = (name: string, value: SerializedBlock): SerializedBlock => ({ type: "variables_set", fields: { VAR: { name } }, inputs: { VALUE: input(value) } });
export const print = (value: SerializedBlock): SerializedBlock => ({ type: "python_print", inputs: { VALUE: input(value) } });
export const compare = (left: SerializedBlock, operator: string, right: SerializedBlock): SerializedBlock => ({ type: "logic_compare", fields: { OP: operator }, inputs: { A: input(left), B: input(right) } });
export const arithmetic = (left: SerializedBlock, operator: string, right: SerializedBlock): SerializedBlock => ({ type: "math_arithmetic", fields: { OP: operator }, inputs: { A: input(left), B: input(right) } });
export const list = (...items: SerializedBlock[]): SerializedBlock => ({ type: "python_list_collection", extraState: { itemCount: items.length }, inputs: Object.fromEntries(items.map((item, index) => [`ITEM${index}`, input(item)])) });
export const sequence = (kind: "list" | "tuple" | "set", ...items: SerializedBlock[]): SerializedBlock => ({ type: "python_sequence_collection", fields: { KIND: kind }, extraState: { itemCount: items.length }, inputs: Object.fromEntries(items.map((item, index) => [`ITEM${index}`, input(item)])) });
export const chain = (blocks: SerializedBlock[]): SerializedBlock => {
  blocks.slice(0, -1).forEach((block, index) => { block.next = { block: blocks[index + 1] }; });
  return blocks[0];
};
export const workspace = (root: SerializedBlock) => ({ blocks: { languageVersion: 0, blocks: [{ ...root, x: 96, y: 72 }] } });
