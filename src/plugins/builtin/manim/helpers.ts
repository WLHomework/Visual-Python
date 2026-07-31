import * as Blockly from "blockly/core";
import { Order } from "blockly/python";
import { colour } from "./constants";
import { sanitizePythonIdentifier } from "../../../pythonIdentifiers";

export const safeClassName = (value: string, fallback: string) => {
  return sanitizePythonIdentifier(value, fallback, "Scene_");
};

export const safeIdentifier = (value: string, fallback: string) => {
  return sanitizePythonIdentifier(value, fallback);
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
export const directionShadow = (value: string) => ({ shadow: { type: "visual_python_manim_direction_constant", fields: { VALUE: value } } });
export const manimCircleShadow = (colour = "BLUE", radius = 1) => ({
  block: {
    type: "visual_python_manim_circle_object",
    fields: { COLOR: colour },
    inputs: { RADIUS: numberShadow(radius) },
  },
});
export const manimSquareShadow = (colour = "RED", sideLength = 2) => ({
  block: {
    type: "visual_python_manim_square_object",
    fields: { COLOR: colour },
    inputs: { SIDE_LENGTH: numberShadow(sideLength) },
  },
});
export const manimTextShadow = (content = "你好", fontSize = 48) => ({
  block: {
    type: "visual_python_manim_plain_text_object",
    fields: { COLOR: "WHITE" },
    inputs: { CONTENT: textShadow(content), FONT_SIZE: numberShadow(fontSize) },
  },
});
export const manimLineShadow = (start = "LEFT", end = "RIGHT") => ({
  block: {
    type: "visual_python_manim_line_segment_object",
    fields: { COLOR: "WHITE" },
    inputs: { START: directionShadow(start), END: directionShadow(end) },
  },
});
export const manimAxesShadow = () => ({
  block: {
    type: "visual_python_manim_axes_object",
    inputs: {
      X_RANGE: rangeShadow(-5, 5, 1),
      Y_RANGE: rangeShadow(-3, 3, 1),
      X_LENGTH: numberShadow(10),
      Y_LENGTH: numberShadow(6),
    },
  },
});
export const manimTrackerShadow = () => ({
  block: { type: "visual_python_manim_value_tracker", inputs: { VALUE: numberShadow(0) } },
});
export const manimCreateAnimationShadow = () => ({
  block: {
    type: "visual_python_manim_create_object_animation",
    inputs: { MOBJECT: manimCircleShadow(), RUN_TIME: numberShadow(1) },
  },
});
export const manimWriteAnimationShadow = () => ({
  block: {
    type: "visual_python_manim_write_animation",
    inputs: { MOBJECT: manimTextShadow(), RUN_TIME: numberShadow(1) },
  },
});
export const manimFunctionPresetBlock = (preset = "quadratic") => ({
  block: {
    type: "visual_python_manim_function_preset",
    fields: { PRESET: preset },
    inputs: {
      AMPLITUDE: numberShadow(1),
      FREQUENCY: numberShadow(1),
      OFFSET: numberShadow(0),
    },
  },
});
export const manimSurfaceFunctionPresetBlock = (preset = "wave") => ({
  block: {
    type: "visual_python_manim_surface_function_preset",
    fields: { PRESET: preset },
    inputs: { HEIGHT: numberShadow(0.5) },
  },
});
export const manimDimensionsBlock = () => ({
  block: {
    type: "visual_python_manim_dimensions",
    inputs: {
      WIDTH: numberShadow(3),
      HEIGHT: numberShadow(2),
      DEPTH: numberShadow(1),
    },
  },
});
export const pointList3Inputs = () => ({
  P1: { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "LEFT" } } },
  P2: { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "UP" } } },
  P3: { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "RIGHT" } } },
});
export const polygonVertexListShadow = () => ({
  ...pythonListBlock([
    { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "LEFT" } } },
    { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "UP" } } },
    { block: { type: "visual_python_manim_direction_constant", fields: { VALUE: "RIGHT" } } },
  ]),
});
export const manimObjectListShadow = () => pythonListBlock([
  manimCircleShadow(),
  manimSquareShadow(),
]);
export const animationListShadow = () => pythonListBlock([
  manimCreateAnimationShadow(),
  manimWriteAnimationShadow(),
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

type ManimReferenceKind = "axes" | "graph" | "tracker" | "table" | "line" | "arrow" | "group";

const referenceRequirement = (sourceBlock?: Blockly.Block | null): { kind: ManimReferenceKind; label: string } | null => {
  const parent = sourceBlock?.getParent();
  if (!parent || !sourceBlock) return null;
  const inputName = parent.inputList.find((input) => input.connection?.targetBlock() === sourceBlock)?.name;
  if (inputName === "AXES") return { kind: "axes", label: "坐标系" };
  if (parent.type === "visual_python_manim_axes_area" && inputName === "GRAPH") return { kind: "graph", label: "函数曲线" };
  if (inputName === "TRACKER") return { kind: "tracker", label: "数值追踪器" };
  if (inputName === "TABLE") return { kind: "table", label: "表格" };
  if (inputName === "LINE1" || inputName === "LINE2") return { kind: "line", label: "直线" };
  if (inputName === "ARROW") return { kind: "arrow", label: "箭头" };
  if (parent.type === "visual_python_manim_arrange" && inputName === "MOBJECT") return { kind: "group", label: "群组" };
  return null;
};

const objectPreservingInputs: Record<string, string> = {
  visual_python_manim_set_color: "MOBJECT",
  visual_python_manim_set_color_gradient: "MOBJECT",
  visual_python_manim_set_color_gradient_three: "MOBJECT",
  visual_python_manim_set_color_blend: "MOBJECT",
  visual_python_manim_set_opacity: "MOBJECT",
  visual_python_manim_set_fill: "MOBJECT",
  visual_python_manim_set_stroke: "MOBJECT",
  visual_python_manim_move_to: "MOBJECT",
  visual_python_manim_shift: "MOBJECT",
  visual_python_manim_scale: "MOBJECT",
  visual_python_manim_rotate: "MOBJECT",
  visual_python_manim_to_edge: "MOBJECT",
  visual_python_manim_to_corner: "MOBJECT",
  visual_python_manim_next_to: "MOBJECT",
  visual_python_manim_arrange: "MOBJECT",
  visual_python_manim_apply_matrix: "MOBJECT",
  visual_python_manim_transform_method: "MOBJECT",
  visual_python_manim_always_redraw: "MOBJECT",
  visual_python_manim_table_highlight_cell: "TABLE",
};

const manimObjectKinds = (
  block: Blockly.Block | null,
  assignments: Blockly.Block[],
  visited = new Set<string>(),
): Set<ManimReferenceKind> | null => {
  if (!block || visited.has(block.id)) return new Set();
  visited.add(block.id);
  const preservingInput = objectPreservingInputs[block.type];
  if (preservingInput) return manimObjectKinds(block.getInputTargetBlock(preservingInput), assignments, visited);
  if (block.type === "visual_python_manim_object_ref") {
    const name = safeIdentifier(block.getFieldValue("VAR"), "obj");
    const assignment = assignments.find((candidate) => safeIdentifier(candidate.getFieldValue("VAR"), "obj") === name);
    return manimObjectKinds(assignment?.getInputTargetBlock("MOBJECT") ?? null, assignments, visited);
  }

  const kinds = new Set<ManimReferenceKind>();
  if (["visual_python_manim_axes_object", "visual_python_manim_number_plane_object", "visual_python_manim_three_d_axes_object", "visual_python_manim_coordinate_object"].includes(block.type)) kinds.add("axes");
  if (block.type === "visual_python_manim_axes_plot") kinds.add("graph");
  if (block.type === "visual_python_manim_value_tracker") kinds.add("tracker");
  if (block.type === "visual_python_manim_table_object") kinds.add("table");
  if (["visual_python_manim_line_segment_object", "visual_python_manim_dashed_line_object", "visual_python_manim_line_object", "visual_python_manim_vector_object"].includes(block.type)) kinds.add("line");
  if (["visual_python_manim_arrow_object", "visual_python_manim_double_arrow_object", "visual_python_manim_curved_arrow_object"].includes(block.type)) {
    kinds.add("line");
    kinds.add("arrow");
  }
  if (["visual_python_manim_group_object", "visual_python_manim_group_from_list_object"].includes(block.type)) kinds.add("group");
  return block.type.startsWith("visual_python_manim_") ? kinds : null;
};

const getManimObjectOptions = (sourceBlock?: Blockly.Block | null): Array<[string, string]> => {
  const workspace = sourceBlock?.workspace;
  const blocks = workspace?.getAllBlocks(false) ?? [];
  const assignmentBlockTypes = new Set(["visual_python_manim_assign", "visual_python_manim_assign_add"]);
  const normalizeObjectName = (fieldValue: unknown) => {
    const rawName = String(fieldValue || "").trim();
    if (!rawName) return null;
    return safeIdentifier(rawName, "obj");
  };
  const assignments = blocks.filter((block) => assignmentBlockTypes.has(block.type));
  const requirement = referenceRequirement(sourceBlock);
  const names = assignments
    .filter((assignment) => {
      if (!requirement) return true;
      const kinds = manimObjectKinds(assignment.getInputTargetBlock("MOBJECT"), assignments);
      return kinds === null || kinds.has(requirement.kind);
    })
    .map((block) => normalizeObjectName(block.getFieldValue("VAR")))
    .filter((name): name is string => Boolean(name));
  const uniqueNames = [...new Set(names)].filter(Boolean);
  const emptyLabel = requirement ? `请先创建${requirement.label}` : "请先创建对象";
  return uniqueNames.length ? uniqueNames.map((name) => [name, name]) : [[emptyLabel, "obj"]];
};

export const registerObjectReferenceBlockDefinition = () => {
  Blockly.Blocks.visual_python_manim_object_ref = {
    init(this: Blockly.Block & { resolvingReference_?: boolean }) {
      this.appendDummyInput()
        .appendField("场景对象")
        .appendField(new Blockly.FieldDropdown(function (this: Blockly.FieldDropdown) {
          return getManimObjectOptions(this.getSourceBlock());
        }), "VAR");
      this.setInputsInline(true);
      this.setOutput(true, "ManimObject");
      this.setColour(colour);
      this.setTooltip("引用已经创建并命名的对象。下拉列表会根据当前位置筛选可用对象。");
      this.setOnChange(() => {
        if (this.resolvingReference_ || !this.workspace || this.workspace.isFlyout) return;
        const options = getManimObjectOptions(this);
        const current = String(this.getFieldValue("VAR") || "obj");
        if (options.some(([, value]) => value === current)) return;
        const next = options[0]?.[1] ?? "obj";
        if (next === current) return;
        this.resolvingReference_ = true;
        (this.getField("VAR") as Blockly.FieldDropdown | null)?.getOptions(false);
        this.setFieldValue(next, "VAR");
        this.resolvingReference_ = false;
      });
    },
  };
};
