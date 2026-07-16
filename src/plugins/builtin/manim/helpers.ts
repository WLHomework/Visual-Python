import * as Blockly from "blockly/core";
import { Order } from "blockly/python";
import { colour } from "./constants";

export const safeClassName = (value: string, fallback: string) => {
  const cleaned = String(value || "").trim().replace(/[^A-Za-z0-9_]/g, "_");
  const name = cleaned || fallback;
  return /^[A-Za-z_]/.test(name) ? name : `Scene_${name}`;
};

export const safeIdentifier = (value: string, fallback: string) => {
  const cleaned = String(value || "").trim().replace(/[^A-Za-z0-9_]/g, "_");
  const name = cleaned || fallback;
  return /^[A-Za-z_]/.test(name) ? name : `obj_${name}`;
};

export const addManimImport = (generator: any) => {
  generator.definitions_ = generator.definitions_ || {};
  generator.definitions_.import_manim = "from manim import *";
};

export const value = (generator: any, block: any, name: string, fallback: string, order = Order.NONE) =>
  generator.valueToCode(block, name, order) || fallback;

export const suite = (generator: any, block: any, name: string) =>
  generator.statementToCode(block, name) || `${generator.INDENT}pass\n`;

export const joinArguments = (...parts: string[]) => parts.map((part) => part.trim()).filter(Boolean).join(", ");

export const pythonCall = (
  callee: string,
  args: string[],
  options: { multiline?: boolean; indent?: string } = {},
) => {
  const normalizedArgs = args.map((arg) => arg.trim()).filter(Boolean);
  if (!options.multiline) return `${callee}(${normalizedArgs.join(", ")})`;
  const indent = options.indent ?? "    ";
  const body = normalizedArgs.map((arg) => `${indent}${arg},`).join("\n");
  return `${callee}(\n${body}\n)`;
};

export const toolboxBlock = (type: string, inputs?: Record<string, unknown>) => inputs ? { kind: "block", type, inputs } : { kind: "block", type };
export const category = (name: string, contents: Array<Record<string, unknown>>, categoryColour = colour) => ({ kind: "category", name, colour: categoryColour, contents });
export const textShadow = (text: string) => ({ shadow: { type: "text", fields: { TEXT: text } } });
export const formulaShadow = (latex: string) => ({ shadow: { type: "visual_python_manim_formula_value", fields: { LATEX: latex } } });
export const numberShadow = (num: number) => ({ shadow: { type: "math_number", fields: { NUM: num } } });
const textBlock = (text: string) => ({ block: { type: "text", fields: { TEXT: text } } });
const numberBlock = (num: number) => ({ block: { type: "math_number", fields: { NUM: num } } });
const pythonListBlock = (items: Record<string, unknown>[]) => ({
  block: {
    type: "python_list_collection",
    extraState: { itemCount: items.length },
    inputs: Object.fromEntries(items.map((item, index) => [`ITEM${index}`, item])),
  },
});
export const degreesShadow = (num: number) => ({ shadow: { type: "visual_python_manim_degrees", fields: { VALUE: num } } });
export const rangeShadow = (start: number, end: number, step: number) => ({
  shadow: { type: "visual_python_manim_range", inputs: { START: numberShadow(start), END: numberShadow(end), STEP: numberShadow(step) } },
});
export const rangeMinMaxShadow = (start: number, end: number) => ({
  shadow: { type: "visual_python_manim_range_min_max", inputs: { START: numberShadow(start), END: numberShadow(end) } },
});
export const pointShadow = (x: number, y: number, z = 0) => ({
  shadow: { type: "visual_python_manim_point", inputs: { X: numberShadow(x), Y: numberShadow(y), Z: numberShadow(z) } },
});
export const expressionShadow = (code: string) => ({ shadow: { type: "python_raw_expression", fields: { CODE: code } } });
export const directionShadow = (value: string) => ({ shadow: { type: "visual_python_manim_direction_constant", fields: { VALUE: value } } });
export const pointList3Shadow = () => ({
  shadow: {
    type: "visual_python_manim_point_list_3",
    inputs: { P1: directionShadow("LEFT"), P2: directionShadow("UP"), P3: directionShadow("RIGHT") },
  },
});
export const polygonVertexListShadow = () => ({
  ...pythonListBlock([
    { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "LEFT" } } },
    { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "UP" } } },
    { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "RIGHT" } } },
  ]),
});
export const manimObjectListShadow = () => pythonListBlock([
  { block: { type: "visual_python_manim_object_ref" } },
  { block: { type: "visual_python_manim_object_ref" } },
]);
export const animationListShadow = () => pythonListBlock([
  { block: { type: "visual_python_manim_create_object_animation", inputs: { RUN_TIME: numberShadow(1) } } },
  { block: { type: "visual_python_manim_write_animation", inputs: { RUN_TIME: numberShadow(1) } } },
]);
export const tableData2x2Shadow = () => ({
  shadow: {
    type: "visual_python_manim_table_data_2x2",
    inputs: { A: textShadow("A"), B: textShadow("B"), C: textShadow("C"), D: textShadow("D") },
  },
});
export const matrixData2x2Shadow = () => ({
  shadow: {
    type: "visual_python_manim_matrix_data_2x2",
    inputs: { A: numberShadow(1), B: numberShadow(2), C: numberShadow(3), D: numberShadow(4) },
  },
});
export const dynamicTableDataShadow = () => pythonListBlock([
  pythonListBlock([textBlock("A"), textBlock("B")]),
  pythonListBlock([textBlock("C"), textBlock("D")]),
]);
export const dynamicMatrixDataShadow = () => pythonListBlock([
  pythonListBlock([numberBlock(1), numberBlock(2)]),
  pythonListBlock([numberBlock(3), numberBlock(4)]),
]);

const getManimObjectOptions = (sourceBlock?: Blockly.Block | null): Array<[string, string]> => {
  const workspace = sourceBlock?.workspace;
  const blocks = workspace?.getAllBlocks(false) ?? [];
  const assignmentBlockTypes = new Set(["visual_python_manim_assign", "visual_python_manim_assign_add"]);
  const normalizeObjectName = (fieldValue: unknown) => {
    const rawName = String(fieldValue || "").trim();
    if (!rawName) return null;
    const name = safeIdentifier(rawName, "obj");
    return /[A-Za-z0-9]/.test(name) ? name : null;
  };
  const names = blocks
    .filter((block) => assignmentBlockTypes.has(block.type))
    .map((block) => normalizeObjectName(block.getFieldValue("VAR")))
    .filter((name): name is string => Boolean(name));
  const uniqueNames = [...new Set(names)].filter(Boolean);
  return uniqueNames.length ? uniqueNames.map((name) => [name, name]) : [["请先创建对象", "obj"]];
};

export const registerObjectReferenceBlockDefinition = () => {
  Blockly.Blocks.visual_python_manim_object_ref = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField("Manim 对象")
        .appendField(new Blockly.FieldDropdown(function (this: Blockly.FieldDropdown) {
          return getManimObjectOptions(this.getSourceBlock());
        }), "VAR");
      this.setInputsInline(true);
      this.setOutput(true, "ManimObject");
      this.setColour(colour);
    },
  };
};
