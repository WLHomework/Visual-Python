import * as Blockly from "blockly/core";
import { pythonGenerator, Order } from "blockly/python";
import { pythonIdentifierOrFallback } from "../../../pythonIdentifiers";
import { installFileBlockPickerFields } from "../../../fileBlockPicker";
import { PLUGIN_API_VERSION, type PluginBlockDefinition, type PluginContext, type VisualPythonPlugin } from "../../api/types";

const pandasColour = "#4c8b6b";
const dataframeOutput = "PandasDataFrame";
const seriesOutput = "PandasSeries";
const indexOutput = "PandasIndex";
const category = (name: string, contents: Array<Record<string, unknown>>) => ({ kind: "category", name, colour: pandasColour, contents });

const numberShadow = (value: number) => ({ shadow: { type: "math_number", fields: { NUM: value } } });
const textShadow = (value: string) => ({ shadow: { type: "text", fields: { TEXT: value } } });
const expressionShadow = (code: string) => ({ shadow: { type: "python_raw_expression", fields: { CODE: code } } });
const listShadow = (values: number[]) => ({
  block: {
    type: "python_list_collection",
    extraState: { itemCount: values.length },
    inputs: Object.fromEntries(values.map((value, index) => [`ITEM${index}`, numberShadow(value)])),
  },
});
const dictionaryBlock = (entries: Array<[string, string]>) => ({
  block: {
    type: "python_dynamic_dict",
    extraState: { itemCount: entries.length },
    inputs: Object.fromEntries(entries.flatMap(([key, value], index) => [
      [`KEY${index}`, textShadow(key)],
      [`VALUE${index}`, expressionShadow(value)],
    ])),
  },
});

const value = (generator: typeof pythonGenerator, block: Blockly.Block, name: string, fallback = "None") =>
  generator.valueToCode(block, name, Order.NONE) || fallback;

const excelEngineForStaticPath = (block: Blockly.Block): "xlrd" | "openpyxl" | null => {
  const pathBlock = block.getInputTargetBlock("PATH");
  if (pathBlock?.type !== "text") return null;
  const path = String(pathBlock.getFieldValue("TEXT") || "").trim().toLowerCase();
  if (path.endsWith(".xls")) return "xlrd";
  if ([".xlsx", ".xlsm", ".xltx", ".xltm"].some((extension) => path.endsWith(extension))) return "openpyxl";
  return null;
};

const validAlias = (input: unknown) => pythonIdentifierOrFallback(String(input || "").trim(), "pd");
const rootModule = (input: unknown) => String(input || "").trim().split(".", 1)[0];

function findPandasAlias(workspace: Blockly.Workspace): string | null {
  let alias: string | null = null;
  for (const block of workspace.getAllBlocks(false)) {
    if (block.type === "visual_python_pandas_import") return validAlias(block.getFieldValue("ALIAS"));
    if (block.type === "python_import_as" && rootModule(block.getFieldValue("MODULE")) === "pandas") {
      alias ??= validAlias(block.getFieldValue("ALIAS"));
    }
    if (block.type === "python_import" && rootModule(block.getFieldValue("MODULE")) === "pandas") alias ??= "pandas";
  }
  return alias;
}

const pandasReference = (block: Blockly.Block, generator: typeof pythonGenerator) => {
  const existingAlias = findPandasAlias(block.workspace);
  if (existingAlias) return existingAlias;
  const definitions = generator as typeof pythonGenerator & { definitions_: Record<string, string> };
  definitions.definitions_.import_pandas = "import pandas as pd";
  return "pd";
};

const dataframeValue = (block: Blockly.Block, generator: typeof pythonGenerator) =>
  value(generator, block, "DATAFRAME", `${pandasReference(block, generator)}.DataFrame()`);

const blockDefinitions: PluginBlockDefinition[] = [
  { type: "visual_python_pandas_import", message0: "导入 Pandas，命名为 %1", args0: [{ type: "field_input", name: "ALIAS", text: "pd" }], previousStatement: null, nextStatement: null, colour: pandasColour, tooltip: "导入 Pandas。未放置此积木时，其他 Pandas 积木会自动生成 import pandas as pd。" },
  { type: "visual_python_pandas_series", message0: "创建 Series，数据 %1，名称 %2", args0: [{ type: "input_value", name: "DATA" }, { type: "input_value", name: "NAME" }], output: seriesOutput, colour: pandasColour },
  { type: "visual_python_pandas_dataframe", message0: "创建 DataFrame，数据 %1", args0: [{ type: "input_value", name: "DATA" }], output: dataframeOutput, colour: pandasColour, tooltip: "从列表、字典或其他数据创建表格。" },
  { type: "visual_python_pandas_read_csv", message0: "读取 CSV 文件 %1", args0: [{ type: "input_value", name: "PATH" }], output: dataframeOutput, colour: pandasColour },
  { type: "visual_python_pandas_to_csv", message0: "将表格 %1 保存为 CSV 文件 %2，不保存行号 %3", args0: [{ type: "input_value", name: "DATAFRAME" }, { type: "input_value", name: "PATH" }, { type: "field_checkbox", name: "INDEX", checked: false }], previousStatement: null, nextStatement: null, colour: pandasColour },
  { type: "visual_python_pandas_read_excel", message0: "读取 Excel 文件 %1", args0: [{ type: "input_value", name: "PATH" }], output: dataframeOutput, colour: pandasColour },
  { type: "visual_python_pandas_to_excel", message0: "将表格 %1 保存为 Excel 文件 %2，不保存行号 %3", args0: [{ type: "input_value", name: "DATAFRAME" }, { type: "input_value", name: "PATH" }, { type: "field_checkbox", name: "INDEX", checked: false }], previousStatement: null, nextStatement: null, colour: pandasColour },
  { type: "visual_python_pandas_head", message0: "查看表格 %1 的前 %2 行", args0: [{ type: "input_value", name: "DATAFRAME", check: dataframeOutput }, { type: "input_value", name: "COUNT" }], output: dataframeOutput, colour: pandasColour },
  { type: "visual_python_pandas_tail", message0: "查看表格 %1 的后 %2 行", args0: [{ type: "input_value", name: "DATAFRAME", check: dataframeOutput }, { type: "input_value", name: "COUNT" }], output: dataframeOutput, colour: pandasColour },
  { type: "visual_python_pandas_shape", message0: "读取表格 %1 的形状", args0: [{ type: "input_value", name: "DATAFRAME", check: dataframeOutput }], output: "PythonTuple", colour: pandasColour },
  { type: "visual_python_pandas_columns", message0: "读取表格 %1 的列名", args0: [{ type: "input_value", name: "DATAFRAME", check: dataframeOutput }], output: indexOutput, colour: pandasColour },
  { type: "visual_python_pandas_describe", message0: "统计表格 %1 的数值信息", args0: [{ type: "input_value", name: "DATAFRAME", check: dataframeOutput }], output: dataframeOutput, colour: pandasColour },
  { type: "visual_python_pandas_row_count", message0: "读取表格 %1 的行数", args0: [{ type: "input_value", name: "DATAFRAME", check: dataframeOutput }], output: "Number", colour: pandasColour },
  { type: "visual_python_pandas_get_column", message0: "从表格 %1 读取列 %2", args0: [{ type: "input_value", name: "DATAFRAME", check: dataframeOutput }, { type: "input_value", name: "COLUMN" }], output: seriesOutput, colour: pandasColour },
  { type: "visual_python_pandas_set_column", message0: "将表格 %1 的列 %2 设置为 %3", args0: [{ type: "input_value", name: "DATAFRAME", check: dataframeOutput }, { type: "input_value", name: "COLUMN" }, { type: "input_value", name: "VALUE" }], previousStatement: null, nextStatement: null, colour: pandasColour },
  { type: "visual_python_pandas_filter", message0: "筛选表格 %1，条件 %2", args0: [{ type: "input_value", name: "DATAFRAME", check: dataframeOutput }, { type: "input_value", name: "CONDITION" }], output: dataframeOutput, colour: pandasColour, tooltip: "条件可以使用布尔表达式，例如：数据['分数'] >= 60。" },
  { type: "visual_python_pandas_sort_values", message0: "按列 %2 对表格 %1 排序，顺序 %3", args0: [{ type: "input_value", name: "DATAFRAME", check: dataframeOutput }, { type: "input_value", name: "COLUMN" }, { type: "field_dropdown", name: "ORDER", options: [["升序", "True"], ["降序", "False"]] }], output: dataframeOutput, colour: pandasColour },
];

const registerGenerator = (context: PluginContext, type: string, generator: (block: Blockly.Block, activeGenerator: typeof pythonGenerator) => string | [string, number]) => {
  const definition = blockDefinitions.find((item) => item.type === type);
  if (!definition) throw new Error(`Pandas 积木定义不存在：${type}`);
  context.registerBlock(definition, generator);
};

const dataframeShadow = () => ({ block: { type: "visual_python_pandas_dataframe", inputs: { DATA: dictionaryBlock([["姓名", "['小明', '小红']"], ["分数", "[95, 82]"]]) } } });

export const pandasPlugin: VisualPythonPlugin = {
  manifest: {
    id: "visual-python.pandas",
    name: "Pandas",
    version: "1.0.0",
    apiVersion: PLUGIN_API_VERSION,
    description: "使用 Pandas 创建、读取、查看、筛选、排序和导出表格数据。",
    builtin: true,
    python: { packages: ["pandas", "openpyxl", "xlrd"] },
    agent: {
      description: "使用 Pandas 进行表格数据创建、读取、查看、筛选、排序、统计和 CSV 导出。",
      fileTypes: [".py", ".vpy"],
      detect: "imports",
    },
  },
  activate(context) {
    registerGenerator(context, "visual_python_pandas_import", (block) => `import pandas as ${validAlias(block.getFieldValue("ALIAS"))}\n`);
    registerGenerator(context, "visual_python_pandas_series", (block, generator) => { const reference = pandasReference(block, generator); return [`${reference}.Series(${value(generator, block, "DATA", "[]")}, name=${value(generator, block, "NAME", "None")})`, Order.FUNCTION_CALL]; });
    registerGenerator(context, "visual_python_pandas_dataframe", (block, generator) => { const reference = pandasReference(block, generator); return [`${reference}.DataFrame(${value(generator, block, "DATA", "{}")})`, Order.FUNCTION_CALL]; });
    registerGenerator(context, "visual_python_pandas_read_csv", (block, generator) => { const reference = pandasReference(block, generator); return [`${reference}.read_csv(${value(generator, block, "PATH", "'data.csv'")})`, Order.FUNCTION_CALL]; });
    registerGenerator(context, "visual_python_pandas_to_csv", (block, generator) => `${dataframeValue(block, generator)}.to_csv(${value(generator, block, "PATH", "'data.csv'")}, index=${block.getFieldValue("INDEX") === "TRUE" ? "True" : "False"})\n`);
    registerGenerator(context, "visual_python_pandas_read_excel", (block, generator) => {
      const reference = pandasReference(block, generator);
      const path = value(generator, block, "PATH", "'data.xlsx'");
      const engine = excelEngineForStaticPath(block);
      return [`${reference}.read_excel(${path}${engine ? `, engine=\"${engine}\"` : ""})`, Order.FUNCTION_CALL];
    });
    registerGenerator(context, "visual_python_pandas_to_excel", (block, generator) => `${dataframeValue(block, generator)}.to_excel(${value(generator, block, "PATH", "'output.xlsx'")}, index=${block.getFieldValue("INDEX") === "TRUE" ? "True" : "False"})\n`);
    registerGenerator(context, "visual_python_pandas_head", (block, generator) => [`${dataframeValue(block, generator)}.head(${value(generator, block, "COUNT", "5")})`, Order.FUNCTION_CALL]);
    registerGenerator(context, "visual_python_pandas_tail", (block, generator) => [`${dataframeValue(block, generator)}.tail(${value(generator, block, "COUNT", "5")})`, Order.FUNCTION_CALL]);
    registerGenerator(context, "visual_python_pandas_shape", (block, generator) => [`${dataframeValue(block, generator)}.shape`, Order.MEMBER]);
    registerGenerator(context, "visual_python_pandas_columns", (block, generator) => [`${dataframeValue(block, generator)}.columns`, Order.MEMBER]);
    registerGenerator(context, "visual_python_pandas_describe", (block, generator) => [`${dataframeValue(block, generator)}.describe()`, Order.FUNCTION_CALL]);
    registerGenerator(context, "visual_python_pandas_row_count", (block, generator) => [`len(${dataframeValue(block, generator)})`, Order.FUNCTION_CALL]);
    registerGenerator(context, "visual_python_pandas_get_column", (block, generator) => [`${dataframeValue(block, generator)}[${value(generator, block, "COLUMN", "'列名'")}]`, Order.MEMBER]);
    registerGenerator(context, "visual_python_pandas_set_column", (block, generator) => `${dataframeValue(block, generator)}[${value(generator, block, "COLUMN", "'新列'")}] = ${value(generator, block, "VALUE", "None")}\n`);
    registerGenerator(context, "visual_python_pandas_filter", (block, generator) => [`${dataframeValue(block, generator)}[${value(generator, block, "CONDITION", "True")}]`, Order.MEMBER]);
    registerGenerator(context, "visual_python_pandas_sort_values", (block, generator) => [`${dataframeValue(block, generator)}.sort_values(by=${value(generator, block, "COLUMN", "'列名'")}, ascending=${block.getFieldValue("ORDER") || "True"})`, Order.FUNCTION_CALL]);
    installFileBlockPickerFields();

    context.registerToolboxCategory({
      id: "visual-python.pandas.toolbox",
      name: "Pandas",
      colour: pandasColour,
      contents: [
        category("创建与读取", [
          { kind: "block", type: "visual_python_pandas_import", fields: { ALIAS: "pd" } },
          { kind: "block", type: "visual_python_pandas_series", inputs: { DATA: listShadow([90, 85, 92]), NAME: textShadow("分数") } },
          { kind: "block", type: "visual_python_pandas_dataframe", inputs: { DATA: dictionaryBlock([["姓名", "['小明', '小红']"], ["分数", "[95, 82]"]]) } },
          { kind: "block", type: "visual_python_pandas_read_csv", inputs: { PATH: textShadow("data.csv") } },
          { kind: "block", type: "visual_python_pandas_to_csv", inputs: { DATAFRAME: dataframeShadow(), PATH: textShadow("output.csv") }, fields: { INDEX: "FALSE" } },
          { kind: "block", type: "visual_python_pandas_read_excel", inputs: { PATH: textShadow("data.xlsx") } },
          { kind: "block", type: "visual_python_pandas_to_excel", inputs: { DATAFRAME: dataframeShadow(), PATH: textShadow("output.xlsx") }, fields: { INDEX: "FALSE" } },
        ]),
        category("查看数据", [
          { kind: "block", type: "visual_python_pandas_head", inputs: { DATAFRAME: dataframeShadow(), COUNT: numberShadow(5) } },
          { kind: "block", type: "visual_python_pandas_tail", inputs: { DATAFRAME: dataframeShadow(), COUNT: numberShadow(5) } },
          { kind: "block", type: "visual_python_pandas_shape", inputs: { DATAFRAME: dataframeShadow() } },
          { kind: "block", type: "visual_python_pandas_columns", inputs: { DATAFRAME: dataframeShadow() } },
          { kind: "block", type: "visual_python_pandas_describe", inputs: { DATAFRAME: dataframeShadow() } },
          { kind: "block", type: "visual_python_pandas_row_count", inputs: { DATAFRAME: dataframeShadow() } },
        ]),
        category("选择与整理", [
          { kind: "block", type: "visual_python_pandas_get_column", inputs: { DATAFRAME: dataframeShadow(), COLUMN: textShadow("分数") } },
          { kind: "block", type: "visual_python_pandas_set_column", inputs: { DATAFRAME: dataframeShadow(), COLUMN: textShadow("等级"), VALUE: textShadow("合格") } },
          { kind: "block", type: "visual_python_pandas_filter", inputs: { DATAFRAME: dataframeShadow(), CONDITION: expressionShadow("数据['分数'] >= 60") } },
          { kind: "block", type: "visual_python_pandas_sort_values", fields: { ORDER: "True" }, inputs: { DATAFRAME: dataframeShadow(), COLUMN: textShadow("分数") } },
        ]),
      ],
    });
  },
};
