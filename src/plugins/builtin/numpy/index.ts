import * as Blockly from "blockly/core";
import { pythonGenerator, Order } from "blockly/python";
import { pythonIdentifierOrFallback } from "../../../pythonIdentifiers";
import { PLUGIN_API_VERSION, type PluginBlockDefinition, type PluginContext, type VisualPythonPlugin } from "../../api/types";

const numpyColour = "#3d7fb5";
const arrayOutput = "NumPyArray";
const category = (name: string, contents: Array<Record<string, unknown>>) => ({ kind: "category", name, colour: numpyColour, contents });

const numberShadow = (value: number) => ({ shadow: { type: "math_number", fields: { NUM: value } } });
const listShadow = (values: number[]) => ({
  block: {
    type: "python_list_collection",
    extraState: { itemCount: values.length },
    inputs: Object.fromEntries(values.map((value, index) => [`ITEM${index}`, numberShadow(value)])),
  },
});
const arrayShadow = (values: number[]) => ({
  block: { type: "visual_python_numpy_array", inputs: { DATA: listShadow(values) } },
});

const value = (generator: typeof pythonGenerator, block: Blockly.Block, name: string, fallback = "None") =>
  generator.valueToCode(block, name, Order.NONE) || fallback;

const validAlias = (input: unknown) => pythonIdentifierOrFallback(String(input || "").trim(), "np");
const rootModule = (input: unknown) => String(input || "").trim().split(".", 1)[0];

function findNumpyAlias(workspace: Blockly.Workspace): string | null {
  let alias: string | null = null;
  for (const block of workspace.getAllBlocks(false)) {
    if (block.type === "visual_python_numpy_import") return validAlias(block.getFieldValue("ALIAS"));
    if (block.type === "python_import_as" && rootModule(block.getFieldValue("MODULE")) === "numpy") {
      alias ??= validAlias(block.getFieldValue("ALIAS"));
    }
    if (block.type === "python_import" && rootModule(block.getFieldValue("MODULE")) === "numpy") alias ??= "numpy";
  }
  return alias;
}

const numpyReference = (block: Blockly.Block, generator: typeof pythonGenerator) => {
  const existingAlias = findNumpyAlias(block.workspace);
  if (existingAlias) return existingAlias;
  const definitions = generator as typeof pythonGenerator & { definitions_: Record<string, string> };
  definitions.definitions_.import_numpy = "import numpy as np";
  return "np";
};

const blockDefinitions: PluginBlockDefinition[] = [
  { type: "visual_python_numpy_import", message0: "导入 NumPy，命名为 %1", args0: [{ type: "field_input", name: "ALIAS", text: "np" }], previousStatement: null, nextStatement: null, colour: numpyColour, tooltip: "导入 NumPy。未放置此积木时，其他 NumPy 积木会自动生成 import numpy as np。" },
  { type: "visual_python_numpy_array", message0: "创建 NumPy 数组 %1", args0: [{ type: "input_value", name: "DATA" }], output: arrayOutput, colour: numpyColour, tooltip: "把列表、元组或其他序列转换为 NumPy 数组。" },
  { type: "visual_python_numpy_zeros", message0: "创建全为 0 的数组，形状 %1", args0: [{ type: "input_value", name: "SHAPE" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_ones", message0: "创建全为 1 的数组，形状 %1", args0: [{ type: "input_value", name: "SHAPE" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_full", message0: "创建填充值为 %1 的数组，形状 %2", args0: [{ type: "input_value", name: "VALUE" }, { type: "input_value", name: "SHAPE" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_arange", message0: "创建等差数组，从 %1 到 %2，步长 %3", args0: [{ type: "input_value", name: "START" }, { type: "input_value", name: "STOP" }, { type: "input_value", name: "STEP" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_linspace", message0: "在 %1 到 %2 之间生成 %3 个等间距数", args0: [{ type: "input_value", name: "START" }, { type: "input_value", name: "STOP" }, { type: "input_value", name: "COUNT" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_shape", message0: "读取数组 %1 的形状", args0: [{ type: "input_value", name: "ARRAY" }], output: "PythonTuple", colour: numpyColour },
  { type: "visual_python_numpy_ndim", message0: "读取数组 %1 的维度数", args0: [{ type: "input_value", name: "ARRAY" }], output: "Number", colour: numpyColour },
  { type: "visual_python_numpy_size", message0: "读取数组 %1 的元素个数", args0: [{ type: "input_value", name: "ARRAY" }], output: "Number", colour: numpyColour },
  { type: "visual_python_numpy_reshape", message0: "将数组 %1 重塑为形状 %2", args0: [{ type: "input_value", name: "ARRAY" }, { type: "input_value", name: "SHAPE" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_transpose", message0: "转置数组 %1", args0: [{ type: "input_value", name: "ARRAY" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_index", message0: "读取数组 %1 的第 %2 项", args0: [{ type: "input_value", name: "ARRAY" }, { type: "input_value", name: "INDEX" }], output: null, colour: numpyColour },
  { type: "visual_python_numpy_flatten", message0: "将数组 %1 展平", args0: [{ type: "input_value", name: "ARRAY" }], output: arrayOutput, colour: numpyColour, tooltip: "把多维数组展平成一维数组。" },
  { type: "visual_python_numpy_ravel", message0: "将数组 %1 展平为视图", args0: [{ type: "input_value", name: "ARRAY" }], output: arrayOutput, colour: numpyColour, tooltip: "返回展平后的数组视图，适合不需要复制数据的场景。" },
  { type: "visual_python_numpy_squeeze", message0: "删除数组 %1 中长度为 1 的维度", args0: [{ type: "input_value", name: "ARRAY" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_expand_dims", message0: "在数组 %1 的第 %2 轴增加一维", args0: [{ type: "input_value", name: "ARRAY" }, { type: "input_value", name: "AXIS" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_sort", message0: "将数组 %1 排序", args0: [{ type: "input_value", name: "ARRAY" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_argsort", message0: "获取数组 %1 排序后的索引", args0: [{ type: "input_value", name: "ARRAY" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_unique", message0: "获取数组 %1 中不重复的值", args0: [{ type: "input_value", name: "ARRAY" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_aggregate", message0: "对数组 %1 进行 %2", args0: [{ type: "input_value", name: "ARRAY" }, { type: "field_dropdown", name: "FUNCTION", options: [["平均值", "mean"], ["总和", "sum"], ["最大值", "max"], ["最小值", "min"], ["标准差", "std"], ["绝对值", "abs"]] }], output: null, colour: numpyColour },
  { type: "visual_python_numpy_binary", message0: "数组 %1 %2 数组 %3", args0: [{ type: "input_value", name: "LEFT" }, { type: "field_dropdown", name: "OP", options: [["加", "add"], ["减", "subtract"], ["乘", "multiply"], ["除", "divide"], ["矩阵乘", "matmul"]] }, { type: "input_value", name: "RIGHT" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_concatenate", message0: "沿第 %3 轴拼接数组 %1 和 %2", args0: [{ type: "input_value", name: "LEFT" }, { type: "input_value", name: "RIGHT" }, { type: "field_dropdown", name: "AXIS", options: [["0", "0"], ["1", "1"]] }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_stack", message0: "沿第 %3 轴堆叠数组 %1 和 %2", args0: [{ type: "input_value", name: "LEFT" }, { type: "input_value", name: "RIGHT" }, { type: "field_dropdown", name: "AXIS", options: [["0", "0"], ["1", "1"]] }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_vstack", message0: "按行堆叠数组 %1 和 %2", args0: [{ type: "input_value", name: "LEFT" }, { type: "input_value", name: "RIGHT" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_hstack", message0: "按列堆叠数组 %1 和 %2", args0: [{ type: "input_value", name: "LEFT" }, { type: "input_value", name: "RIGHT" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_split", message0: "将数组 %1 平均切分为 %2 份，沿第 %3 轴", args0: [{ type: "input_value", name: "ARRAY" }, { type: "input_value", name: "PARTS" }, { type: "field_dropdown", name: "AXIS", options: [["0", "0"], ["1", "1"]] }], output: "Array", colour: numpyColour },
  { type: "visual_python_numpy_where", message0: "如果条件 %1 成立则取 %2，否则取 %3", args0: [{ type: "input_value", name: "CONDITION" }, { type: "input_value", name: "X" }, { type: "input_value", name: "Y" }], output: null, colour: numpyColour },
  { type: "visual_python_numpy_clip", message0: "将数组 %1 限制在 %2 到 %3 之间", args0: [{ type: "input_value", name: "ARRAY" }, { type: "input_value", name: "MIN" }, { type: "input_value", name: "MAX" }], output: null, colour: numpyColour },
  { type: "visual_python_numpy_nonzero", message0: "查找数组 %1 中非零元素的位置", args0: [{ type: "input_value", name: "ARRAY" }], output: "PythonTuple", colour: numpyColour },
  { type: "visual_python_numpy_math", message0: "对 %1 进行 %2 运算", args0: [{ type: "input_value", name: "VALUE" }, { type: "field_dropdown", name: "FUNCTION", options: [["开平方", "sqrt"], ["指数", "exp"], ["自然对数", "log"], ["正弦", "sin"], ["余弦", "cos"], ["正切", "tan"], ["四舍五入", "round"]] }], output: null, colour: numpyColour },
  { type: "visual_python_numpy_random_uniform", message0: "生成形状为 %1 的均匀随机数组", args0: [{ type: "input_value", name: "SHAPE" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_random_integer", message0: "生成从 %1（含）到 %2（不含）的随机整数，数量或形状 %3", args0: [{ type: "input_value", name: "LOW" }, { type: "input_value", name: "HIGH" }, { type: "input_value", name: "SIZE" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_random_normal", message0: "生成形状为 %1 的标准正态随机数组", args0: [{ type: "input_value", name: "SHAPE" }], output: arrayOutput, colour: numpyColour },
  { type: "visual_python_numpy_random_choice", message0: "从数组 %1 中随机选择 %2 个值", args0: [{ type: "input_value", name: "ARRAY" }, { type: "input_value", name: "COUNT" }], output: arrayOutput, colour: numpyColour },
];

const registerGenerator = (context: PluginContext, type: string, generator: (block: Blockly.Block, activeGenerator: typeof pythonGenerator) => string | [string, number]) => {
  context.registerBlock(blockDefinitions.find((definition) => definition.type === type)!, generator);
};

export const numpyPlugin: VisualPythonPlugin = {
  manifest: {
    id: "visual-python.numpy",
    name: "NumPy",
    version: "1.1.0",
    apiVersion: PLUGIN_API_VERSION,
    description: "使用 NumPy 数组进行创建、变形、拼接、筛选、统计、数学计算和随机数处理。",
    builtin: true,
    python: { packages: ["numpy"] },
    agent: {
      description: "使用 NumPy 积木创建、整理、拼接、筛选和计算数组，并生成常用数学函数与随机数代码。",
      fileTypes: [".py", ".vpy"],
      detect: "imports",
    },
  },
  activate(context) {
    registerGenerator(context, "visual_python_numpy_import", (block) => `import numpy as ${validAlias(block.getFieldValue("ALIAS"))}\n`);
    registerGenerator(context, "visual_python_numpy_array", (block, generator) => [`${numpyReference(block, generator)}.array(${value(generator, block, "DATA", "[]")})`, Order.FUNCTION_CALL]);
    registerGenerator(context, "visual_python_numpy_zeros", (block, generator) => [`${numpyReference(block, generator)}.zeros(${value(generator, block, "SHAPE", "(1,)")})`, Order.FUNCTION_CALL]);
    registerGenerator(context, "visual_python_numpy_ones", (block, generator) => [`${numpyReference(block, generator)}.ones(${value(generator, block, "SHAPE", "(1,)")})`, Order.FUNCTION_CALL]);
    registerGenerator(context, "visual_python_numpy_full", (block, generator) => [`${numpyReference(block, generator)}.full(${value(generator, block, "SHAPE", "(1,)")}, ${value(generator, block, "VALUE", "0")})`, Order.FUNCTION_CALL]);
    registerGenerator(context, "visual_python_numpy_arange", (block, generator) => [`${numpyReference(block, generator)}.arange(${value(generator, block, "START", "0")}, ${value(generator, block, "STOP", "10")}, ${value(generator, block, "STEP", "1")})`, Order.FUNCTION_CALL]);
    registerGenerator(context, "visual_python_numpy_linspace", (block, generator) => [`${numpyReference(block, generator)}.linspace(${value(generator, block, "START", "0")}, ${value(generator, block, "STOP", "1")}, int(${value(generator, block, "COUNT", "50")}))`, Order.FUNCTION_CALL]);
    registerGenerator(context, "visual_python_numpy_shape", (block, generator) => { const reference = numpyReference(block, generator); return [`${value(generator, block, "ARRAY", `${reference}.array([])`)}.shape`, Order.MEMBER]; });
    registerGenerator(context, "visual_python_numpy_ndim", (block, generator) => { const reference = numpyReference(block, generator); return [`${value(generator, block, "ARRAY", `${reference}.array([])`)}.ndim`, Order.MEMBER]; });
    registerGenerator(context, "visual_python_numpy_size", (block, generator) => { const reference = numpyReference(block, generator); return [`${value(generator, block, "ARRAY", `${reference}.array([])`)}.size`, Order.MEMBER]; });
    registerGenerator(context, "visual_python_numpy_reshape", (block, generator) => { const reference = numpyReference(block, generator); return [`${value(generator, block, "ARRAY", `${reference}.array([])`)}.reshape(${value(generator, block, "SHAPE", "(-1,)")})`, Order.FUNCTION_CALL]; });
    registerGenerator(context, "visual_python_numpy_transpose", (block, generator) => { const reference = numpyReference(block, generator); return [`${value(generator, block, "ARRAY", `${reference}.array([])`)}.T`, Order.MEMBER]; });
    registerGenerator(context, "visual_python_numpy_index", (block, generator) => { const reference = numpyReference(block, generator); return [`${value(generator, block, "ARRAY", `${reference}.array([])`)}[${value(generator, block, "INDEX", "0")}]`, Order.MEMBER]; });
    registerGenerator(context, "visual_python_numpy_flatten", (block, generator) => { const reference = numpyReference(block, generator); return [`${value(generator, block, "ARRAY", `${reference}.array([])`)}.flatten()`, Order.FUNCTION_CALL]; });
    registerGenerator(context, "visual_python_numpy_ravel", (block, generator) => { const reference = numpyReference(block, generator); return [`${value(generator, block, "ARRAY", `${reference}.array([])`)}.ravel()`, Order.FUNCTION_CALL]; });
    registerGenerator(context, "visual_python_numpy_squeeze", (block, generator) => { const reference = numpyReference(block, generator); return [`${value(generator, block, "ARRAY", `${reference}.array([])`)}.squeeze()`, Order.FUNCTION_CALL]; });
    registerGenerator(context, "visual_python_numpy_expand_dims", (block, generator) => { const reference = numpyReference(block, generator); return [`${reference}.expand_dims(${value(generator, block, "ARRAY", `${reference}.array([])`)}, axis=${value(generator, block, "AXIS", "0")})`, Order.FUNCTION_CALL]; });
    registerGenerator(context, "visual_python_numpy_sort", (block, generator) => { const reference = numpyReference(block, generator); return [`${reference}.sort(${value(generator, block, "ARRAY", `${reference}.array([])`)})`, Order.FUNCTION_CALL]; });
    registerGenerator(context, "visual_python_numpy_argsort", (block, generator) => { const reference = numpyReference(block, generator); return [`${reference}.argsort(${value(generator, block, "ARRAY", `${reference}.array([])`)})`, Order.FUNCTION_CALL]; });
    registerGenerator(context, "visual_python_numpy_unique", (block, generator) => { const reference = numpyReference(block, generator); return [`${reference}.unique(${value(generator, block, "ARRAY", `${reference}.array([])`)})`, Order.FUNCTION_CALL]; });
    registerGenerator(context, "visual_python_numpy_aggregate", (block, generator) => {
      const reference = numpyReference(block, generator);
      const functionName = String(block.getFieldValue("FUNCTION") || "mean");
      return [`${reference}.${functionName}(${value(generator, block, "ARRAY", "[]")})`, Order.FUNCTION_CALL];
    });
    registerGenerator(context, "visual_python_numpy_binary", (block, generator) => {
      const reference = numpyReference(block, generator);
      const left = value(generator, block, "LEFT", `${reference}.array([])`);
      const right = value(generator, block, "RIGHT", `${reference}.array([])`);
      const operation = String(block.getFieldValue("OP") || "add");
      if (operation === "matmul") return [`${reference}.matmul(${left}, ${right})`, Order.FUNCTION_CALL];
      const operators: Record<string, string> = { add: "+", subtract: "-", multiply: "*", divide: "/" };
      return [`${left} ${operators[operation] || "+"} ${right}`, Order.ADDITIVE];
    });
    registerGenerator(context, "visual_python_numpy_concatenate", (block, generator) => {
      const reference = numpyReference(block, generator);
      const left = value(generator, block, "LEFT", `${reference}.array([])`);
      const right = value(generator, block, "RIGHT", `${reference}.array([])`);
      return [`${reference}.concatenate((${left}, ${right}), axis=${String(block.getFieldValue("AXIS") || "0")})`, Order.FUNCTION_CALL];
    });
    registerGenerator(context, "visual_python_numpy_stack", (block, generator) => {
      const reference = numpyReference(block, generator);
      const left = value(generator, block, "LEFT", `${reference}.array([])`);
      const right = value(generator, block, "RIGHT", `${reference}.array([])`);
      return [`${reference}.stack((${left}, ${right}), axis=${String(block.getFieldValue("AXIS") || "0")})`, Order.FUNCTION_CALL];
    });
    registerGenerator(context, "visual_python_numpy_vstack", (block, generator) => {
      const reference = numpyReference(block, generator);
      return [`${reference}.vstack((${value(generator, block, "LEFT", `${reference}.array([])`)}, ${value(generator, block, "RIGHT", `${reference}.array([])`)}))`, Order.FUNCTION_CALL];
    });
    registerGenerator(context, "visual_python_numpy_hstack", (block, generator) => {
      const reference = numpyReference(block, generator);
      return [`${reference}.hstack((${value(generator, block, "LEFT", `${reference}.array([])`)}, ${value(generator, block, "RIGHT", `${reference}.array([])`)}))`, Order.FUNCTION_CALL];
    });
    registerGenerator(context, "visual_python_numpy_split", (block, generator) => {
      const reference = numpyReference(block, generator);
      return [`${reference}.array_split(${value(generator, block, "ARRAY", `${reference}.array([])`)}, int(${value(generator, block, "PARTS", "2")}), axis=${String(block.getFieldValue("AXIS") || "0")})`, Order.FUNCTION_CALL];
    });
    registerGenerator(context, "visual_python_numpy_where", (block, generator) => {
      const reference = numpyReference(block, generator);
      return [`${reference}.where(${value(generator, block, "CONDITION", "False")}, ${value(generator, block, "X", "0")}, ${value(generator, block, "Y", "0")})`, Order.FUNCTION_CALL];
    });
    registerGenerator(context, "visual_python_numpy_clip", (block, generator) => {
      const reference = numpyReference(block, generator);
      return [`${reference}.clip(${value(generator, block, "ARRAY", `${reference}.array([])`)}, ${value(generator, block, "MIN", "0")}, ${value(generator, block, "MAX", "1")})`, Order.FUNCTION_CALL];
    });
    registerGenerator(context, "visual_python_numpy_nonzero", (block, generator) => {
      const reference = numpyReference(block, generator);
      return [`${reference}.nonzero(${value(generator, block, "ARRAY", `${reference}.array([])`)})`, Order.FUNCTION_CALL];
    });
    registerGenerator(context, "visual_python_numpy_math", (block, generator) => {
      const reference = numpyReference(block, generator);
      const functionName = String(block.getFieldValue("FUNCTION") || "sqrt");
      return [`${reference}.${functionName}(${value(generator, block, "VALUE", "0")})`, Order.FUNCTION_CALL];
    });
    registerGenerator(context, "visual_python_numpy_random_uniform", (block, generator) => {
      const reference = numpyReference(block, generator);
      return [`${reference}.random.random(size=${value(generator, block, "SHAPE", "1")})`, Order.FUNCTION_CALL];
    });
    registerGenerator(context, "visual_python_numpy_random_integer", (block, generator) => {
      const reference = numpyReference(block, generator);
      return [`${reference}.random.randint(${value(generator, block, "LOW", "0")}, ${value(generator, block, "HIGH", "10")}, size=${value(generator, block, "SIZE", "1")})`, Order.FUNCTION_CALL];
    });
    registerGenerator(context, "visual_python_numpy_random_normal", (block, generator) => {
      const reference = numpyReference(block, generator);
      return [`${reference}.random.standard_normal(size=${value(generator, block, "SHAPE", "1")})`, Order.FUNCTION_CALL];
    });
    registerGenerator(context, "visual_python_numpy_random_choice", (block, generator) => {
      const reference = numpyReference(block, generator);
      return [`${reference}.random.choice(${value(generator, block, "ARRAY", `${reference}.array([])`)}, size=${value(generator, block, "COUNT", "1")})`, Order.FUNCTION_CALL];
    });

    context.registerToolboxCategory({
      id: "visual-python.numpy.toolbox",
      name: "NumPy",
      colour: numpyColour,
      contents: [
        category("数组创建", [
          { kind: "block", type: "visual_python_numpy_import", fields: { ALIAS: "np" } },
          { kind: "block", type: "visual_python_numpy_array", inputs: { DATA: listShadow([1, 2, 3]) } },
          { kind: "block", type: "visual_python_numpy_zeros", inputs: { SHAPE: numberShadow(3) } },
          { kind: "block", type: "visual_python_numpy_ones", inputs: { SHAPE: numberShadow(3) } },
          { kind: "block", type: "visual_python_numpy_full", inputs: { VALUE: numberShadow(7), SHAPE: numberShadow(3) } },
          { kind: "block", type: "visual_python_numpy_arange", inputs: { START: numberShadow(0), STOP: numberShadow(10), STEP: numberShadow(1) } },
          { kind: "block", type: "visual_python_numpy_linspace", inputs: { START: numberShadow(0), STOP: numberShadow(1), COUNT: numberShadow(5) } },
        ]),
        category("数组属性与变形", [
          { kind: "block", type: "visual_python_numpy_shape", inputs: { ARRAY: arrayShadow([1, 2, 3]) } },
          { kind: "block", type: "visual_python_numpy_ndim", inputs: { ARRAY: arrayShadow([1, 2, 3]) } },
          { kind: "block", type: "visual_python_numpy_size", inputs: { ARRAY: arrayShadow([1, 2, 3]) } },
          { kind: "block", type: "visual_python_numpy_reshape", inputs: { ARRAY: arrayShadow([1, 2, 3, 4]), SHAPE: listShadow([2, 2]) } },
          { kind: "block", type: "visual_python_numpy_transpose", inputs: { ARRAY: arrayShadow([1, 2, 3]) } },
          { kind: "block", type: "visual_python_numpy_index", inputs: { ARRAY: arrayShadow([10, 20, 30]), INDEX: numberShadow(0) } },
          { kind: "block", type: "visual_python_numpy_flatten", inputs: { ARRAY: arrayShadow([1, 2, 3]) } },
          { kind: "block", type: "visual_python_numpy_ravel", inputs: { ARRAY: arrayShadow([1, 2, 3]) } },
          { kind: "block", type: "visual_python_numpy_squeeze", inputs: { ARRAY: arrayShadow([1, 2, 3]) } },
          { kind: "block", type: "visual_python_numpy_expand_dims", inputs: { ARRAY: arrayShadow([1, 2, 3]), AXIS: numberShadow(0) } },
          { kind: "block", type: "visual_python_numpy_sort", inputs: { ARRAY: arrayShadow([3, 1, 2]) } },
          { kind: "block", type: "visual_python_numpy_argsort", inputs: { ARRAY: arrayShadow([3, 1, 2]) } },
          { kind: "block", type: "visual_python_numpy_unique", inputs: { ARRAY: arrayShadow([1, 2, 1]) } },
        ]),
        category("计算", [
          { kind: "block", type: "visual_python_numpy_aggregate", fields: { FUNCTION: "mean" }, inputs: { ARRAY: arrayShadow([1, 2, 3]) } },
          { kind: "block", type: "visual_python_numpy_binary", fields: { OP: "add" }, inputs: { LEFT: arrayShadow([1, 2, 3]), RIGHT: arrayShadow([4, 5, 6]) } },
          { kind: "block", type: "visual_python_numpy_math", fields: { FUNCTION: "sqrt" }, inputs: { VALUE: numberShadow(9) } },
        ]),
        category("拼接与筛选", [
          { kind: "block", type: "visual_python_numpy_concatenate", fields: { AXIS: "0" }, inputs: { LEFT: arrayShadow([1, 2]), RIGHT: arrayShadow([3, 4]) } },
          { kind: "block", type: "visual_python_numpy_stack", fields: { AXIS: "0" }, inputs: { LEFT: arrayShadow([1, 2]), RIGHT: arrayShadow([3, 4]) } },
          { kind: "block", type: "visual_python_numpy_vstack", inputs: { LEFT: arrayShadow([1, 2]), RIGHT: arrayShadow([3, 4]) } },
          { kind: "block", type: "visual_python_numpy_hstack", inputs: { LEFT: arrayShadow([1, 2]), RIGHT: arrayShadow([3, 4]) } },
          { kind: "block", type: "visual_python_numpy_split", fields: { AXIS: "0" }, inputs: { ARRAY: arrayShadow([1, 2, 3, 4]), PARTS: numberShadow(2) } },
          { kind: "block", type: "visual_python_numpy_where", inputs: { CONDITION: { shadow: { type: "logic_boolean", fields: { BOOL: "TRUE" } } }, X: numberShadow(1), Y: numberShadow(0) } },
          { kind: "block", type: "visual_python_numpy_clip", inputs: { ARRAY: arrayShadow([-1, 2, 5]), MIN: numberShadow(0), MAX: numberShadow(3) } },
          { kind: "block", type: "visual_python_numpy_nonzero", inputs: { ARRAY: arrayShadow([0, 1, 0, 2]) } },
        ]),
        category("随机数", [
          { kind: "block", type: "visual_python_numpy_random_uniform", inputs: { SHAPE: numberShadow(3) } },
          { kind: "block", type: "visual_python_numpy_random_integer", inputs: { LOW: numberShadow(0), HIGH: numberShadow(10), SIZE: numberShadow(3) } },
          { kind: "block", type: "visual_python_numpy_random_normal", inputs: { SHAPE: numberShadow(3) } },
          { kind: "block", type: "visual_python_numpy_random_choice", inputs: { ARRAY: arrayShadow([1, 2, 3]), COUNT: numberShadow(1) } },
        ]),
      ],
    });
  },
};
