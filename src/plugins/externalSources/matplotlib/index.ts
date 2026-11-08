import * as Blockly from "blockly/core";
import { pythonGenerator, Order } from "blockly/python";
import { pythonIdentifierOrFallback } from "../../../pythonIdentifiers";
import { installFileBlockPickerFields } from "../../../fileBlockPicker";
import { PLUGIN_API_VERSION, type PluginBlockDefinition, type PluginContext, type VisualPythonPlugin } from "../../api/types";

const matplotlibColour = "#c45a4a";
const category = (name: string, contents: Array<Record<string, unknown>>) => ({ kind: "category", name, colour: matplotlibColour, contents });

const numberShadow = (value: number) => ({ shadow: { type: "math_number", fields: { NUM: value } } });
const textShadow = (value: string) => ({ shadow: { type: "text", fields: { TEXT: value } } });
const listShadow = (values: number[]) => ({
  block: {
    type: "python_list_collection",
    extraState: { itemCount: values.length },
    inputs: Object.fromEntries(values.map((value, index) => [`ITEM${index}`, numberShadow(value)])),
  },
});

const value = (generator: typeof pythonGenerator, block: Blockly.Block, name: string, fallback = "None") =>
  generator.valueToCode(block, name, Order.NONE) || fallback;

const validAlias = (input: unknown) => pythonIdentifierOrFallback(String(input || "").trim(), "plt");
const moduleName = (input: unknown) => String(input || "").trim();

function findMatplotlibAlias(workspace: Blockly.Workspace): string | null {
  let alias: string | null = null;
  for (const block of workspace.getAllBlocks(false)) {
    if (block.type === "visual_python_matplotlib_import") return validAlias(block.getFieldValue("ALIAS"));
    if (block.type === "python_import_as" && moduleName(block.getFieldValue("MODULE")) === "matplotlib.pyplot") {
      alias ??= validAlias(block.getFieldValue("ALIAS"));
    }
    if (block.type === "python_import" && moduleName(block.getFieldValue("MODULE")) === "matplotlib.pyplot") alias ??= "matplotlib.pyplot";
  }
  return alias;
}

const pyplotReference = (block: Blockly.Block, generator: typeof pythonGenerator) => {
  const existingAlias = findMatplotlibAlias(block.workspace);
  if (existingAlias) return existingAlias;
  const definitions = generator as typeof pythonGenerator & { definitions_: Record<string, string> };
  definitions.definitions_.import_matplotlib = "import matplotlib.pyplot as plt";
  return "plt";
};

const colourOptions = [["蓝色", "blue"], ["红色", "red"], ["绿色", "green"], ["橙色", "orange"], ["紫色", "purple"], ["黑色", "black"], ["灰色", "gray"]];
const lineStyleOptions = [["实线", "-"], ["虚线", "--"], ["点线", ":"], ["点划线", "-."]];
const markerOptions = [["无标记", ""], ["圆点", "o"], ["方形", "s"], ["三角形", "^"], ["星形", "*"]];

const blockDefinitions: PluginBlockDefinition[] = [
  { type: "visual_python_matplotlib_import", message0: "导入 Matplotlib，命名为 %1", args0: [{ type: "field_input", name: "ALIAS", text: "plt" }], previousStatement: null, nextStatement: null, colour: matplotlibColour, tooltip: "导入 matplotlib.pyplot。未放置此积木时，其他 Matplotlib 积木会自动导入。" },
  { type: "visual_python_matplotlib_figure", message0: "创建图形，宽 %1，高 %2", args0: [{ type: "input_value", name: "WIDTH" }, { type: "input_value", name: "HEIGHT" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_clear", message0: "清空当前图形", previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_plot", message0: "绘制折线图，横坐标 %1，纵坐标 %2", args0: [{ type: "input_value", name: "X" }, { type: "input_value", name: "Y" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_scatter", message0: "绘制散点图，横坐标 %1，纵坐标 %2", args0: [{ type: "input_value", name: "X" }, { type: "input_value", name: "Y" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_bar", message0: "绘制柱状图，项目 %1，高度 %2", args0: [{ type: "input_value", name: "X" }, { type: "input_value", name: "HEIGHT" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_barh", message0: "绘制横向柱状图，项目 %1，宽度 %2", args0: [{ type: "input_value", name: "Y" }, { type: "input_value", name: "WIDTH" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_pie", message0: "绘制饼图，数据 %1", args0: [{ type: "input_value", name: "DATA" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_hist", message0: "绘制直方图，数据 %1，分组数 %2", args0: [{ type: "input_value", name: "DATA" }, { type: "input_value", name: "BINS" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_boxplot", message0: "绘制箱线图，数据 %1", args0: [{ type: "input_value", name: "DATA" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_title", message0: "设置图形标题 %1", args0: [{ type: "input_value", name: "TITLE" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_xlabel", message0: "设置横轴名称 %1", args0: [{ type: "input_value", name: "LABEL" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_ylabel", message0: "设置纵轴名称 %1", args0: [{ type: "input_value", name: "LABEL" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_legend", message0: "显示图例", previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_grid", message0: "显示网格线", previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_xlim", message0: "设置横轴范围，从 %1 到 %2", args0: [{ type: "input_value", name: "MIN" }, { type: "input_value", name: "MAX" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_ylim", message0: "设置纵轴范围，从 %1 到 %2", args0: [{ type: "input_value", name: "MIN" }, { type: "input_value", name: "MAX" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_xticks", message0: "设置横轴刻度 %1", args0: [{ type: "input_value", name: "TICKS" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_yticks", message0: "设置纵轴刻度 %1", args0: [{ type: "input_value", name: "TICKS" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_line_color", message0: "设置最近一条曲线颜色为 %1", args0: [{ type: "field_dropdown", name: "COLOR", options: colourOptions }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_line_style", message0: "设置最近一条曲线线型为 %1", args0: [{ type: "field_dropdown", name: "STYLE", options: lineStyleOptions }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_line_width", message0: "设置最近一条曲线线宽为 %1", args0: [{ type: "input_value", name: "WIDTH" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_marker", message0: "设置最近一条曲线标记为 %1", args0: [{ type: "field_dropdown", name: "MARKER", options: markerOptions }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_alpha", message0: "设置最近一条曲线透明度为 %1", args0: [{ type: "input_value", name: "ALPHA" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_subplot", message0: "选择子图，第 %1 行第 %2 列的第 %3 个", args0: [{ type: "input_value", name: "ROWS" }, { type: "input_value", name: "COLUMNS" }, { type: "input_value", name: "INDEX" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_subplots_adjust", message0: "调整子图间距，横向 %1，纵向 %2", args0: [{ type: "input_value", name: "WIDTH" }, { type: "input_value", name: "HEIGHT" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_savefig", message0: "保存图形到 %1，分辨率 %2", args0: [{ type: "input_value", name: "PATH" }, { type: "input_value", name: "DPI" }], previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_show", message0: "显示图形", previousStatement: null, nextStatement: null, colour: matplotlibColour },
  { type: "visual_python_matplotlib_close", message0: "关闭图形", previousStatement: null, nextStatement: null, colour: matplotlibColour },
];

const registerGenerator = (context: PluginContext, type: string, generator: (block: Blockly.Block, activeGenerator: typeof pythonGenerator) => string) => {
  const definition = blockDefinitions.find((item) => item.type === type);
  if (!definition) throw new Error(`Matplotlib 积木定义不存在：${type}`);
  context.registerBlock(definition, generator);
};

const plotValue = (block: Blockly.Block, generator: typeof pythonGenerator, name: string, fallback: string) => value(generator, block, name, fallback);
const lastLine = (block: Blockly.Block, generator: typeof pythonGenerator) => `${pyplotReference(block, generator)}.gca().lines[-1]`;

export const matplotlibPlugin: VisualPythonPlugin = {
  manifest: {
    id: "visual-python.matplotlib",
    name: "Matplotlib",
    version: "1.0.0",
    apiVersion: PLUGIN_API_VERSION,
    description: "使用 Matplotlib 绘制和保存常见统计图、函数图像与数据图表。",
    python: { packages: ["matplotlib"] },
    agent: {
      description: "使用 Matplotlib 创建图形、绘制常见图表、配置坐标轴和样式，并显示或保存结果。",
      fileTypes: [".py", ".vpy"],
      detect: "imports",
    },
  },
  activate(context) {
    registerGenerator(context, "visual_python_matplotlib_import", (block) => `import matplotlib.pyplot as ${validAlias(block.getFieldValue("ALIAS"))}\n`);
    registerGenerator(context, "visual_python_matplotlib_figure", (block, generator) => `${pyplotReference(block, generator)}.figure(figsize=(${plotValue(block, generator, "WIDTH", "8")}, ${plotValue(block, generator, "HEIGHT", "6")}))\n`);
    registerGenerator(context, "visual_python_matplotlib_clear", (block, generator) => `${pyplotReference(block, generator)}.clf()\n`);
    registerGenerator(context, "visual_python_matplotlib_plot", (block, generator) => `${pyplotReference(block, generator)}.plot(${plotValue(block, generator, "X", "[1, 2, 3]")}, ${plotValue(block, generator, "Y", "[1, 4, 9]")})\n`);
    registerGenerator(context, "visual_python_matplotlib_scatter", (block, generator) => `${pyplotReference(block, generator)}.scatter(${plotValue(block, generator, "X", "[1, 2, 3]")}, ${plotValue(block, generator, "Y", "[1, 4, 9]")})\n`);
    registerGenerator(context, "visual_python_matplotlib_bar", (block, generator) => `${pyplotReference(block, generator)}.bar(${plotValue(block, generator, "X", "[1, 2, 3]")}, ${plotValue(block, generator, "HEIGHT", "[3, 5, 2]")})\n`);
    registerGenerator(context, "visual_python_matplotlib_barh", (block, generator) => `${pyplotReference(block, generator)}.barh(${plotValue(block, generator, "Y", "[1, 2, 3]")}, ${plotValue(block, generator, "WIDTH", "[3, 5, 2]")})\n`);
    registerGenerator(context, "visual_python_matplotlib_pie", (block, generator) => `${pyplotReference(block, generator)}.pie(${plotValue(block, generator, "DATA", "[30, 40, 30]")})\n`);
    registerGenerator(context, "visual_python_matplotlib_hist", (block, generator) => `${pyplotReference(block, generator)}.hist(${plotValue(block, generator, "DATA", "[1, 2, 2, 3, 3, 3]")}, bins=int(${plotValue(block, generator, "BINS", "5")}))\n`);
    registerGenerator(context, "visual_python_matplotlib_boxplot", (block, generator) => `${pyplotReference(block, generator)}.boxplot(${plotValue(block, generator, "DATA", "[1, 2, 3, 4, 5]")})\n`);
    registerGenerator(context, "visual_python_matplotlib_title", (block, generator) => `${pyplotReference(block, generator)}.title(${plotValue(block, generator, "TITLE", "'图形标题'")})\n`);
    registerGenerator(context, "visual_python_matplotlib_xlabel", (block, generator) => `${pyplotReference(block, generator)}.xlabel(${plotValue(block, generator, "LABEL", "'横轴'")})\n`);
    registerGenerator(context, "visual_python_matplotlib_ylabel", (block, generator) => `${pyplotReference(block, generator)}.ylabel(${plotValue(block, generator, "LABEL", "'纵轴'")})\n`);
    registerGenerator(context, "visual_python_matplotlib_legend", (block, generator) => `${pyplotReference(block, generator)}.legend()\n`);
    registerGenerator(context, "visual_python_matplotlib_grid", (block, generator) => `${pyplotReference(block, generator)}.grid(True)\n`);
    registerGenerator(context, "visual_python_matplotlib_xlim", (block, generator) => `${pyplotReference(block, generator)}.xlim(${plotValue(block, generator, "MIN", "0")}, ${plotValue(block, generator, "MAX", "10")})\n`);
    registerGenerator(context, "visual_python_matplotlib_ylim", (block, generator) => `${pyplotReference(block, generator)}.ylim(${plotValue(block, generator, "MIN", "0")}, ${plotValue(block, generator, "MAX", "10")})\n`);
    registerGenerator(context, "visual_python_matplotlib_xticks", (block, generator) => `${pyplotReference(block, generator)}.xticks(${plotValue(block, generator, "TICKS", "[0, 1, 2, 3]")})\n`);
    registerGenerator(context, "visual_python_matplotlib_yticks", (block, generator) => `${pyplotReference(block, generator)}.yticks(${plotValue(block, generator, "TICKS", "[0, 1, 2, 3]")})\n`);
    registerGenerator(context, "visual_python_matplotlib_line_color", (block, generator) => `${pyplotReference(block, generator)}.setp(${lastLine(block, generator)}, color=${JSON.stringify(block.getFieldValue("COLOR") || "blue")})\n`);
    registerGenerator(context, "visual_python_matplotlib_line_style", (block, generator) => `${pyplotReference(block, generator)}.setp(${lastLine(block, generator)}, linestyle=${JSON.stringify(block.getFieldValue("STYLE") || "-")})\n`);
    registerGenerator(context, "visual_python_matplotlib_line_width", (block, generator) => `${pyplotReference(block, generator)}.setp(${lastLine(block, generator)}, linewidth=${plotValue(block, generator, "WIDTH", "2")})\n`);
    registerGenerator(context, "visual_python_matplotlib_marker", (block, generator) => `${pyplotReference(block, generator)}.setp(${lastLine(block, generator)}, marker=${block.getFieldValue("MARKER") ? JSON.stringify(block.getFieldValue("MARKER")) : "None"})\n`);
    registerGenerator(context, "visual_python_matplotlib_alpha", (block, generator) => `${pyplotReference(block, generator)}.setp(${lastLine(block, generator)}, alpha=${plotValue(block, generator, "ALPHA", "1")})\n`);
    registerGenerator(context, "visual_python_matplotlib_subplot", (block, generator) => `${pyplotReference(block, generator)}.subplot(${plotValue(block, generator, "ROWS", "1")}, ${plotValue(block, generator, "COLUMNS", "1")}, ${plotValue(block, generator, "INDEX", "1")})\n`);
    registerGenerator(context, "visual_python_matplotlib_subplots_adjust", (block, generator) => `${pyplotReference(block, generator)}.subplots_adjust(wspace=${plotValue(block, generator, "WIDTH", "0.3")}, hspace=${plotValue(block, generator, "HEIGHT", "0.3")})\n`);
    registerGenerator(context, "visual_python_matplotlib_savefig", (block, generator) => `${pyplotReference(block, generator)}.savefig(${plotValue(block, generator, "PATH", "'图形.png'")}, dpi=int(${plotValue(block, generator, "DPI", "150")}))\n`);
    registerGenerator(context, "visual_python_matplotlib_show", (block, generator) => `${pyplotReference(block, generator)}.show()\n`);
    registerGenerator(context, "visual_python_matplotlib_close", (block, generator) => `${pyplotReference(block, generator)}.close()\n`);
    installFileBlockPickerFields();

    const blocks = (types: string[], defaults: Record<string, Record<string, unknown>> = {}) => types.map((type) => ({ kind: "block", type, ...(defaults[type] || {}) }));
    context.registerToolboxCategory({
      id: "visual-python.matplotlib.toolbox",
      name: "Matplotlib",
      colour: matplotlibColour,
      contents: [
        category("导入与画布", blocks(["visual_python_matplotlib_import", "visual_python_matplotlib_figure", "visual_python_matplotlib_clear"], {
          visual_python_matplotlib_import: { fields: { ALIAS: "plt" } },
          visual_python_matplotlib_figure: { inputs: { WIDTH: numberShadow(8), HEIGHT: numberShadow(6) } },
        })),
        category("基础绘图", blocks(["visual_python_matplotlib_plot", "visual_python_matplotlib_scatter", "visual_python_matplotlib_bar", "visual_python_matplotlib_barh", "visual_python_matplotlib_pie", "visual_python_matplotlib_hist", "visual_python_matplotlib_boxplot"], {
          visual_python_matplotlib_plot: { inputs: { X: listShadow([1, 2, 3]), Y: listShadow([1, 4, 9]) } },
          visual_python_matplotlib_scatter: { inputs: { X: listShadow([1, 2, 3]), Y: listShadow([1, 4, 9]) } },
          visual_python_matplotlib_bar: { inputs: { X: listShadow([1, 2, 3]), HEIGHT: listShadow([3, 5, 2]) } },
          visual_python_matplotlib_barh: { inputs: { Y: listShadow([1, 2, 3]), WIDTH: listShadow([3, 5, 2]) } },
          visual_python_matplotlib_pie: { inputs: { DATA: listShadow([30, 40, 30]) } },
          visual_python_matplotlib_hist: { inputs: { DATA: listShadow([1, 2, 2, 3, 3, 3]), BINS: numberShadow(5) } },
          visual_python_matplotlib_boxplot: { inputs: { DATA: listShadow([1, 2, 3, 4, 5]) } },
        })),
        category("图形配置", blocks(["visual_python_matplotlib_title", "visual_python_matplotlib_xlabel", "visual_python_matplotlib_ylabel", "visual_python_matplotlib_legend", "visual_python_matplotlib_grid"], {
          visual_python_matplotlib_title: { inputs: { TITLE: textShadow("数据图表") } },
          visual_python_matplotlib_xlabel: { inputs: { LABEL: textShadow("横轴") } },
          visual_python_matplotlib_ylabel: { inputs: { LABEL: textShadow("纵轴") } },
        })),
        category("坐标轴", blocks(["visual_python_matplotlib_xlim", "visual_python_matplotlib_ylim", "visual_python_matplotlib_xticks", "visual_python_matplotlib_yticks"], {
          visual_python_matplotlib_xlim: { inputs: { MIN: numberShadow(0), MAX: numberShadow(10) } },
          visual_python_matplotlib_ylim: { inputs: { MIN: numberShadow(0), MAX: numberShadow(10) } },
          visual_python_matplotlib_xticks: { inputs: { TICKS: listShadow([0, 1, 2, 3]) } },
          visual_python_matplotlib_yticks: { inputs: { TICKS: listShadow([0, 1, 2, 3]) } },
        })),
        category("曲线样式", blocks(["visual_python_matplotlib_line_color", "visual_python_matplotlib_line_style", "visual_python_matplotlib_line_width", "visual_python_matplotlib_marker", "visual_python_matplotlib_alpha"], {
          visual_python_matplotlib_line_width: { inputs: { WIDTH: numberShadow(2) } },
          visual_python_matplotlib_alpha: { inputs: { ALPHA: numberShadow(1) } },
        })),
        category("多图布局", blocks(["visual_python_matplotlib_subplot", "visual_python_matplotlib_subplots_adjust"], {
          visual_python_matplotlib_subplot: { inputs: { ROWS: numberShadow(1), COLUMNS: numberShadow(1), INDEX: numberShadow(1) } },
          visual_python_matplotlib_subplots_adjust: { inputs: { WIDTH: numberShadow(0.3), HEIGHT: numberShadow(0.3) } },
        })),
        category("输出与保存", blocks(["visual_python_matplotlib_savefig", "visual_python_matplotlib_show", "visual_python_matplotlib_close"], {
          visual_python_matplotlib_savefig: { inputs: { PATH: textShadow("图形.png"), DPI: numberShadow(150) } },
        })),
      ],
    });
  },
};
