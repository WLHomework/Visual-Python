import * as Blockly from "blockly/core";
import "blockly/blocks";
import * as ZhHans from "blockly/msg/zh-hans";
import { pythonGenerator } from "blockly/python";
import { Order } from "blockly/python";
import { localizeBlockDefinitions } from "./blockDisplayLocalization";
import { installFileBlockPickerFields } from "./fileBlockPicker";
import { isPythonAnnotation, isPythonIdentifier, normalizePythonIdentifier, pythonIdentifierOrFallback, sanitizePythonIdentifier } from "./pythonIdentifiers";
import { pythonSyntaxToolbox, registerPythonSyntaxBlocks, standardLibraryCall } from "./pythonSyntaxBlocks";

const locale = Object.fromEntries(
  Object.entries(ZhHans).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
);
locale.LOGIC_BOOLEAN_TRUE = "真";
locale.LOGIC_BOOLEAN_FALSE = "假";
Blockly.setLocale(locale);

// Blockly's default name database percent-encodes every non-ASCII character.
// Python 3 accepts Unicode identifiers, so preserve them for generated variables.
(Blockly.Names.prototype as unknown as { safeName(name: string): string }).safeName = (name: string) =>
  sanitizePythonIdentifier(name, "unnamed", "variable_");

const blockStyles = {
  logic_blocks: { colourPrimary: "#5968b0", colourSecondary: "#4d5b9d", colourTertiary: "#3f4c89" },
  loop_blocks: { colourPrimary: "#4b9b62", colourSecondary: "#408b55", colourTertiary: "#357747" },
  math_blocks: { colourPrimary: "#4f72b8", colourSecondary: "#4363a5", colourTertiary: "#36538f" },
  text_blocks: { colourPrimary: "#2f9e8f", colourSecondary: "#288e80", colourTertiary: "#207a6f" },
  list_blocks: { colourPrimary: "#7657b5", colourSecondary: "#684aa5", colourTertiary: "#593d91" },
  variable_blocks: { colourPrimary: "#b95073", colourSecondary: "#a44163", colourTertiary: "#8e3654" },
  variable_dynamic_blocks: { colourPrimary: "#b95073", colourSecondary: "#a44163", colourTertiary: "#8e3654" },
  procedure_blocks: { colourPrimary: "#8762b8", colourSecondary: "#7652a6", colourTertiary: "#644391" },
};

const createVisualTheme = (name: string, workspace: string, toolbox: string, foreground: string, flyout: string, scrollbar: string) => Blockly.Theme.defineTheme(name, {
  name,
  base: Blockly.Themes.Classic,
  blockStyles,
  componentStyles: {
    workspaceBackgroundColour: workspace,
    toolboxBackgroundColour: toolbox,
    toolboxForegroundColour: foreground,
    flyoutBackgroundColour: flyout,
    flyoutForegroundColour: foreground,
    flyoutOpacity: 1,
    scrollbarColour: scrollbar,
    scrollbarOpacity: 0.75,
    insertionMarkerColour: "#2f9e8f",
    insertionMarkerOpacity: 0.35,
    cursorColour: "#2f9e8f",
  },
});

export type VisualThemeId = "visual-dark" | "visual-light" | "one-dark" | "high-contrast";
export const defaultVisualThemeId: VisualThemeId = "visual-light";
export const visualPythonThemes: Record<VisualThemeId, Blockly.Theme> = {
  "visual-dark": createVisualTheme("visualDark", "#181c22", "#20252d", "#c3cad4", "#252b34", "#596471"),
  "visual-light": createVisualTheme("visualLight", "#f7f8fa", "#eef1f5", "#344054", "#ffffff", "#aab2bd"),
  "one-dark": createVisualTheme("oneDark", "#282c34", "#21252b", "#abb2bf", "#2c313a", "#596273"),
  "high-contrast": createVisualTheme("highContrast", "#000000", "#0b0b0b", "#ffffff", "#111111", "#ffffff"),
};

export const visualPythonTheme = visualPythonThemes[defaultVisualThemeId];

const colours = {
  inputOutput: "#2f9e8f",
  loop: "#4b9b62",
  collection: "#7657b5",
  function: "#8762b8",
  call: "#397bc0",
  object: "#a64ca6",
  exception: "#b95050",
  module: "#c58b32",
  file: "#4f7f8e",
} as const;
const scheduleAnimationFrame = (callback: FrameRequestCallback): number =>
  typeof globalThis.requestAnimationFrame === "function"
    ? globalThis.requestAnimationFrame(callback)
    : globalThis.setTimeout(() => callback(performance.now()), 0);

const expressionColour = colours.call;
const collectionColour = colours.collection;
const objectColour = colours.object;
const statementColour = colours.exception;

function keepMutatorBubbleInView(icon: ThemedMutatorIcon) {
  const bubble = icon.getBubble() as unknown as {
    anchor: { x: number; y: number };
    getSize: () => { width: number; height: number };
    getRelativeToSurfaceXY: () => { x: number; y: number };
    setPositionRelativeToAnchor: (left: number, top: number) => void;
  } | null;
  if (!bubble) return;

  const workspace = icon.getSourceBlock().workspace as Blockly.WorkspaceSvg;
  const view = workspace.getMetricsManager().getViewMetrics(true);
  const size = bubble.getSize();
  const position = bubble.getRelativeToSurfaceXY();
  const margin = 8;
  const minX = view.left + margin;
  const minY = view.top + margin;
  const maxX = Math.max(minX, view.left + view.width - size.width - margin);
  const maxY = Math.max(minY, view.top + view.height - size.height - margin);
  const x = Math.min(Math.max(position.x, minX), maxX);
  const y = Math.min(Math.max(position.y, minY), maxY);
  if (x === position.x && y === position.y) return;

  const left = workspace.RTL ? bubble.anchor.x - x - size.width : x - bubble.anchor.x;
  bubble.setPositionRelativeToAnchor(left, y - bubble.anchor.y);
}

registerPythonSyntaxBlocks({
  variable: blockStyles.variable_blocks.colourPrimary,
  text: blockStyles.text_blocks.colourPrimary,
  function: colours.function,
  logic: blockStyles.logic_blocks.colourPrimary,
  loop: colours.loop,
  exception: colours.exception,
  module: colours.module,
  call: colours.call,
  collection: colours.collection,
  file: colours.file,
});

class ThemedMutatorIcon extends Blockly.icons.MutatorIcon {
  constructor(flyoutBlockTypes: string[], sourceBlock: Blockly.BlockSvg) {
    super(flyoutBlockTypes, sourceBlock);
    const icon = this as unknown as { getMiniWorkspaceConfig: () => Record<string, unknown> };
    const getBaseConfig = icon.getMiniWorkspaceConfig.bind(this);
    icon.getMiniWorkspaceConfig = () => ({ ...getBaseConfig(), theme: sourceBlock.workspace.getTheme() });
  }

  override initView(pointerdownListener: (event: PointerEvent) => void) {
    super.initView(pointerdownListener);
    this.getFocusableElement().addEventListener("pointerdown", (event) => {
      if (!this.bubbleIsVisible()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void super.setBubbleVisible(false);
    }, { capture: true });
  }

  override async setBubbleVisible(visible: boolean) {
    if (!visible) {
      await super.setBubbleVisible(false);
      return;
    }
    const bubbleCanvas = this.sourceBlock.workspace.getBubbleCanvas();
    bubbleCanvas.classList.add("visual-python-mutator-opening");
    try {
      await super.setBubbleVisible(true);
      await Blockly.renderManagement.finishQueuedRenders();
      await new Promise<void>((resolve) => scheduleAnimationFrame(() => scheduleAnimationFrame(() => resolve())));
      keepMutatorBubbleInView(this);
    } finally {
      bubbleCanvas.classList.remove("visual-python-mutator-opening");
    }
  }
}

const createMutatorIcon = (blockTypes: string[], block: Blockly.BlockSvg) => new ThemedMutatorIcon(blockTypes, block);

Blockly.common.defineBlocksWithJsonArray(localizeBlockDefinitions([
  { type: "python_print", message0: "打印 %1", args0: [{ type: "input_value", name: "VALUE" }], previousStatement: null, nextStatement: null, colour: colours.inputOutput, tooltip: "在输出面板显示文本、数字或其他值。" },
  { type: "python_input", message0: "询问 %1 并等待输入", args0: [{ type: "input_value", name: "PROMPT", check: "String" }], output: null, colour: colours.inputOutput, tooltip: "显示提示文字并返回用户输入的文本。" },
  { type: "python_input_assign", message0: "询问 %2 并保存到 %1", args0: [{ type: "field_variable", name: "VAR", variable: "回答" }, { type: "input_value", name: "PROMPT", check: "String" }], previousStatement: null, nextStatement: null, colour: colours.inputOutput, tooltip: "显示提示文字，并把用户输入保存到所选变量。" },
  { type: "python_input_typed_assign", message0: "询问 %2 转换为 %3 并保存到 %1", args0: [{ type: "field_variable", name: "VAR", variable: "回答" }, { type: "input_value", name: "PROMPT", check: "String" }, { type: "field_dropdown", name: "TYPE", options: [["整数", "int"], ["小数", "float"], ["文本", "str"]] }], previousStatement: null, nextStatement: null, colour: colours.inputOutput, tooltip: "读取用户输入后立即转换为整数、小数或文本，并保存到变量。" },
  { type: "python_import", message0: "导入模块 %1", args0: [{ type: "field_input", name: "MODULE", text: "math" }], previousStatement: null, nextStatement: null, colour: colours.module },
  { type: "python_from_import", message0: "从 %1 导入 %2", args0: [{ type: "field_input", name: "MODULE", text: "math" }, { type: "field_input", name: "NAME", text: "sqrt" }], previousStatement: null, nextStatement: null, colour: colours.module },
  { type: "python_raw_expression", message0: "原始表达式 %1", args0: [{ type: "field_input", name: "CODE", text: "len(items)" }], output: null, colour: colours.module },
  { type: "python_raw_statement", message0: "原始语句 %1", args0: [{ type: "field_input", name: "CODE", text: "pass" }], previousStatement: null, nextStatement: null, colour: colours.module, tooltip: "直接写入一条 Python 语句。无法用其他积木表达时使用。" },
  { type: "python_floor_divide", message0: "%1 整除 %2", args0: [{ type: "input_value", name: "A", check: "Number" }, { type: "input_value", name: "B", check: "Number" }], inputsInline: true, output: "Number", colour: "#4f72b8" },
  { type: "python_bitwise", message0: "%1 %2 %3", args0: [{ type: "input_value", name: "A", check: "Number" }, { type: "field_dropdown", name: "OP", options: [["按位与", "&"], ["按位或", "|"], ["按位异或", "^"], ["左移", "<<"], ["右移", ">>"]] }, { type: "input_value", name: "B", check: "Number" }], inputsInline: true, output: "Number", colour: "#4f72b8" },
  { type: "python_bitwise_not", message0: "按位取反 ~ %1", args0: [{ type: "input_value", name: "VALUE", check: "Number" }], output: "Number", colour: "#4f72b8" },
  { type: "python_membership", message0: "%1 %2 %3", args0: [{ type: "input_value", name: "ITEM" }, { type: "field_dropdown", name: "OP", options: [["在 in", "in"], ["不在 not in", "not in"]] }, { type: "input_value", name: "COLLECTION" }], inputsInline: true, output: "Boolean", colour: "#5968b0" },
  { type: "python_identity", message0: "%1 %2 %3", args0: [{ type: "input_value", name: "A" }, { type: "field_dropdown", name: "OP", options: [["是 is", "is"], ["不是 is not", "is not"]] }, { type: "input_value", name: "B" }], inputsInline: true, output: "Boolean", colour: "#5968b0" },
  { type: "python_none", message0: "空值 None", output: null, colour: "#5968b0" },
  { type: "python_conditional", message0: "如果 %1 则 %2 否则 %3", args0: [{ type: "input_value", name: "CONDITION", check: "Boolean" }, { type: "input_value", name: "TRUE_VALUE" }, { type: "input_value", name: "FALSE_VALUE" }], inputsInline: true, output: null, colour: "#5968b0" },
  { type: "python_call", message0: "调用函数 %1 参数 %2", args0: [{ type: "field_input", name: "NAME", text: "len" }, { type: "input_value", name: "ARG" }], output: null, colour: expressionColour },
  { type: "python_call_statement", message0: "调用函数 %1 参数 %2", args0: [{ type: "field_input", name: "NAME", text: "print" }, { type: "input_value", name: "ARG" }], previousStatement: null, nextStatement: null, colour: expressionColour },
  { type: "python_keyword_argument", message0: "关键字参数 %1 = %2", args0: [{ type: "field_input", name: "NAME", text: "名称" }, { type: "input_value", name: "VALUE" }], output: "PythonArgument", colour: expressionColour },
  { type: "python_tuple", message0: "元组 ( %1 , %2 )", args0: [{ type: "input_value", name: "A" }, { type: "input_value", name: "B" }], inputsInline: true, output: "PythonTuple", colour: collectionColour },
  { type: "python_set", message0: "集合 { %1 , %2 }", args0: [{ type: "input_value", name: "A" }, { type: "input_value", name: "B" }], inputsInline: true, output: "PythonSet", colour: collectionColour },
  { type: "python_dict", message0: "字典 { %1 : %2 , %3 : %4 }", args0: [{ type: "input_value", name: "K1" }, { type: "input_value", name: "V1" }, { type: "input_value", name: "K2" }, { type: "input_value", name: "V2" }], inputsInline: true, output: "PythonDict", colour: collectionColour },
  { type: "python_index", message0: "%1 的索引 %2", args0: [{ type: "input_value", name: "OBJECT" }, { type: "input_value", name: "INDEX" }], output: null, colour: collectionColour },
  { type: "python_slice", message0: "%1 切片 从 %2 到 %3 步长 %4", args0: [{ type: "input_value", name: "OBJECT" }, { type: "input_value", name: "START" }, { type: "input_value", name: "STOP" }, { type: "input_value", name: "STEP" }], output: null, colour: collectionColour },
  { type: "python_attribute", message0: "%1 的属性 %2", args0: [{ type: "input_value", name: "OBJECT" }, { type: "field_input", name: "ATTRIBUTE", text: "名称" }], output: null, colour: objectColour },
  { type: "python_method_call", message0: "%1 调用方法 %2 参数 %3", args0: [{ type: "input_value", name: "OBJECT" }, { type: "field_input", name: "METHOD", text: "append" }, { type: "input_value", name: "ARG" }], output: null, colour: objectColour },
  { type: "python_method_statement", message0: "%1 调用方法 %2 参数 %3", args0: [{ type: "input_value", name: "OBJECT" }, { type: "field_input", name: "METHOD", text: "append" }, { type: "input_value", name: "ARG" }], previousStatement: null, nextStatement: null, colour: objectColour },
  { type: "python_new_object", message0: "创建 %1 参数 %2", args0: [{ type: "field_input", name: "CLASS", text: "自定义类" }, { type: "input_value", name: "ARG" }], output: null, colour: objectColour },
  { type: "python_return", message0: "返回 %1", args0: [{ type: "input_value", name: "VALUE" }], previousStatement: null, colour: colours.function },
  { type: "python_raise", message0: "抛出异常 %1", args0: [{ type: "input_value", name: "ERROR" }], previousStatement: null, nextStatement: null, colour: statementColour },
  { type: "python_try_except", message0: "尝试 %1 捕获 %2 命名为 %3 %4", args0: [{ type: "input_statement", name: "TRY" }, { type: "field_input", name: "ERROR", text: "Exception" }, { type: "field_variable", name: "ALIAS", variable: "错误" }, { type: "input_statement", name: "EXCEPT" }], previousStatement: null, nextStatement: null, colour: statementColour },
  { type: "python_try_two_except", message0: "尝试 %1 捕获 %2 命名为 %3 %4 再捕获 %5 命名为 %6 %7 最终 %8", args0: [{ type: "input_statement", name: "TRY" }, { type: "field_input", name: "ERROR1", text: "ValueError" }, { type: "field_input", name: "ALIAS1", text: "数值错误" }, { type: "input_statement", name: "EXCEPT1" }, { type: "field_input", name: "ERROR2", text: "TypeError" }, { type: "field_input", name: "ALIAS2", text: "类型错误" }, { type: "input_statement", name: "EXCEPT2" }, { type: "input_statement", name: "FINALLY" }], previousStatement: null, nextStatement: null, colour: statementColour },
  { type: "python_for_in", message0: "对于 %1 在 %2 中 %3", args0: [{ type: "field_variable", name: "VAR", variable: "项目" }, { type: "input_value", name: "ITERABLE" }, { type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null, colour: colours.loop },
  { type: "python_for_enumerate", message0: "枚举 %1 为 %2 , %3 %4", args0: [{ type: "input_value", name: "ITERABLE" }, { type: "field_variable", name: "INDEX", variable: "序号" }, { type: "field_variable", name: "VALUE", variable: "项目" }, { type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null, colour: colours.loop },
  { type: "python_while_else", message0: "当 %1 时 %2 否则 %3", args0: [{ type: "input_value", name: "CONDITION" }, { type: "input_statement", name: "DO" }, { type: "input_statement", name: "ELSE" }], previousStatement: null, nextStatement: null, colour: colours.loop },
  { type: "python_for_else", message0: "对于 %1 在 %2 中 %3 否则 %4", args0: [{ type: "field_variable", name: "VAR", variable: "项目" }, { type: "input_value", name: "ITERABLE" }, { type: "input_statement", name: "DO" }, { type: "input_statement", name: "ELSE" }], previousStatement: null, nextStatement: null, colour: colours.loop },
  { type: "python_pass", message0: "跳过 pass", previousStatement: null, nextStatement: null, colour: colours.loop },
  { type: "python_assert", message0: "断言 %1 消息 %2", args0: [{ type: "input_value", name: "CONDITION" }, { type: "input_value", name: "MESSAGE" }], previousStatement: null, nextStatement: null, colour: statementColour },
  { type: "python_scope_declaration", message0: "%1 变量 %2", args0: [{ type: "field_dropdown", name: "SCOPE", options: [["全局 global", "global"], ["外层 nonlocal", "nonlocal"]] }, { type: "field_input", name: "NAMES", text: "计数器" }], previousStatement: null, nextStatement: null, colour: colours.function },
  { type: "python_function_def", message0: "定义函数 %1 ( %2 ) %3", args0: [{ type: "field_input", name: "NAME", text: "自定义函数" }, { type: "field_input", name: "PARAMS", text: "数值, 次数=1, *参数, **关键字参数" }, { type: "input_statement", name: "BODY" }], previousStatement: null, nextStatement: null, colour: colours.function },
  { type: "python_class_def", message0: "定义类 %1 继承 %2 %3", args0: [{ type: "field_input", name: "NAME", text: "自定义类" }, { type: "field_input", name: "BASES", text: "object" }, { type: "input_statement", name: "BODY" }], previousStatement: null, nextStatement: null, colour: objectColour },
  { type: "python_method_def", message0: "定义方法 %1 ( %2 ) %3", args0: [{ type: "field_input", name: "NAME", text: "自定义方法" }, { type: "field_input", name: "PARAMS", text: "self" }, { type: "input_statement", name: "BODY" }], previousStatement: null, nextStatement: null, colour: objectColour },
  { type: "python_set_attribute", message0: "设置 %1 的属性 %2 为 %3", args0: [{ type: "input_value", name: "OBJECT" }, { type: "field_input", name: "ATTRIBUTE", text: "名称" }, { type: "input_value", name: "VALUE" }], previousStatement: null, nextStatement: null, colour: objectColour },
  { type: "python_super_call", message0: "调用父类方法 %1 参数 %2", args0: [{ type: "field_input", name: "METHOD", text: "__init__" }, { type: "input_value", name: "ARG" }], previousStatement: null, nextStatement: null, colour: objectColour },
  { type: "python_try_full", message0: "尝试 %1 捕获 %2 命名为 %3 %4 否则 %5 最终 %6", args0: [{ type: "input_statement", name: "TRY" }, { type: "field_input", name: "ERROR", text: "Exception" }, { type: "field_variable", name: "ALIAS", variable: "错误" }, { type: "input_statement", name: "EXCEPT" }, { type: "input_statement", name: "ELSE" }, { type: "input_statement", name: "FINALLY" }], previousStatement: null, nextStatement: null, colour: statementColour },
  { type: "python_with", message0: "安全使用 %1 命名为 %2 %3", args0: [{ type: "input_value", name: "CONTEXT" }, { type: "field_variable", name: "ALIAS", variable: "资源" }, { type: "input_statement", name: "BODY" }], previousStatement: null, nextStatement: null, colour: colours.file },
  { type: "python_list_comprehension", message0: "列表 [ %1 对于 %2 在 %3 中 如果 %4 ]", args0: [{ type: "input_value", name: "EXPRESSION" }, { type: "field_input", name: "VAR", text: "项目" }, { type: "input_value", name: "ITERABLE" }, { type: "input_value", name: "CONDITION" }], inputsInline: true, output: null, colour: collectionColour, tooltip: "根据一个集合快速生成新列表，条件可以留空。" },
  { type: "python_set_comprehension", message0: "集合 { %1 对于 %2 在 %3 中 如果 %4 }", args0: [{ type: "input_value", name: "EXPRESSION" }, { type: "field_input", name: "VAR", text: "项目" }, { type: "input_value", name: "ITERABLE" }, { type: "input_value", name: "CONDITION" }], inputsInline: true, output: null, colour: collectionColour, tooltip: "根据一个集合快速生成不重复值的集合，条件可以留空。" },
  { type: "python_dict_comprehension", message0: "字典 { %1 : %2 对于 %3 在 %4 中 如果 %5 }", args0: [{ type: "input_value", name: "KEY" }, { type: "input_value", name: "VALUE" }, { type: "field_input", name: "VAR", text: "项目" }, { type: "input_value", name: "ITERABLE" }, { type: "input_value", name: "CONDITION" }], inputsInline: true, output: null, colour: collectionColour, tooltip: "根据一个集合快速生成键值对，条件可以留空。" },
  { type: "python_lambda", message0: "lambda 参数 %1 返回 %2", args0: [{ type: "field_input", name: "PARAMS", text: "数值" }, { type: "input_value", name: "EXPRESSION" }], inputsInline: true, output: null, colour: colours.function },
  { type: "python_decorated_definition", message0: "装饰器 @ %1 %2", args0: [{ type: "input_value", name: "DECORATOR" }, { type: "input_statement", name: "DEFINITION" }], previousStatement: null, nextStatement: null, colour: colours.function },
  { type: "python_range", message0: "数值范围 从 %1 到 %2 步长 %3", args0: [{ type: "input_value", name: "START", check: "Number" }, { type: "input_value", name: "STOP", check: "Number" }, { type: "input_value", name: "STEP", check: "Number" }], inputsInline: true, output: null, colour: colours.loop, tooltip: "生成从起始值到结束值之前的一组整数。" },
  { type: "python_length", message0: "%1 的长度", args0: [{ type: "input_value", name: "VALUE" }], output: "Number", colour: colours.inputOutput, tooltip: "获取文本或集合中项目的数量。" },
  { type: "python_convert", message0: "将 %1 转换为 %2", args0: [{ type: "input_value", name: "VALUE" }, { type: "field_dropdown", name: "TYPE", options: [["整数", "int"], ["小数", "float"], ["文本", "str"], ["真假值", "bool"], ["列表", "list"], ["元组", "tuple"], ["集合", "set"], ["字典", "dict"]] }], inputsInline: true, output: null, colour: colours.inputOutput, tooltip: "把一个值转换成所选的数据类型。" },
  { type: "python_text_replace", message0: "将文本 %1 中的 %2 替换为 %3", args0: [{ type: "input_value", name: "TEXT", check: "String" }, { type: "input_value", name: "OLD", check: "String" }, { type: "input_value", name: "NEW", check: "String" }], inputsInline: true, output: "String", colour: colours.inputOutput, tooltip: "返回替换后的新文本，不改变原文本。" },
  { type: "python_list_insert", message0: "在列表 %1 的索引 %2 插入 %3", args0: [{ type: "input_value", name: "LIST", check: "Array" }, { type: "input_value", name: "INDEX", check: "Number" }, { type: "input_value", name: "VALUE" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: collectionColour, tooltip: "在列表的指定位置插入一个值。" },
  { type: "python_list_set", message0: "将列表 %1 的索引 %2 设置为 %3", args0: [{ type: "input_value", name: "LIST", check: "Array" }, { type: "input_value", name: "INDEX", check: "Number" }, { type: "input_value", name: "VALUE" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: collectionColour, tooltip: "修改列表指定位置的值。" },
  { type: "python_list_slice_set", message0: "将列表 %1 从 %2 到 %3 步长 %4 的内容替换为 %5", args0: [{ type: "input_value", name: "LIST", check: "Array" }, { type: "input_value", name: "START", check: "Number" }, { type: "input_value", name: "STOP", check: "Number" }, { type: "input_value", name: "STEP", check: "Number" }, { type: "input_value", name: "VALUES", check: "Array" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: collectionColour, tooltip: "替换列表的一段内容；起点、终点和步长可以留空。" },
  { type: "python_list_slice_delete", message0: "删除列表 %1 从 %2 到 %3 步长 %4 的内容", args0: [{ type: "input_value", name: "LIST", check: "Array" }, { type: "input_value", name: "START", check: "Number" }, { type: "input_value", name: "STOP", check: "Number" }, { type: "input_value", name: "STEP", check: "Number" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: collectionColour, tooltip: "删除列表的一段内容；起点、终点和步长可以留空。" },
  { type: "python_sequence_query", message0: "在序列 %1 中 %2 %3", args0: [{ type: "input_value", name: "SEQUENCE", check: ["Array", "PythonTuple"] }, { type: "field_dropdown", name: "METHOD", options: [["统计值出现次数", "count"], ["查找值的位置", "index"]] }, { type: "input_value", name: "VALUE" }], inputsInline: true, output: "Number", colour: collectionColour, tooltip: "适用于列表和元组；可以统计某个值出现的次数，或查找它第一次出现的位置。" },
  { type: "python_sequence_combine", message0: "%1 %2 %3", args0: [{ type: "input_value", name: "SEQUENCE", check: ["Array", "PythonTuple"] }, { type: "field_dropdown", name: "OPERATION", options: [["拼接", "concat"], ["重复", "repeat"]] }, { type: "input_value", name: "OTHER" }], inputsInline: true, output: null, colour: collectionColour, tooltip: "拼接两个同类的列表或元组，或者将一个列表或元组重复指定次数。" },
  { type: "python_list_copy", message0: "复制列表 %1", args0: [{ type: "input_value", name: "LIST", check: "Array" }], output: "Array", colour: collectionColour, tooltip: "创建一个内容相同但相互独立的新列表。" },
  { type: "python_set_operation", message0: "集合 %1 与集合 %2 的 %3", args0: [{ type: "input_value", name: "LEFT", check: "PythonSet" }, { type: "input_value", name: "RIGHT", check: "PythonSet" }, { type: "field_dropdown", name: "OPERATION", options: [["并集", "union"], ["交集", "intersection"], ["差集", "difference"], ["对称差集", "symmetric_difference"]] }], inputsInline: true, output: "PythonSet", colour: collectionColour, tooltip: "计算两个集合的并集、交集、差集或对称差集，不修改原集合。" },
  { type: "python_set_relation", message0: "集合 %1 %3 集合 %2", args0: [{ type: "input_value", name: "LEFT", check: "PythonSet" }, { type: "input_value", name: "RIGHT", check: "PythonSet" }, { type: "field_dropdown", name: "RELATION", options: [["是子集", "subset"], ["是真子集", "proper_subset"], ["是超集", "superset"], ["是真超集", "proper_superset"], ["互不相交", "disjoint"]] }], inputsInline: true, output: "Boolean", colour: collectionColour, tooltip: "判断两个集合之间的包含关系，或它们是否没有共同元素。" },
  { type: "python_set_copy", message0: "复制集合 %1", args0: [{ type: "input_value", name: "SET", check: "PythonSet" }], output: "PythonSet", colour: collectionColour, tooltip: "创建一个内容相同但相互独立的新集合。" },
  { type: "python_dict_get", message0: "从字典 %1 获取键 %2，找不到时返回 %3", args0: [{ type: "input_value", name: "DICT", check: "PythonDict" }, { type: "input_value", name: "KEY" }, { type: "input_value", name: "DEFAULT" }], inputsInline: true, output: null, colour: collectionColour, tooltip: "读取键对应的值；键不存在时返回默认值。" },
  { type: "python_dict_set", message0: "将字典 %1 的键 %2 设置为 %3", args0: [{ type: "input_value", name: "DICT", check: "PythonDict" }, { type: "input_value", name: "KEY" }, { type: "input_value", name: "VALUE" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: collectionColour, tooltip: "新增键值对，或修改已有键的值。" },
  { type: "python_dict_remove", message0: "从字典 %1 删除键 %2", args0: [{ type: "input_value", name: "DICT", check: "PythonDict" }, { type: "input_value", name: "KEY" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: collectionColour, tooltip: "删除指定键；键不存在时不会报错。" },
  { type: "python_dict_view", message0: "字典 %1 的 %2", args0: [{ type: "input_value", name: "DICT", check: "PythonDict" }, { type: "field_dropdown", name: "METHOD", options: [["键 keys", "keys"], ["值 values", "values"], ["键值对 items", "items"]] }], inputsInline: true, output: null, colour: collectionColour },
  { type: "python_dict_fromkeys", message0: "用键集合 %1 创建字典，初始值 %2", args0: [{ type: "input_value", name: "KEYS", check: ["Array", "PythonTuple", "PythonSet"] }, { type: "input_value", name: "VALUE" }], inputsInline: true, output: "PythonDict", colour: collectionColour, tooltip: "使用一组键创建新字典；初始值可以留空。" },
  { type: "python_file_read_text", message0: "读取文本文件 %1 编码 %2", args0: [{ type: "input_value", name: "PATH", check: "String" }, { type: "field_input", name: "ENCODING", text: "utf-8" }], inputsInline: true, output: "String", colour: colours.file, tooltip: "一次读取整个文本文件，读取完成后会自动关闭文件。" },
  { type: "python_file_write_text", message0: "把 %1 %2 文件 %3 编码 %4", args0: [{ type: "input_value", name: "VALUE", check: "String" }, { type: "field_dropdown", name: "MODE", options: [["覆盖写入到", "w"], ["追加到", "a"]] }, { type: "input_value", name: "PATH", check: "String" }, { type: "field_input", name: "ENCODING", text: "utf-8" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.file, tooltip: "写入文本并自动关闭文件；可以选择覆盖原内容或追加到末尾。" },
  { type: "python_open_file", message0: "打开文件 %1 模式 %2 编码 %3", args0: [{ type: "input_value", name: "PATH", check: "String" }, { type: "field_dropdown", name: "MODE", options: [["读取", "r"], ["覆盖写入", "w"], ["追加写入", "a"], ["独占创建", "x"], ["二进制读取", "rb"], ["二进制写入", "wb"], ["二进制追加", "ab"]] }, { type: "field_input", name: "ENCODING", text: "utf-8" }], inputsInline: true, output: null, colour: colours.file },
  { type: "python_file_read", message0: "文件 %1 %2 最多读取 %3", args0: [{ type: "input_value", name: "FILE" }, { type: "field_dropdown", name: "METHOD", options: [["读取全部", "read"], ["读取一行", "readline"], ["读取多行", "readlines"]] }, { type: "input_value", name: "SIZE", check: "Number" }], inputsInline: true, output: null, colour: colours.file, tooltip: "读取数量可以留空；留空时读取全部可用内容。" },
  { type: "python_file_write", message0: "文件 %1 %2 %3", args0: [{ type: "input_value", name: "FILE" }, { type: "field_dropdown", name: "METHOD", options: [["写入内容", "write"], ["写入多行", "writelines"]] }, { type: "input_value", name: "VALUE" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.file },
  { type: "python_file_tell", message0: "文件 %1 当前读写位置", args0: [{ type: "input_value", name: "FILE" }], output: "Number", colour: colours.file },
  { type: "python_file_seek", message0: "将文件 %1 读写位置移动到 %2 相对于 %3", args0: [{ type: "input_value", name: "FILE" }, { type: "input_value", name: "OFFSET", check: "Number" }, { type: "field_dropdown", name: "WHENCE", options: [["文件开头", "0"], ["当前位置", "1"], ["文件末尾", "2"]] }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.file },
  { type: "python_file_control", message0: "文件 %1 %2", args0: [{ type: "input_value", name: "FILE" }, { type: "field_dropdown", name: "ACTION", options: [["立即写入磁盘", "flush"], ["关闭文件", "close"]] }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.file },
  { type: "python_file_exists", message0: "文件 %1 是否存在", args0: [{ type: "input_value", name: "PATH", check: "String" }], output: "Boolean", colour: colours.file },
  { type: "python_directory_exists", message0: "目录 %1 是否存在", args0: [{ type: "input_value", name: "PATH", check: "String" }], output: "Boolean", colour: colours.file },
  { type: "python_path_info", message0: "%1 路径 %2 的 %3", args0: [{ type: "field_dropdown", name: "PATH_KIND", options: [["文件", "file"], ["目录", "directory"]] }, { type: "input_value", name: "PATH", check: "String" }, { type: "field_dropdown", name: "INFO", options: [["名称", "name"], ["不含扩展名的名称", "stem"], ["扩展名", "suffix"], ["父目录", "parent"], ["绝对路径", "resolve"], ["大小（字节，仅文件）", "size"]] }], inputsInline: true, output: null, colour: colours.file, tooltip: "读取文件或目录的名称、父目录、绝对路径等信息。文件大小单位为字节。" },
  { type: "python_file_copy", message0: "复制文件 从 %1 到 %2", args0: [{ type: "input_value", name: "SOURCE", check: "String" }, { type: "input_value", name: "TARGET", check: "String" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.file },
  { type: "python_file_move", message0: "移动或重命名 %1 从 %2 到 %3", args0: [{ type: "field_dropdown", name: "PATH_KIND", options: [["文件", "file"], ["目录", "directory"]] }, { type: "input_value", name: "SOURCE", check: "String" }, { type: "input_value", name: "TARGET", check: "String" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.file, tooltip: "选择文件时可直接指定新的文件名；选择目录时可先选择目标父目录，再在路径末尾填写新目录名。" },
  { type: "python_file_delete", message0: "删除文件 %1 不存在时 %2", args0: [{ type: "input_value", name: "PATH", check: "String" }, { type: "field_dropdown", name: "MISSING_OK", options: [["忽略", "True"], ["报错", "False"]] }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.file },
  { type: "python_directory_find", message0: "在目录 %1 中 %2 查找 %3", args0: [{ type: "input_value", name: "PATH", check: "String" }, { type: "field_dropdown", name: "SCOPE", options: [["当前层", "direct"], ["包含子目录", "recursive"]] }, { type: "input_value", name: "PATTERN", check: "String" }], inputsInline: true, output: "Array", colour: colours.file, tooltip: "按名称模式查找文件或目录，例如 *.txt。返回匹配项目的路径列表。" },
  { type: "python_directory_copy", message0: "复制目录 从 %1 到父目录 %2 新目录名 %3 已存在时 %4", args0: [{ type: "input_value", name: "SOURCE", check: "String" }, { type: "input_value", name: "TARGET", check: "String" }, { type: "field_input", name: "DIRECTORY_NAME", text: "" }, { type: "field_dropdown", name: "EXIST_OK", options: [["合并", "True"], ["报错", "False"]] }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.file, tooltip: "选择源目录和目标父目录，再填写复制后的目录名称。名称留空时兼容旧版完整目标路径。" },
  { type: "python_directory_move", message0: "移动目录 从 %1 到父目录 %2 新目录名 %3", args0: [{ type: "input_value", name: "SOURCE", check: "String" }, { type: "input_value", name: "TARGET", check: "String" }, { type: "field_input", name: "DIRECTORY_NAME", text: "" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.file, tooltip: "选择源目录和目标父目录。填写新名称时同时重命名；名称留空时保留原目录名。" },
  { type: "python_directory_remove", message0: "删除目录 %1 %2", args0: [{ type: "input_value", name: "PATH", check: "String" }, { type: "field_dropdown", name: "REMOVE_MODE", options: [["仅当目录为空", "empty"], ["连同全部内容", "tree"]] }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.file, tooltip: "默认只删除空目录。选择“连同全部内容”会永久删除目录中的所有文件和子目录。" },
]));

installFileBlockPickerFields();

const typedPythonOutputChecks: Record<string, string | string[]> = {
  python_list_comprehension: "Array",
  python_set_comprehension: "PythonSet",
  python_dict_comprehension: "PythonDict",
  python_sequence_combine: ["Array", "PythonTuple"],
};
for (const [type, check] of Object.entries(typedPythonOutputChecks)) {
  const definition = Blockly.Blocks[type] as any;
  if (!definition?.init) continue;
  const originalInit = definition.init;
  definition.init = function(this: Blockly.Block) {
    originalInit.call(this);
    this.setOutput(true, check);
  };
}

const stringMethodOptions: Array<[string, string]> = [
  ["转为大写", "upper"], ["转为小写", "lower"], ["去除两端空白", "strip"],
  ["按分隔符拆分", "split"], ["使用分隔符连接", "join"],
];

Blockly.Blocks.python_string_method = {
  init(this: Blockly.Block) {
    this.setColour(colours.inputOutput);
    this.setOutput(true, "String");
    this.setInputsInline(true);
    this.appendValueInput("TEXT").setCheck("String").appendField("将文本");
    const method = new Blockly.FieldDropdown(stringMethodOptions);
    this.appendDummyInput("METHOD_INPUT").appendField(method, "METHOD");
    this.appendValueInput("ARG").appendField("参数", "ARG_LABEL");
    const update = (value: string) => {
      const argument = this.getInput("ARG");
      if (!argument) return;
      const labels: Record<string, string> = { split: "分隔符", join: "待连接内容" };
      argument.setVisible(value === "split" || value === "join");
      this.setOutput(true, value === "split" ? "Array" : "String");
      this.setFieldValue(labels[value] ?? "参数", "ARG_LABEL");
    };
    method.setValidator((value) => { update(String(value)); return value; });
    update(String(method.getValue()));
    this.setTooltip("对文本执行常用操作；只有需要参数的操作才会显示参数插槽。");
  },
};

const listMethodOptions: Array<[string, string]> = [
  ["在末尾添加", "append"], ["合并另一个集合", "extend"], ["移除指定值", "remove"],
  ["移除指定位置", "pop"], ["从小到大排序", "sort"], ["反转顺序", "reverse"], ["清空", "clear"],
];

Blockly.Blocks.python_list_method = {
  init(this: Blockly.Block) {
    this.setColour(collectionColour);
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.appendValueInput("LIST").setCheck("Array").appendField("对列表");
    const method = new Blockly.FieldDropdown(listMethodOptions);
    this.appendDummyInput("METHOD_INPUT").appendField(method, "METHOD");
    this.appendValueInput("ARG").appendField("要添加的值", "ARG_LABEL");
    const update = (value: string) => {
      const argument = this.getInput("ARG");
      if (!argument) return;
      const labels: Record<string, string> = {
        append: "要添加的值", extend: "要合并的内容", remove: "要移除的值", pop: "索引",
      };
      argument.setVisible(["append", "extend", "remove", "pop"].includes(value));
      this.setFieldValue(labels[value] ?? "参数", "ARG_LABEL");
    };
    method.setValidator((value) => { update(String(value)); return value; });
    update(String(method.getValue()));
    this.setTooltip("修改列表内容；当前操作不需要参数时会自动隐藏参数插槽。");
  },
};

const setMethodOptions: Array<[string, string]> = [
  ["添加一个值", "add"], ["合并多个值", "update"], ["删除值（不存在时报错）", "remove"],
  ["丢弃值（不存在时忽略）", "discard"], ["弹出一个值", "pop"], ["清空", "clear"],
];

Blockly.Blocks.python_set_method = {
  init(this: Blockly.Block) {
    this.setColour(collectionColour);
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.appendValueInput("SET").setCheck("PythonSet").appendField("对集合");
    const method = new Blockly.FieldDropdown(setMethodOptions);
    this.appendDummyInput("METHOD_INPUT").appendField(method, "METHOD");
    this.appendValueInput("ARG").appendField("要添加的值", "ARG_LABEL");
    const update = (methodName: string) => {
      const argument = this.getInput("ARG");
      if (!argument) return;
      const labels: Record<string, string> = {
        add: "要添加的值", update: "要合并的内容", remove: "要删除的值", discard: "要丢弃的值",
      };
      argument.setVisible(["add", "update", "remove", "discard"].includes(methodName));
      this.setFieldValue(labels[methodName] ?? "参数", "ARG_LABEL");
    };
    method.setValidator((nextValue) => { update(String(nextValue)); return nextValue; });
    update(String(method.getValue()));
    this.setTooltip("修改集合内容；删除和丢弃的区别是值不存在时，删除会报错，丢弃会直接忽略。");
  },
};

Blockly.Blocks.python_dict_method = {
  init(this: Blockly.Block) {
    this.setColour(collectionColour);
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.appendValueInput("DICT").setCheck("PythonDict").appendField("对字典");
    const method = new Blockly.FieldDropdown([["合并另一个字典", "update"], ["清空", "clear"]]);
    this.appendDummyInput("METHOD_INPUT").appendField(method, "METHOD");
    this.appendValueInput("OTHER").setCheck("PythonDict").appendField("要合并的字典");
    const update = (methodName: string) => this.getInput("OTHER")?.setVisible(methodName === "update");
    method.setValidator((nextValue) => { update(String(nextValue)); return nextValue; });
    update(String(method.getValue()));
    this.setTooltip("将另一个字典的键值对合并进当前字典，或删除当前字典中的全部内容。");
  },
};

Blockly.Blocks.python_dict_query = {
  init(this: Blockly.Block) {
    this.setColour(collectionColour);
    this.setOutput(true);
    this.setInputsInline(true);
    this.appendValueInput("DICT").setCheck("PythonDict").appendField("对字典");
    const method = new Blockly.FieldDropdown([
      ["复制", "copy"], ["删除键并返回值", "pop"], ["删除最后一项并返回", "popitem"], ["获取键或设置默认值", "setdefault"],
    ]);
    this.appendDummyInput("METHOD_INPUT").appendField(method, "METHOD");
    this.appendValueInput("KEY").appendField("键");
    this.appendValueInput("DEFAULT").appendField("默认值");
    const update = (methodName: string) => {
      this.getInput("KEY")?.setVisible(methodName === "pop" || methodName === "setdefault");
      this.getInput("DEFAULT")?.setVisible(methodName === "pop" || methodName === "setdefault");
    };
    method.setValidator((nextValue) => { update(String(nextValue)); return nextValue; });
    update(String(method.getValue()));
    this.setTooltip("复制字典，或者在取得返回值的同时更新字典内容。默认值可以留空。");
  },
};

const sequenceOutputCheck = () => ["Array", "PythonTuple", "PythonSet"];
const preserveEditableConnections = (connections: Array<Blockly.Connection | null>) => {
  for (const connection of connections) {
    const block = connection?.getSourceBlock();
    if (block?.isShadow()) block.setShadow(false);
  }
};

Blockly.Blocks.python_sequence_collection = {
  init(this: any) {
    this.setColour(collectionColour); this.setOutput(true, sequenceOutputCheck()); this.setInputsInline(true);
    const kindField = new Blockly.FieldDropdown([["列表 [", "list"], ["元组 (", "tuple"], ["集合 {", "set"]]);
    kindField.setValidator((nextValue) => { this.outputConnection?.setCheck(sequenceOutputCheck()); return nextValue; });
    this.appendDummyInput("HEAD").appendField(kindField, "KIND");
    this.itemCount_ = 2; this.updateShape_(); this.updateOutputCheck_();
    this.setMutator(createMutatorIcon(["python_collection_item"], this as Blockly.BlockSvg));
    this.setTooltip("创建列表、元组或集合；下拉框选择类型，点击齿轮增减项目。");
  },
  itemCount_: 2,
  saveExtraState(this: any) { return { itemCount: this.itemCount_ }; },
  loadExtraState(this: any, state: { itemCount?: number }) { this.itemCount_ = state.itemCount ?? 0; this.updateShape_(); this.updateOutputCheck_(); },
  onchange(this: any, event: Blockly.Events.Abstract) {
    if (event.type === Blockly.Events.BLOCK_CHANGE && (event as Blockly.Events.BlockChange).blockId === this.id && (event as Blockly.Events.BlockChange).name === "KIND") { this.updateTail_(); this.updateOutputCheck_(); }
  },
  decompose(this: any, workspace: Blockly.WorkspaceSvg) {
    const container = workspace.newBlock("python_collection_container"); container.initSvg();
    let connection = container.getInput("STACK")!.connection!;
    for (let i = 0; i < this.itemCount_; i++) { const item = workspace.newBlock("python_collection_item"); item.initSvg(); connection.connect(item.previousConnection!); connection = item.nextConnection!; }
    return container;
  },
  compose(this: any, container: Blockly.Block) {
    const connections: Array<Blockly.Connection | null> = [];
    let item = container.getInputTargetBlock("STACK");
    while (item) { if (!item.isInsertionMarker()) connections.push((item as Blockly.Block & { valueConnection_?: Blockly.Connection | null }).valueConnection_ ?? null); item = item.getNextBlock(); }
    for (let i = 0; i < this.itemCount_; i++) { const target = this.getInput(`ITEM${i}`)?.connection?.targetConnection; if (target && !connections.includes(target)) target.disconnect(); }
    this.itemCount_ = connections.length; this.updateShape_();
    connections.forEach((connection, i) => connection?.reconnect(this, `ITEM${i}`));
  },
  saveConnections(this: any, container: Blockly.Block) {
    let item = container.getInputTargetBlock("STACK"); let i = 0;
    while (item) { if (!item.isInsertionMarker()) { (item as Blockly.Block & { valueConnection_?: Blockly.Connection | null }).valueConnection_ = this.getInput(`ITEM${i}`)?.connection?.targetConnection; i++; } item = item.getNextBlock(); }
  },
  updateShape_(this: any) {
    this.getInput("TAIL") && this.removeInput("TAIL");
    this.getInput("EMPTY") && this.removeInput("EMPTY");
    if (!this.itemCount_) this.appendDummyInput("EMPTY").appendField("空");
    for (let i = 0; i < this.itemCount_; i++) {
      if (this.getInput(`ITEM${i}`)) continue;
      const input = this.appendValueInput(`ITEM${i}`);
      if (i > 0) input.appendField(",");
    }
    for (let i = this.itemCount_; this.getInput(`ITEM${i}`); i++) this.removeInput(`ITEM${i}`);
    this.updateTail_();
    this.setInputsInline(true);
  },
  updateTail_(this: any) {
    this.getInput("TAIL") && this.removeInput("TAIL");
    const closing = this.getFieldValue("KIND") === "tuple" ? ")" : this.getFieldValue("KIND") === "set" ? "}" : "]";
    this.appendDummyInput("TAIL").appendField(closing);
  },
  updateOutputCheck_(this: any) {
    this.outputConnection?.setCheck(sequenceOutputCheck());
  },
} as unknown as (typeof Blockly.Blocks)[string];
Blockly.Blocks.python_collection_container = { init(this: Blockly.Block) { this.setColour(collectionColour); this.appendDummyInput().appendField("项目"); this.appendStatementInput("STACK"); this.contextMenu = false; } };
Blockly.Blocks.python_collection_item = { init(this: Blockly.Block) { this.setColour(collectionColour); this.appendDummyInput().appendField("项目"); this.setPreviousStatement(true); this.setNextStatement(true); this.contextMenu = false; } };

Blockly.Blocks.python_list_collection = {
  init(this: any) {
    this.setColour(collectionColour); this.setOutput(true, ["Array", "ManimPointArguments"]); this.setInputsInline(true);
    this.appendDummyInput("HEAD").appendField("列表 [");
    this.itemCount_ = 2; this.updateShape_();
    this.setMutator(createMutatorIcon(["python_collection_item"], this as Blockly.BlockSvg));
    this.setTooltip("创建可调整数量的列表；点击齿轮可以增减项目，也可以在项目中嵌套列表。\n需要切换列表、元组或集合时，请使用通用序列积木。");
  },
  itemCount_: 2,
  saveExtraState: Blockly.Blocks.python_sequence_collection.saveExtraState,
  loadExtraState: Blockly.Blocks.python_sequence_collection.loadExtraState,
  decompose: Blockly.Blocks.python_sequence_collection.decompose,
  compose: Blockly.Blocks.python_sequence_collection.compose,
  saveConnections: Blockly.Blocks.python_sequence_collection.saveConnections,
  updateShape_: Blockly.Blocks.python_sequence_collection.updateShape_,
  updateTail_(this: any) {
    this.getInput("TAIL") && this.removeInput("TAIL");
    this.appendDummyInput("TAIL").appendField("]");
  },
  updateOutputCheck_(this: any) { this.outputConnection?.setCheck(["Array", "ManimPointArguments"]); },
} as unknown as (typeof Blockly.Blocks)[string];

Blockly.Blocks.python_dynamic_dict = {
  init(this: any) { this.setColour(collectionColour); this.setOutput(true, "PythonDict"); this.setInputsInline(true); this.appendDummyInput("HEAD").appendField("字典 {"); this.itemCount_ = 2; this.updateShape_(); this.setMutator(createMutatorIcon(["python_collection_item"], this as Blockly.BlockSvg)); },
  itemCount_: 2,
  saveExtraState(this: any) { return { itemCount: this.itemCount_ }; },
  loadExtraState(this: any, state: { itemCount?: number }) { this.itemCount_ = state.itemCount ?? 0; this.updateShape_(); },
  decompose: Blockly.Blocks.python_sequence_collection.decompose,
  compose(this: any, container: Blockly.Block) {
    const pairs: Array<[Blockly.Connection | null, Blockly.Connection | null]> = []; let item = container.getInputTargetBlock("STACK");
    while (item) { if (!item.isInsertionMarker()) pairs.push([(item as Blockly.Block & { keyConnection_?: Blockly.Connection | null }).keyConnection_ ?? null, (item as Blockly.Block & { valueConnection_?: Blockly.Connection | null }).valueConnection_ ?? null]); item = item.getNextBlock(); }
    for (let i = 0; i < this.itemCount_; i++) {
      const key = this.getInput(`KEY${i}`)?.connection?.targetConnection;
      const value = this.getInput(`VALUE${i}`)?.connection?.targetConnection;
      if (key && !pairs.some(([candidate]) => candidate === key)) key.disconnect();
      if (value && !pairs.some(([, candidate]) => candidate === value)) value.disconnect();
    }
    this.itemCount_ = pairs.length; this.updateShape_(); pairs.forEach(([key, val], i) => { key?.reconnect(this, `KEY${i}`); val?.reconnect(this, `VALUE${i}`); });
  },
  saveConnections(this: any, container: Blockly.Block) { let item = container.getInputTargetBlock("STACK"); let i = 0; while (item) { if (!item.isInsertionMarker()) { const typed = item as Blockly.Block & { keyConnection_?: Blockly.Connection | null; valueConnection_?: Blockly.Connection | null }; typed.keyConnection_ = this.getInput(`KEY${i}`)?.connection?.targetConnection; typed.valueConnection_ = this.getInput(`VALUE${i}`)?.connection?.targetConnection; i++; } item = item.getNextBlock(); } },
  updateShape_(this: any) {
    this.getInput("TAIL") && this.removeInput("TAIL");
    this.getInput("EMPTY") && this.removeInput("EMPTY");
    if (!this.itemCount_) this.appendDummyInput("EMPTY").appendField("空");
    for (let i = 0; i < this.itemCount_; i++) {
      if (!this.getInput(`KEY${i}`)) {
        const key = this.appendValueInput(`KEY${i}`);
        if (i > 0) key.appendField(",");
      }
      if (!this.getInput(`VALUE${i}`)) this.appendValueInput(`VALUE${i}`).appendField(":");
    }
    for (let i = this.itemCount_; this.getInput(`KEY${i}`); i++) {
      this.removeInput(`KEY${i}`);
      this.removeInput(`VALUE${i}`);
    }
    this.appendDummyInput("TAIL").appendField("}");
    this.setInputsInline(true);
  },
} as unknown as (typeof Blockly.Blocks)[string];

Blockly.Blocks.python_print_many = {
  init(this: any) {
    this.setColour(colours.inputOutput);
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.appendDummyInput("HEAD").appendField("打印");
    this.itemCount_ = 2;
    this.updateShape_();
    this.setMutator(createMutatorIcon(["python_collection_item"], this as Blockly.BlockSvg));
    this.setTooltip("打印多个值，可设置值之间的分隔符和结尾字符。使用积木上的变更按钮增减输出项。\n例如：print(姓名, 分数, sep=\" | \", end=\"\\n\")");
  },
  itemCount_: 2,
  saveExtraState(this: any) { return { itemCount: this.itemCount_ }; },
  loadExtraState(this: any, state: { itemCount?: number }) { this.itemCount_ = Math.max(1, state.itemCount ?? 2); this.updateShape_(); },
  decompose: Blockly.Blocks.python_sequence_collection.decompose,
  compose(this: any, container: Blockly.Block) {
    const connections: Array<Blockly.Connection | null> = [];
    let item = container.getInputTargetBlock("STACK");
    while (item) {
      if (!item.isInsertionMarker()) connections.push((item as Blockly.Block & { valueConnection_?: Blockly.Connection | null }).valueConnection_ ?? null);
      item = item.getNextBlock();
    }
    for (let i = 0; i < this.itemCount_; i++) {
      const target = this.getInput(`ITEM${i}`)?.connection?.targetConnection;
      if (target && !connections.includes(target)) target.disconnect();
    }
    preserveEditableConnections(connections);
    this.itemCount_ = Math.max(1, connections.length);
    this.updateShape_();
    connections.forEach((connection, index) => connection?.reconnect(this, `ITEM${index}`));
  },
  saveConnections(this: any, container: Blockly.Block) {
    let item = container.getInputTargetBlock("STACK");
    let index = 0;
    while (item) {
      if (!item.isInsertionMarker()) {
        (item as Blockly.Block & { valueConnection_?: Blockly.Connection | null }).valueConnection_ = this.getInput(`ITEM${index}`)?.connection?.targetConnection;
        index += 1;
      }
      item = item.getNextBlock();
    }
  },
  updateShape_(this: any) {
    for (let i = 0; this.getInput(`ITEM${i}`); i++) this.removeInput(`ITEM${i}`);
    this.getInput("OPTIONS") && this.removeInput("OPTIONS");
    for (let i = 0; i < this.itemCount_; i++) {
      const input = this.appendValueInput(`ITEM${i}`);
      if (i > 0) input.appendField(",");
    }
    this.appendDummyInput("OPTIONS")
      .appendField("分隔")
      .appendField(new Blockly.FieldTextInput(" "), "SEP")
      .appendField("结尾")
      .appendField(new Blockly.FieldTextInput("\\n"), "END");
    this.setInputsInline(true);
  },
} as unknown as (typeof Blockly.Blocks)[string];

const inputTypeOptions: Blockly.MenuOption[] = [["文本", "str"], ["整数", "int"], ["小数", "float"]];

Blockly.Blocks.python_input_many_assign = {
  init(this: any) {
    this.setColour(colours.inputOutput);
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.variableNames_ = ["第一项", "第二项"];
    this.itemCount_ = 2;
    this.appendValueInput("PROMPT").setCheck("String").appendField("询问");
    this.updateShape_();
    this.setMutator(createMutatorIcon(["python_input_target_item"], this as Blockly.BlockSvg));
    this.setTooltip("读取一行输入并按分隔符拆分，分别保存到多个变量。整数和小数会自动转换。\n分隔符留空时使用 Python 的默认空白分隔。\n使用积木上的变更按钮增减变量。\n");
  },
  itemCount_: 2,
  variableNames_: ["第一项", "第二项"],
  saveExtraState(this: any) { return { itemCount: this.itemCount_, variables: this.variableNames_ }; },
  loadExtraState(this: any, state: { itemCount?: number; variables?: string[] }) {
    this.itemCount_ = Math.max(1, state.itemCount ?? 2);
    this.variableNames_ = Array.from({ length: this.itemCount_ }, (_, index) => state.variables?.[index] || `第${index + 1}项`);
    this.updateShape_();
  },
  decompose(this: any, workspace: Blockly.WorkspaceSvg) {
    const container = workspace.newBlock("python_input_target_container");
    container.initSvg();
    let connection = container.getInput("STACK")!.connection!;
    for (let index = 0; index < this.itemCount_; index++) {
      const item = workspace.newBlock("python_input_target_item");
      item.initSvg();
      item.setFieldValue(this.getFieldValue(`VAR${index}`) || this.variableNames_[index] || `第${index + 1}项`, "VAR");
      connection.connect(item.previousConnection!);
      connection = item.nextConnection!;
    }
    return container;
  },
  compose(this: any, container: Blockly.Block) {
    const names: string[] = [];
    let item = container.getInputTargetBlock("STACK");
    while (item) {
      if (!item.isInsertionMarker()) names.push(String(item.getFieldValue("VAR") || `第${names.length + 1}项`));
      item = item.getNextBlock();
    }
    this.itemCount_ = Math.max(1, names.length);
    this.variableNames_ = names.length ? names : ["第一项"];
    this.updateShape_();
  },
  updateShape_(this: any) {
    const separator = String(this.getFieldValue("SEP") ?? "");
    const type = String(this.getFieldValue("TYPE") || "str");
    this.getInput("TARGETS") && this.removeInput("TARGETS");
    this.getInput("OPTIONS") && this.removeInput("OPTIONS");
    const targets = this.appendDummyInput("TARGETS").appendField("保存到");
    for (let index = 0; index < this.itemCount_; index++) {
      targets.appendField(new Blockly.FieldVariable(this.variableNames_[index] || `第${index + 1}项`), `VAR${index}`);
      if (index < this.itemCount_ - 1) targets.appendField(",");
    }
    this.appendDummyInput("OPTIONS")
      .appendField("分隔")
      .appendField(new Blockly.FieldTextInput(separator), "SEP")
      .appendField("类型")
      .appendField(new Blockly.FieldDropdown(inputTypeOptions), "TYPE");
    this.setFieldValue(["str", "int", "float"].includes(type) ? type : "str", "TYPE");
    this.setInputsInline(true);
  },
} as unknown as (typeof Blockly.Blocks)[string];
Blockly.Blocks.python_input_target_container = { init(this: Blockly.Block) { this.setColour(colours.inputOutput); this.appendDummyInput().appendField("输入变量"); this.appendStatementInput("STACK"); this.contextMenu = false; } };
Blockly.Blocks.python_input_target_item = { init(this: Blockly.Block) { this.setColour(colours.inputOutput); this.appendDummyInput().appendField(new Blockly.FieldVariable("变量"), "VAR"); this.setPreviousStatement(true); this.setNextStatement(true); this.contextMenu = false; } };

type ParameterSpec = {
  kind: "positional_only" | "positional" | "default" | "args" | "keyword_only" | "keyword_only_default" | "kwargs";
  name: string;
  annotation?: string;
};
type ArgumentSpec = { kind: "positional" | "keyword" | "star" | "kwargs"; name: string };

const normalizeIdentifier = (name: string, fallback: string, used: Set<string>) => {
  const normalized = normalizePythonIdentifier(name);
  const base = isPythonIdentifier(normalized) ? normalized : fallback;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}_${suffix++}`;
  used.add(candidate);
  return candidate;
};

function normalizeParameters(parameters: ParameterSpec[]) {
  const seenKinds = new Set<"args" | "kwargs">();
  const usedNames = new Set<string>();
  const rank = { positional_only: 0, positional: 1, default: 2, args: 3, keyword_only: 4, keyword_only_default: 5, kwargs: 6 } as const;
  return parameters.map((parameter, index) => {
    const kind = (parameter.kind === "args" || parameter.kind === "kwargs") && seenKinds.has(parameter.kind)
      ? "positional"
      : parameter.kind;
    if (kind === "args" || kind === "kwargs") seenKinds.add(kind);
    return { kind, name: normalizeIdentifier(parameter.name, "value", usedNames), annotation: parameter.annotation || "", index };
  }).sort((left, right) => rank[left.kind] - rank[right.kind] || left.index - right.index)
    .map(({ kind, name, annotation }) => annotation ? { kind, name, annotation } : { kind, name });
}

function normalizeArguments(arguments_: ArgumentSpec[]) {
  const usedKeywords = new Set<string>();
  return arguments_.map((argument) => {
    if (argument.kind === "keyword") return { kind: "keyword" as const, name: normalizeIdentifier(argument.name, "name", usedKeywords) };
    if (argument.kind === "star" || argument.kind === "kwargs") return { kind: argument.kind, name: "" };
    return { kind: "positional" as const, name: "" };
  });
}

function rebuildParameterShape(block: any) {
  const typed = block.type.includes("typed_function");
  const returnType = block.getFieldValue("RETURN_TYPE") || "None";
  for (const input of [...block.inputList]) {
    if (/^PARAM(?:_FIELDS)?\d+$/.test(input.name)) block.removeInput(input.name);
  }
  block.getInput("TAIL") && block.removeInput("TAIL");
  const name = block.getFieldValue("NAME") || (block.type.includes("method") ? "自定义方法" : "自定义函数");
  const definitionLabel = block.definitionLabel_ || (block.type.includes("method") ? "定义方法" : "定义函数");
  block.removeInput("HEAD");
  let fieldInput = block.appendDummyInput("HEAD")
    .appendField(definitionLabel)
    .appendField(new Blockly.FieldTextInput(name), "NAME")
    .appendField("(");
  if (block.getInput("BODY")) block.moveInputBefore("HEAD", "BODY");
  block.parameters_.forEach((parameter: ParameterSpec, index: number) => {
    const hasDefault = parameter.kind === "default" || parameter.kind === "keyword_only_default";
    const input = hasDefault
      ? block.appendValueInput(`PARAM${index}`)
      : fieldInput ?? block.appendDummyInput(`PARAM_FIELDS${index}`);
    if (index) input.appendField(",");
    else input.appendField("", `PARAM_PREFIX${index}`);
    if (parameter.kind === "args") input.appendField("*");
    if (parameter.kind === "kwargs") input.appendField("**");
    input.appendField(new Blockly.FieldTextInput(parameter.name), `PARAM_NAME${index}`);
    if (typed) input.appendField(":").appendField(new Blockly.FieldTextInput(parameter.annotation || "object"), `PARAM_TYPE${index}`);
    if (hasDefault) input.appendField("=");
    if (hasDefault) fieldInput = null;
    else fieldInput = input;
    if (block.getInput("BODY") && input.name !== "HEAD") block.moveInputBefore(input.name, "BODY");
  });
  const tail = fieldInput ?? block.appendDummyInput("TAIL");
  tail.appendField(")", "CLOSE_PAREN");
  if (typed) tail.appendField("->").appendField(new Blockly.FieldTextInput(returnType), "RETURN_TYPE");
  if (block.getInput("BODY") && tail.name !== "HEAD") block.moveInputBefore(tail.name, "BODY");
  block.setInputsInline(true);
}

const parameterMixin = {
  parameters_: [] as ParameterSpec[],
  saveExtraState(this: any) { return { parameters: this.parameters_.map((parameter: ParameterSpec, i: number) => ({ ...parameter, name: this.getFieldValue(`PARAM_NAME${i}`) || parameter.name, annotation: this.getFieldValue(`PARAM_TYPE${i}`) || parameter.annotation || "" })) }; },
  loadExtraState(this: any, state: { parameters?: ParameterSpec[] }) { this.parameters_ = normalizeParameters(state.parameters ?? []); rebuildParameterShape(this); },
  decompose(this: any, workspace: Blockly.WorkspaceSvg) {
    const container = workspace.newBlock("python_parameter_container"); container.initSvg(); let connection = container.getInput("STACK")!.connection!;
    this.parameters_.forEach((parameter: ParameterSpec, i: number) => { const item = workspace.newBlock(this.type.includes("typed_function") ? "python_typed_parameter_item" : "python_parameter_item"); item.initSvg(); item.setFieldValue(parameter.kind, "KIND"); item.setFieldValue(this.getFieldValue(`PARAM_NAME${i}`) || parameter.name, "NAME"); if (item.getField("TYPE")) item.setFieldValue(this.getFieldValue(`PARAM_TYPE${i}`) || parameter.annotation || "object", "TYPE"); connection.connect(item.previousConnection!); connection = item.nextConnection!; });
    return container;
  },
  compose(this: any, container: Blockly.Block) {
    const parameters: ParameterSpec[] = []; const connections: Array<Blockly.Connection | null> = []; let item = container.getInputTargetBlock("STACK");
    while (item) { if (!item.isInsertionMarker()) { parameters.push({ kind: item.getFieldValue("KIND"), name: item.getFieldValue("NAME") || "数值", annotation: item.getFieldValue("TYPE") || "" }); connections.push((item as any).valueConnection_ ?? null); } item = item.getNextBlock(); }
    const normalized = normalizeParameters(parameters);
    const orderedConnections = normalized.map((parameter) => connections[parameters.findIndex((item) => item.name === parameter.name)] ?? null);
    preserveEditableConnections(orderedConnections);
    this.parameters_ = normalized; rebuildParameterShape(this); orderedConnections.forEach((connection, i) => connection?.reconnect(this, `PARAM${i}`));
  },
  saveConnections(this: any, container: Blockly.Block) { let item = container.getInputTargetBlock("STACK"); let i = 0; while (item) { if (!item.isInsertionMarker()) { (item as any).valueConnection_ = this.getInput(`PARAM${i}`)?.connection?.targetConnection; i++; } item = item.getNextBlock(); } },
};

Blockly.Blocks.python_parameter_container = { init(this: Blockly.Block) { this.setColour(colours.function); this.appendDummyInput().appendField("函数参数"); this.appendStatementInput("STACK"); this.contextMenu = false; } };
const parameterKindOptions: Blockly.MenuOption[] = [["普通参数", "positional"], ["默认参数", "default"], ["*args", "args"], ["仅限关键字参数", "keyword_only"], ["关键字默认参数", "keyword_only_default"], ["仅限位置参数 /", "positional_only"], ["**kwargs", "kwargs"]];
Blockly.Blocks.python_parameter_item = { init(this: Blockly.Block) { this.setColour(colours.function); this.appendDummyInput().appendField(new Blockly.FieldDropdown(parameterKindOptions), "KIND").appendField(new Blockly.FieldTextInput("数值"), "NAME"); this.setPreviousStatement(true); this.setNextStatement(true); this.contextMenu = false; } };
Blockly.Blocks.python_typed_parameter_item = { init(this: Blockly.Block) { this.setColour(colours.function); this.appendDummyInput().appendField(new Blockly.FieldDropdown(parameterKindOptions), "KIND").appendField(new Blockly.FieldTextInput("数值"), "NAME").appendField(":").appendField(new Blockly.FieldTextInput("object"), "TYPE"); this.setPreviousStatement(true); this.setNextStatement(true); this.contextMenu = false; } };

function defineStructuredFunction(type: string, label: string, colour: string, initial: ParameterSpec[]) {
  Blockly.Blocks[type] = { ...parameterMixin, init(this: any) { this.definitionLabel_ = label; this.setColour(colour); this.setPreviousStatement(true); this.setNextStatement(true); this.appendDummyInput("HEAD").appendField(label).appendField(new Blockly.FieldTextInput(type.includes("method") ? "自定义方法" : "自定义函数"), "NAME").appendField("("); this.parameters_ = initial.map((item) => ({ ...item })); rebuildParameterShape(this); this.appendStatementInput("BODY"); this.setMutator(createMutatorIcon([type.includes("typed_function") ? "python_typed_parameter_item" : "python_parameter_item"], this as Blockly.BlockSvg)); } } as any;
}
defineStructuredFunction("python_function_structured", "定义函数", colours.function, [{ kind: "positional", name: "数值" }]);
defineStructuredFunction("python_method_structured", "定义方法", colours.object, [{ kind: "positional", name: "self" }]);
defineStructuredFunction("python_async_function_structured", "定义异步函数", colours.function, [{ kind: "positional", name: "数值" }]);
defineStructuredFunction("python_typed_function_structured", "定义带类型函数", colours.function, [{ kind: "positional", name: "数值", annotation: "object" }]);
defineStructuredFunction("python_async_typed_function_structured", "定义异步带类型函数", colours.function, [{ kind: "positional", name: "数值", annotation: "object" }]);

function rebuildArgumentShape(block: any) {
  for (const input of [...block.inputList]) {
    if (/^ARG\d+$/.test(input.name)) block.removeInput(input.name);
  }
  block.getInput("TAIL") && block.removeInput("TAIL");
  const target = block.getFieldValue("TARGET") || (block.type.includes("method") ? "项目列表.append" : block.type.includes("new_object") ? "自定义类" : "自定义函数");
  block.removeInput("HEAD");
  const head = block.appendDummyInput("HEAD");
  if (block.type.includes("method")) head.appendField("对象");
  else head.appendField("", "CALL_PREFIX");
  head.appendField(new Blockly.FieldTextInput(target), "TARGET").appendField("(");
  block.arguments_.forEach((argument: ArgumentSpec, index: number) => {
    const input = block.appendValueInput(`ARG${index}`); if (index) input.appendField(",");
    else input.appendField("", `ARG_PREFIX${index}`);
    if (argument.kind === "keyword") input.appendField(new Blockly.FieldTextInput(argument.name), `ARG_NAME${index}`).appendField("=");
    if (argument.kind === "star") input.appendField("*");
    if (argument.kind === "kwargs") input.appendField("**");
  });
  block.appendDummyInput("TAIL").appendField(")", "CLOSE_PAREN");
  block.setInputsInline(true);
}
const argumentMixin = {
  arguments_: [] as ArgumentSpec[],
  saveExtraState(this: any) { return { arguments: this.arguments_.map((argument: ArgumentSpec, i: number) => ({ ...argument, name: this.getFieldValue(`ARG_NAME${i}`) || argument.name })) }; },
  loadExtraState(this: any, state: { arguments?: ArgumentSpec[] }) { this.arguments_ = normalizeArguments(state.arguments ?? []); rebuildArgumentShape(this); },
  decompose(this: any, workspace: Blockly.WorkspaceSvg) { const container = workspace.newBlock("python_argument_container"); container.initSvg(); let connection = container.getInput("STACK")!.connection!; this.arguments_.forEach((argument: ArgumentSpec, i: number) => { const item = workspace.newBlock("python_argument_item"); item.initSvg(); item.setFieldValue(argument.kind, "KIND"); item.setFieldValue(this.getFieldValue(`ARG_NAME${i}`) || argument.name, "NAME"); connection.connect(item.previousConnection!); connection = item.nextConnection!; }); return container; },
  compose(this: any, container: Blockly.Block) {
    const args: ArgumentSpec[] = [];
    const connections: Array<Blockly.Connection | null> = [];
    let item = container.getInputTargetBlock("STACK");
    while (item) {
      if (!item.isInsertionMarker()) {
        args.push({ kind: item.getFieldValue("KIND"), name: item.getFieldValue("NAME") || "名称" });
        connections.push((item as any).valueConnection_ ?? null);
      }
      item = item.getNextBlock();
    }
    const normalized = normalizeArguments(args);
    const current = this.arguments_.map((argument: ArgumentSpec, index: number) => ({ ...argument, name: this.getFieldValue(`ARG_NAME${index}`) || argument.name }));
    const currentConnections = this.arguments_.map((_: ArgumentSpec, index: number) => this.getInput(`ARG${index}`)?.connection?.targetConnection ?? null);
    const unchanged = JSON.stringify(normalized) === JSON.stringify(current)
      && connections.every((connection, index) => connection === currentConnections[index]);
    if (unchanged) return;
    preserveEditableConnections(connections);
    this.arguments_ = normalized;
    rebuildArgumentShape(this);
    connections.forEach((connection, index) => connection?.reconnect(this, `ARG${index}`));
  },
  saveConnections(this: any, container: Blockly.Block) { let item = container.getInputTargetBlock("STACK"); let i = 0; while (item) { if (!item.isInsertionMarker()) { (item as any).valueConnection_ = this.getInput(`ARG${i}`)?.connection?.targetConnection; i++; } item = item.getNextBlock(); } },
};
Blockly.Blocks.python_argument_container = { init(this: Blockly.Block) { this.setColour(colours.call); this.appendDummyInput().appendField("调用参数"); this.appendStatementInput("STACK"); this.contextMenu = false; } };
Blockly.Blocks.python_argument_item = { init(this: Blockly.Block) { this.setColour(colours.call); this.appendDummyInput().appendField(new Blockly.FieldDropdown([["位置参数", "positional"], ["关键字参数", "keyword"], ["展开参数 *", "star"], ["展开关键字参数 **", "kwargs"]]), "KIND").appendField(new Blockly.FieldTextInput("名称"), "NAME"); this.setPreviousStatement(true); this.setNextStatement(true); this.contextMenu = false; } };

function defineStructuredCall(type: string, mode: "value" | "statement", target: "function" | "method" | "class") {
  Blockly.Blocks[type] = { ...argumentMixin, init(this: any) { this.setColour(target === "function" ? colours.call : colours.object); if (mode === "value") this.setOutput(true); else { this.setPreviousStatement(true); this.setNextStatement(true); } const head = this.appendDummyInput("HEAD"); if (target === "method") head.appendField("对象"); head.appendField(new Blockly.FieldTextInput(target === "class" ? "自定义类" : target === "method" ? "项目列表.append" : "自定义函数"), "TARGET").appendField("("); this.arguments_ = []; rebuildArgumentShape(this); this.setMutator(createMutatorIcon(["python_argument_item"], this as Blockly.BlockSvg)); } } as any;
}
defineStructuredCall("python_call_structured", "value", "function");
defineStructuredCall("python_call_statement_structured", "statement", "function");
defineStructuredCall("python_method_call_structured", "value", "method");
defineStructuredCall("python_method_statement_structured", "statement", "method");
defineStructuredCall("python_new_object_structured", "value", "class");

const inlinePatched = Symbol("visualPythonInlinePatched");
type PatchableBlockDefinition = {
  init?: (this: Blockly.Block) => void;
  [inlinePatched]?: boolean;
};

const listDefinition = Blockly.Blocks.lists_create_with as PatchableBlockDefinition;
if (listDefinition?.init) {
  const originalListInit = listDefinition.init;
  listDefinition.init = function () {
    originalListInit.call(this);
    const block = this as Blockly.Block & { updateShape_?: () => void };
    const originalUpdateShape = block.updateShape_?.bind(block);
    if (!originalUpdateShape) return;
    block.updateShape_ = () => {
      originalUpdateShape();
      if (block.getInput("LIST_CLOSE_INPUT")) block.removeInput("LIST_CLOSE_INPUT");
      const openInput = block.inputList.find((input) => input.fieldRow.some((field) => field.name === "LIST_OPEN"));
      openInput?.removeField("LIST_OPEN");
      const firstInput = block.getInput("ADD0");
      if (firstInput) firstInput.insertFieldAt(firstInput.fieldRow.length, "[", "LIST_OPEN");
      for (let index = 1; block.getInput(`ADD${index}`); index += 1) {
        const input = block.getInput(`ADD${index}`)!;
        if (!block.getField(`COMMA${index}`)) input.insertFieldAt(0, ",", `COMMA${index}`);
      }
      if (firstInput) block.appendDummyInput("LIST_CLOSE_INPUT").appendField("]", "LIST_CLOSE");
      block.setInputsInline(true);
    };
    block.updateShape_();
  };
}

const mathNumberPatched = Symbol("visualPythonMathNumberPatched");
const styleMathNumberBlock = (block: Blockly.Block) => {
  const root = (block as Blockly.Block & { getSvgRoot?: () => SVGElement | null }).getSvgRoot?.();
  if (!root) return;
  root.querySelectorAll<SVGElement>(".blocklyPath").forEach((element) => {
    element.setAttribute("fill", blockStyles.math_blocks.colourPrimary);
    element.setAttribute("stroke", blockStyles.math_blocks.colourSecondary);
  });
  root.querySelectorAll<SVGElement>(".blocklyNumberField rect, .blocklyNumberField path, .blocklyNumberField .blocklyFieldRect").forEach((element) => {
    element.setAttribute("fill", blockStyles.math_blocks.colourSecondary);
    element.setAttribute("fill-opacity", "1");
    element.setAttribute("stroke", "rgba(255,255,255,.34)");
  });
  root.querySelectorAll<SVGElement>(".blocklyNumberField text, .blocklyNumberField .blocklyText").forEach((element) => {
    element.setAttribute("fill", "#ffffff");
  });
};
const mathNumberDefinition = Blockly.Blocks.math_number as PatchableBlockDefinition & { [mathNumberPatched]?: boolean };
if (mathNumberDefinition?.init && !mathNumberDefinition[mathNumberPatched]) {
  const originalMathNumberInit = mathNumberDefinition.init;
  mathNumberDefinition.init = function () {
    originalMathNumberInit.call(this);
    const block = this as Blockly.Block & { render?: () => void; [mathNumberPatched]?: boolean };
    if (block[mathNumberPatched]) return;
    const originalRender = block.render?.bind(block);
    if (originalRender) {
      block.render = () => {
        originalRender();
        styleMathNumberBlock(block);
      };
    }
    queueMicrotask(() => styleMathNumberBlock(block));
    block[mathNumberPatched] = true;
  };
  mathNumberDefinition[mathNumberPatched] = true;
}

// Blockly defaults several multi-input blocks to automatic line wrapping.
// Patch block initialization once so built-in and plugin blocks start inline.
for (const definition of Object.values(Blockly.Blocks) as PatchableBlockDefinition[]) {
  if (!definition?.init || definition[inlinePatched]) continue;
  const originalInit = definition.init;
  definition.init = function () {
    originalInit.call(this);
    this.setInputsInline(true);
  };
  definition[inlinePatched] = true;
}

const value = (generator: typeof pythonGenerator, block: Blockly.Block, name: string, fallback = "None", order = Order.NONE) =>
  generator.valueToCode(block, name, order) || fallback;
const safeIdentifier = (input: string, fallback: string) => pythonIdentifierOrFallback(input, fallback);
const variableName = (generator: typeof pythonGenerator, block: Blockly.Block, field: string, fallback: string) => {
  const id = block.getFieldValue(field);
  return id ? generator.getVariableName(id) : fallback;
};
const safeParameters = (input: string) => input.split(",").map((part) => part.trim()).filter(Boolean).filter((part) => {
  if (part === "*" || part === "/") return true;
  const match = part.match(/^(\*{0,2})([^=\s]+)(?:\s*=\s*.+)?$/u);
  return Boolean(match && isPythonIdentifier(match[2]));
}).join(", ");
const safeAnnotation = (input: string, fallback = "object") => isPythonAnnotation(input) ? String(input).trim().normalize("NFKC") : fallback;
const suite = (generator: typeof pythonGenerator, block: Blockly.Block, name: string) => generator.statementToCode(block, name) || `${generator.INDENT}pass\n`;

pythonGenerator.forBlock.python_raw_expression = (block) => [String(block.getFieldValue("CODE") || "None"), Order.ATOMIC];
pythonGenerator.forBlock.python_raw_statement = (block) => {
  const code = String(block.getFieldValue("CODE") || "pass").trim();
  return `${code}${code.endsWith("\n") ? "" : "\n"}`;
};
pythonGenerator.forBlock.python_print = (block, generator) => `print(${value(generator, block, "VALUE", "''")})\n`;
pythonGenerator.forBlock.python_print_many = (block, generator) => {
  const count = Math.max(1, (block as Blockly.Block & { itemCount_?: number }).itemCount_ ?? 2);
  const values = Array.from({ length: count }, (_, index) => value(generator, block, `ITEM${index}`, "None"));
  const separator = JSON.stringify(String(block.getFieldValue("SEP") ?? " "));
  const ending = JSON.stringify(String(block.getFieldValue("END") ?? "\\n"));
  return `print(${values.join(", ")}, sep=${separator}, end=${ending})\n`;
};
pythonGenerator.forBlock.python_input = (block, generator) => [`input(${value(generator, block, "PROMPT", "''")})`, Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_input_assign = (block, generator) => `${variableName(generator, block, "VAR", "回答")} = input(${value(generator, block, "PROMPT", "''")})\n`;
pythonGenerator.forBlock.python_input_typed_assign = (block, generator) => {
  const type = ["int", "float", "str"].includes(block.getFieldValue("TYPE")) ? block.getFieldValue("TYPE") : "str";
  return `${variableName(generator, block, "VAR", "回答")} = ${type}(input(${value(generator, block, "PROMPT", "''")}))\n`;
};
pythonGenerator.forBlock.python_input_many_assign = (block, generator) => {
  const count = Math.max(1, (block as Blockly.Block & { itemCount_?: number }).itemCount_ ?? 2);
  const names = Array.from({ length: count }, (_, index) => variableName(generator, block, `VAR${index}`, `第${index + 1}项`));
  const separator = String(block.getFieldValue("SEP") ?? "");
  const type = ["str", "int", "float"].includes(block.getFieldValue("TYPE")) ? block.getFieldValue("TYPE") : "str";
  const split = `input(${value(generator, block, "PROMPT", "''")}).split(${separator ? JSON.stringify(separator) : ""})`;
  const source = type === "str" ? split : `map(${type}, ${split})`;
  return `${names.join(", ")} = ${source}\n`;
};
pythonGenerator.forBlock.python_import = (block) => `import ${safeIdentifier(block.getFieldValue("MODULE"), "module")}\n`;
pythonGenerator.forBlock.python_from_import = (block) => `from ${safeIdentifier(block.getFieldValue("MODULE"), "module")} import ${safeIdentifier(block.getFieldValue("NAME"), "name")}\n`;
pythonGenerator.forBlock.python_raw_expression = (block) => [block.getFieldValue("CODE") || "None", Order.ATOMIC];
pythonGenerator.forBlock.python_floor_divide = (block, generator) => [`${value(generator, block, "A", "0", Order.MULTIPLICATIVE)} // ${value(generator, block, "B", "1", Order.MULTIPLICATIVE)}`, Order.MULTIPLICATIVE];
pythonGenerator.forBlock.python_bitwise = (block, generator) => {
  const op = block.getFieldValue("OP");
  const order = op === "&" ? Order.BITWISE_AND : op === "^" ? Order.BITWISE_XOR : op === "|" ? Order.BITWISE_OR : Order.BITWISE_SHIFT;
  return [`${value(generator, block, "A", "0", order)} ${op} ${value(generator, block, "B", "0", order)}`, order];
};
pythonGenerator.forBlock.python_bitwise_not = (block, generator) => [`~${value(generator, block, "VALUE", "0", Order.BITWISE_NOT)}`, Order.BITWISE_NOT];
pythonGenerator.forBlock.python_membership = (block, generator) => [`${value(generator, block, "ITEM", "None", Order.RELATIONAL)} ${block.getFieldValue("OP")} ${value(generator, block, "COLLECTION", "[]", Order.RELATIONAL)}`, Order.RELATIONAL];
pythonGenerator.forBlock.python_identity = (block, generator) => [`${value(generator, block, "A", "None", Order.RELATIONAL)} ${block.getFieldValue("OP")} ${value(generator, block, "B", "None", Order.RELATIONAL)}`, Order.RELATIONAL];
pythonGenerator.forBlock.python_none = () => ["None", Order.ATOMIC];
pythonGenerator.forBlock.python_conditional = (block, generator) => [`${value(generator, block, "TRUE_VALUE", "None", Order.CONDITIONAL)} if ${value(generator, block, "CONDITION", "False", Order.CONDITIONAL)} else ${value(generator, block, "FALSE_VALUE", "None", Order.CONDITIONAL)}`, Order.CONDITIONAL];
pythonGenerator.forBlock.python_call = (block, generator) => [`${safeIdentifier(block.getFieldValue("NAME"), "自定义函数")}(${value(generator, block, "ARG", "")})`, Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_call_statement = (block, generator) => `${safeIdentifier(block.getFieldValue("NAME"), "自定义函数")}(${value(generator, block, "ARG", "")})\n`;
pythonGenerator.forBlock.python_keyword_argument = (block, generator) => [`${safeIdentifier(block.getFieldValue("NAME"), "名称")}=${value(generator, block, "VALUE")}`, Order.ATOMIC];
pythonGenerator.forBlock.python_tuple = (block, generator) => [`(${value(generator, block, "A")}, ${value(generator, block, "B")})`, Order.COLLECTION];
pythonGenerator.forBlock.python_set = (block, generator) => [`{${value(generator, block, "A")}, ${value(generator, block, "B")}}`, Order.COLLECTION];
pythonGenerator.forBlock.python_dict = (block, generator) => [`{${value(generator, block, "K1")}: ${value(generator, block, "V1")}, ${value(generator, block, "K2")}: ${value(generator, block, "V2")}}`, Order.COLLECTION];
pythonGenerator.forBlock.python_index = (block, generator) => [`${value(generator, block, "OBJECT", "None", Order.MEMBER)}[${value(generator, block, "INDEX", "0")}]`, Order.MEMBER];
pythonGenerator.forBlock.python_slice = (block, generator) => [`${value(generator, block, "OBJECT", "None", Order.MEMBER)}[${value(generator, block, "START", "")}:${value(generator, block, "STOP", "")}:${value(generator, block, "STEP", "")}]`, Order.MEMBER];
pythonGenerator.forBlock.python_attribute = (block, generator) => [`${value(generator, block, "OBJECT", "None", Order.MEMBER)}.${safeIdentifier(block.getFieldValue("ATTRIBUTE"), "属性")}`, Order.MEMBER];
pythonGenerator.forBlock.python_method_call = (block, generator) => [`${value(generator, block, "OBJECT", "None", Order.MEMBER)}.${safeIdentifier(block.getFieldValue("METHOD"), "自定义方法")}(${value(generator, block, "ARG", "")})`, Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_method_statement = (block, generator) => `${value(generator, block, "OBJECT")}.${safeIdentifier(block.getFieldValue("METHOD"), "自定义方法")}(${value(generator, block, "ARG", "")})\n`;
pythonGenerator.forBlock.python_new_object = (block, generator) => [`${safeIdentifier(block.getFieldValue("CLASS"), "自定义类")}(${value(generator, block, "ARG", "")})`, Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_return = (block, generator) => `return ${value(generator, block, "VALUE")}\n`;
pythonGenerator.forBlock.python_raise = (block, generator) => `raise ${value(generator, block, "ERROR", "Exception()") }\n`;
pythonGenerator.forBlock.python_try_except = (block, generator) => {
  const tryCode = generator.statementToCode(block, "TRY") || `${generator.INDENT}pass\n`;
  const exceptCode = generator.statementToCode(block, "EXCEPT") || `${generator.INDENT}pass\n`;
  return `try:\n${tryCode}except ${safeIdentifier(block.getFieldValue("ERROR"), "Exception")} as ${variableName(generator, block, "ALIAS", "error")}:\n${exceptCode}`;
};
pythonGenerator.forBlock.python_try_two_except = (block, generator) => `try:\n${suite(generator, block, "TRY")}except ${safeIdentifier(block.getFieldValue("ERROR1"), "ValueError")} as ${safeIdentifier(block.getFieldValue("ALIAS1"), "error")}:\n${suite(generator, block, "EXCEPT1")}except ${safeIdentifier(block.getFieldValue("ERROR2"), "TypeError")} as ${safeIdentifier(block.getFieldValue("ALIAS2"), "error")}:\n${suite(generator, block, "EXCEPT2")}finally:\n${suite(generator, block, "FINALLY")}`;
pythonGenerator.forBlock.python_sequence_collection = (block, generator) => {
  const count = (block as Blockly.Block & { itemCount_?: number }).itemCount_ ?? 0;
  const items = Array.from({ length: count }, (_, i) => value(generator, block, `ITEM${i}`));
  const kind = block.getFieldValue("KIND");
  if (kind === "tuple") return [count === 1 ? `(${items[0]},)` : `(${items.join(", ")})`, Order.COLLECTION];
  if (kind === "set") return [count ? `{${items.join(", ")}}` : "set()", count ? Order.COLLECTION : Order.FUNCTION_CALL];
  return [`[${items.join(", ")}]`, Order.COLLECTION];
};
pythonGenerator.forBlock.python_list_collection = (block, generator) => {
  const count = (block as Blockly.Block & { itemCount_?: number }).itemCount_ ?? 0;
  const items = Array.from({ length: count }, (_, i) => value(generator, block, `ITEM${i}`));
  return [`[${items.join(", ")}]`, Order.COLLECTION];
};
pythonGenerator.forBlock.python_dynamic_dict = (block, generator) => {
  const count = (block as Blockly.Block & { itemCount_?: number }).itemCount_ ?? 0;
  const pairs = Array.from({ length: count }, (_, i) => `${value(generator, block, `KEY${i}`)}: ${value(generator, block, `VALUE${i}`)}`);
  return [`{${pairs.join(", ")}}`, Order.COLLECTION];
};
pythonGenerator.forBlock.python_for_in = (block, generator) => `for ${variableName(generator, block, "VAR", "项目")} in ${value(generator, block, "ITERABLE", "[]")}:\n${suite(generator, block, "DO")}`;
pythonGenerator.forBlock.python_for_enumerate = (block, generator) => `for ${variableName(generator, block, "INDEX", "序号")}, ${variableName(generator, block, "VALUE", "项目")} in enumerate(${value(generator, block, "ITERABLE", "[]")}):\n${suite(generator, block, "DO")}`;
pythonGenerator.forBlock.python_while_else = (block, generator) => `while ${value(generator, block, "CONDITION", "False")}:\n${suite(generator, block, "DO")}else:\n${suite(generator, block, "ELSE")}`;
pythonGenerator.forBlock.python_for_else = (block, generator) => `for ${variableName(generator, block, "VAR", "项目")} in ${value(generator, block, "ITERABLE", "[]")}:\n${suite(generator, block, "DO")}else:\n${suite(generator, block, "ELSE")}`;
pythonGenerator.forBlock.python_pass = () => "pass\n";
pythonGenerator.forBlock.python_assert = (block, generator) => {
  const message = generator.valueToCode(block, "MESSAGE", Order.NONE);
  return `assert ${value(generator, block, "CONDITION", "False")}${message ? `, ${message}` : ""}\n`;
};
pythonGenerator.forBlock.python_scope_declaration = (block) => {
  const names = block.getFieldValue("NAMES").split(",").map((name: string) => safeIdentifier(name, "")).filter(Boolean).join(", ");
  return names ? `${block.getFieldValue("SCOPE")} ${names}\n` : "";
};
pythonGenerator.forBlock.python_function_def = (block, generator) => `def ${safeIdentifier(block.getFieldValue("NAME"), "自定义函数")}(${safeParameters(block.getFieldValue("PARAMS"))}):\n${suite(generator, block, "BODY")}`;
pythonGenerator.forBlock.python_method_def = pythonGenerator.forBlock.python_function_def;
pythonGenerator.forBlock.python_class_def = (block, generator) => {
  const bases = block.getFieldValue("BASES").split(",").map((base: string) => safeIdentifier(base, "object")).join(", ");
  return `class ${safeIdentifier(block.getFieldValue("NAME"), "MyClass")}(${bases || "object"}):\n${suite(generator, block, "BODY")}`;
};
pythonGenerator.forBlock.python_set_attribute = (block, generator) => `${value(generator, block, "OBJECT", "self", Order.MEMBER)}.${safeIdentifier(block.getFieldValue("ATTRIBUTE"), "属性")} = ${value(generator, block, "VALUE")}\n`;
pythonGenerator.forBlock.python_super_call = (block, generator) => `super().${safeIdentifier(block.getFieldValue("METHOD"), "__init__")}(${value(generator, block, "ARG", "")})\n`;
pythonGenerator.forBlock.python_try_full = (block, generator) => `try:\n${suite(generator, block, "TRY")}except ${safeIdentifier(block.getFieldValue("ERROR"), "Exception")} as ${variableName(generator, block, "ALIAS", "error")}:\n${suite(generator, block, "EXCEPT")}else:\n${suite(generator, block, "ELSE")}finally:\n${suite(generator, block, "FINALLY")}`;
pythonGenerator.forBlock.python_with = (block, generator) => `with ${value(generator, block, "CONTEXT")} as ${variableName(generator, block, "ALIAS", "资源")}:\n${suite(generator, block, "BODY")}`;
const optionalValue = (generator: typeof pythonGenerator, block: Blockly.Block, name: string) => generator.valueToCode(block, name, Order.NONE);
pythonGenerator.forBlock.python_range = (block, generator) => {
  const start = optionalValue(generator, block, "START");
  const stop = optionalValue(generator, block, "STOP");
  const step = optionalValue(generator, block, "STEP");
  const values = start && stop ? [start, stop, ...(step ? [step] : [])] : [stop || start || "0"];
  return [`range(${values.join(", ")})`, Order.FUNCTION_CALL];
};
pythonGenerator.forBlock.python_length = (block, generator) => [`len(${value(generator, block, "VALUE")})`, Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_convert = (block, generator) => [`${block.getFieldValue("TYPE")}(${value(generator, block, "VALUE")})`, Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_string_method = (block, generator) => {
  const argument = ["split", "join"].includes(block.getFieldValue("METHOD")) ? optionalValue(generator, block, "ARG") : "";
  return [`${value(generator, block, "TEXT", "''", Order.MEMBER)}.${block.getFieldValue("METHOD")}(${argument})`, Order.FUNCTION_CALL];
};
pythonGenerator.forBlock.python_text_replace = (block, generator) => [
  `${value(generator, block, "TEXT", "''", Order.MEMBER)}.replace(${value(generator, block, "OLD", "''")}, ${value(generator, block, "NEW", "''")})`,
  Order.FUNCTION_CALL,
];
pythonGenerator.forBlock.python_list_method = (block, generator) => {
  const method = block.getFieldValue("METHOD");
  const argument = ["append", "extend", "remove", "pop"].includes(method) ? optionalValue(generator, block, "ARG") : "";
  return `${value(generator, block, "LIST", "[]", Order.MEMBER)}.${method}(${argument})\n`;
};
pythonGenerator.forBlock.python_list_insert = (block, generator) => `${value(generator, block, "LIST", "[]", Order.MEMBER)}.insert(${value(generator, block, "INDEX", "0")}, ${value(generator, block, "VALUE", "None")})\n`;
pythonGenerator.forBlock.python_list_set = (block, generator) => `${value(generator, block, "LIST", "[]", Order.MEMBER)}[${value(generator, block, "INDEX", "0")}] = ${value(generator, block, "VALUE", "None")}\n`;
const listSliceCode = (block: Blockly.Block, generator: typeof pythonGenerator) => {
  const start = optionalValue(generator, block, "START");
  const stop = optionalValue(generator, block, "STOP");
  const step = optionalValue(generator, block, "STEP");
  return `${value(generator, block, "LIST", "[]", Order.MEMBER)}[${start}:${stop}:${step}]`;
};
pythonGenerator.forBlock.python_list_slice_set = (block, generator) => `${listSliceCode(block, generator)} = ${value(generator, block, "VALUES", "[]")}\n`;
pythonGenerator.forBlock.python_list_slice_delete = (block, generator) => `del ${listSliceCode(block, generator)}\n`;
pythonGenerator.forBlock.python_sequence_query = (block, generator) => [
  `${value(generator, block, "SEQUENCE", "[]", Order.MEMBER)}.${block.getFieldValue("METHOD")}(${value(generator, block, "VALUE", "None")})`,
  Order.FUNCTION_CALL,
];
pythonGenerator.forBlock.python_sequence_combine = (block, generator) => {
  const sequence = value(generator, block, "SEQUENCE", "[]", Order.ADDITIVE);
  const operation = block.getFieldValue("OPERATION");
  if (operation === "repeat") return [`${sequence} * ${value(generator, block, "OTHER", "1", Order.MULTIPLICATIVE)}`, Order.MULTIPLICATIVE];
  return [`${sequence} + ${value(generator, block, "OTHER", "[]", Order.ADDITIVE)}`, Order.ADDITIVE];
};
pythonGenerator.forBlock.python_list_copy = (block, generator) => [`${value(generator, block, "LIST", "[]", Order.MEMBER)}.copy()`, Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_set_operation = (block, generator) => [
  `${value(generator, block, "LEFT", "set()", Order.MEMBER)}.${block.getFieldValue("OPERATION")}(${value(generator, block, "RIGHT", "set()")})`,
  Order.FUNCTION_CALL,
];
pythonGenerator.forBlock.python_set_relation = (block, generator) => {
  const left = value(generator, block, "LEFT", "set()", Order.RELATIONAL);
  const right = value(generator, block, "RIGHT", "set()", Order.RELATIONAL);
  const relation = block.getFieldValue("RELATION");
  if (relation === "proper_subset") return [`${left} < ${right}`, Order.RELATIONAL];
  if (relation === "proper_superset") return [`${left} > ${right}`, Order.RELATIONAL];
  const method = relation === "superset" ? "issuperset" : relation === "disjoint" ? "isdisjoint" : "issubset";
  return [`${left}.${method}(${right})`, Order.FUNCTION_CALL];
};
pythonGenerator.forBlock.python_set_method = (block, generator) => {
  const method = block.getFieldValue("METHOD");
  const argument = ["add", "update", "remove", "discard"].includes(method) ? value(generator, block, "ARG", "None") : "";
  return `${value(generator, block, "SET", "set()", Order.MEMBER)}.${method}(${argument})\n`;
};
pythonGenerator.forBlock.python_set_copy = (block, generator) => [`${value(generator, block, "SET", "set()", Order.MEMBER)}.copy()`, Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_dict_get = (block, generator) => {
  const fallback = optionalValue(generator, block, "DEFAULT");
  return [`${value(generator, block, "DICT", "{}", Order.MEMBER)}.get(${value(generator, block, "KEY")}${fallback ? `, ${fallback}` : ""})`, Order.FUNCTION_CALL];
};
pythonGenerator.forBlock.python_dict_set = (block, generator) => `${value(generator, block, "DICT", "{}", Order.MEMBER)}[${value(generator, block, "KEY", "''")}] = ${value(generator, block, "VALUE", "None")}\n`;
pythonGenerator.forBlock.python_dict_remove = (block, generator) => `${value(generator, block, "DICT", "{}", Order.MEMBER)}.pop(${value(generator, block, "KEY", "''")}, None)\n`;
pythonGenerator.forBlock.python_dict_view = (block, generator) => [`${value(generator, block, "DICT", "{}", Order.MEMBER)}.${block.getFieldValue("METHOD")}()`, Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_dict_method = (block, generator) => {
  const method = block.getFieldValue("METHOD");
  const argument = method === "update" ? value(generator, block, "OTHER", "{}") : "";
  return `${value(generator, block, "DICT", "{}", Order.MEMBER)}.${method}(${argument})\n`;
};
pythonGenerator.forBlock.python_dict_query = (block, generator) => {
  const dictionary = value(generator, block, "DICT", "{}", Order.MEMBER);
  const method = block.getFieldValue("METHOD");
  if (method === "copy" || method === "popitem") return [`${dictionary}.${method}()`, Order.FUNCTION_CALL];
  const key = value(generator, block, "KEY", "''");
  const fallback = optionalValue(generator, block, "DEFAULT");
  return [`${dictionary}.${method}(${key}${fallback ? `, ${fallback}` : ""})`, Order.FUNCTION_CALL];
};
pythonGenerator.forBlock.python_dict_fromkeys = (block, generator) => {
  const initialValue = optionalValue(generator, block, "VALUE");
  return [`dict.fromkeys(${value(generator, block, "KEYS", "[]")}${initialValue ? `, ${initialValue}` : ""})`, Order.FUNCTION_CALL];
};
pythonGenerator.forBlock.python_file_read_text = (block, generator) => {
  const encoding = String(block.getFieldValue("ENCODING") || "").trim();
  const options = encoding ? `encoding=${JSON.stringify(encoding)}` : "";
  return [`${standardLibraryCall(block, "pathlib", "Path")}(${value(generator, block, "PATH", "''")}).read_text(${options})`, Order.FUNCTION_CALL];
};
pythonGenerator.forBlock.python_file_write_text = (block, generator) => {
  const mode = block.getFieldValue("MODE") === "a" ? "a" : "w";
  const encoding = String(block.getFieldValue("ENCODING") || "").trim();
  const encodingArgument = encoding ? `, encoding=${JSON.stringify(encoding)}` : "";
  return `with open(${value(generator, block, "PATH", "''")}, ${JSON.stringify(mode)}${encodingArgument}) as 文件:\n${generator.INDENT}文件.write(${value(generator, block, "VALUE", "''")})\n`;
};
pythonGenerator.forBlock.python_open_file = (block, generator) => {
  const mode = block.getFieldValue("MODE");
  const encoding = block.getFieldValue("ENCODING").trim();
  const encodingArgument = mode.includes("b") || !encoding ? "" : `, encoding=${JSON.stringify(encoding)}`;
  return [`open(${value(generator, block, "PATH", "''")}, ${JSON.stringify(mode)}${encodingArgument})`, Order.FUNCTION_CALL];
};
pythonGenerator.forBlock.python_file_read = (block, generator) => {
  const size = optionalValue(generator, block, "SIZE");
  const method = ["read", "readline", "readlines"].includes(block.getFieldValue("METHOD")) ? block.getFieldValue("METHOD") : "read";
  return [`${value(generator, block, "FILE", "文件", Order.MEMBER)}.${method}(${size})`, Order.FUNCTION_CALL];
};
pythonGenerator.forBlock.python_file_write = (block, generator) => {
  const method = block.getFieldValue("METHOD") === "writelines" ? "writelines" : "write";
  return `${value(generator, block, "FILE", "文件", Order.MEMBER)}.${method}(${value(generator, block, "VALUE", "''")})\n`;
};
pythonGenerator.forBlock.python_file_tell = (block, generator) => [`${value(generator, block, "FILE", "文件", Order.MEMBER)}.tell()`, Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_file_seek = (block, generator) => `${value(generator, block, "FILE", "文件", Order.MEMBER)}.seek(${value(generator, block, "OFFSET", "0")}, ${block.getFieldValue("WHENCE") || "0"})\n`;
pythonGenerator.forBlock.python_file_control = (block, generator) => {
  const action = block.getFieldValue("ACTION") === "close" ? "close" : "flush";
  return `${value(generator, block, "FILE", "文件", Order.MEMBER)}.${action}()\n`;
};
pythonGenerator.forBlock.python_file_exists = (block, generator) => [`${standardLibraryCall(block, "pathlib", "Path")}(${value(generator, block, "PATH", "''")}).is_file()`, Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_directory_exists = (block, generator) => [`${standardLibraryCall(block, "pathlib", "Path")}(${value(generator, block, "PATH", "''")}).is_dir()`, Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_path_info = (block, generator) => {
  const path = `${standardLibraryCall(block, "pathlib", "Path")}(${value(generator, block, "PATH", "''")})`;
  switch (block.getFieldValue("INFO")) {
    case "stem": return [`${path}.stem`, Order.MEMBER];
    case "suffix": return [`${path}.suffix`, Order.MEMBER];
    case "parent": return [`str(${path}.parent)`, Order.FUNCTION_CALL];
    case "resolve": return [`str(${path}.resolve())`, Order.FUNCTION_CALL];
    case "size": return [`${path}.stat().st_size`, Order.MEMBER];
    default: return [`${path}.name`, Order.MEMBER];
  }
};
pythonGenerator.forBlock.python_file_copy = (block, generator) => `${standardLibraryCall(block, "shutil", "copy2")}(${value(generator, block, "SOURCE", "''")}, ${value(generator, block, "TARGET", "''")})\n`;
pythonGenerator.forBlock.python_file_move = (block, generator) => `${standardLibraryCall(block, "shutil", "move")}(${value(generator, block, "SOURCE", "''")}, ${value(generator, block, "TARGET", "''")})\n`;
pythonGenerator.forBlock.python_file_delete = (block, generator) => `${standardLibraryCall(block, "pathlib", "Path")}(${value(generator, block, "PATH", "''")}).unlink(missing_ok=${block.getFieldValue("MISSING_OK") || "True"})\n`;
pythonGenerator.forBlock.python_directory_find = (block, generator) => {
  const path = `${standardLibraryCall(block, "pathlib", "Path")}(${value(generator, block, "PATH", "'.'")})`;
  const method = block.getFieldValue("SCOPE") === "recursive" ? "rglob" : "glob";
  return [`[str(匹配路径) for 匹配路径 in ${path}.${method}(${value(generator, block, "PATTERN", "'*'")})]`, Order.COLLECTION];
};
pythonGenerator.forBlock.python_directory_copy = (block, generator) => {
  const targetParent = value(generator, block, "TARGET", "'.'");
  const directoryName = String(block.getFieldValue("DIRECTORY_NAME") || "").trim();
  const target = directoryName
    ? `${standardLibraryCall(block, "os", "path.join")}(${targetParent}, ${JSON.stringify(directoryName)})`
    : targetParent;
  return `${standardLibraryCall(block, "shutil", "copytree")}(${value(generator, block, "SOURCE", "''")}, ${target}, dirs_exist_ok=${block.getFieldValue("EXIST_OK") || "True"})\n`;
};
pythonGenerator.forBlock.python_directory_move = (block, generator) => {
  const targetParent = value(generator, block, "TARGET", "'.'");
  const directoryName = String(block.getFieldValue("DIRECTORY_NAME") || "").trim();
  const target = directoryName
    ? `${standardLibraryCall(block, "os", "path.join")}(${targetParent}, ${JSON.stringify(directoryName)})`
    : targetParent;
  return `${standardLibraryCall(block, "shutil", "move")}(${value(generator, block, "SOURCE", "''")}, ${target})\n`;
};
pythonGenerator.forBlock.python_directory_remove = (block, generator) => block.getFieldValue("REMOVE_MODE") === "tree"
  ? `${standardLibraryCall(block, "shutil", "rmtree")}(${value(generator, block, "PATH", "''")})\n`
  : `${standardLibraryCall(block, "pathlib", "Path")}(${value(generator, block, "PATH", "''")}).rmdir()\n`;
const comprehensionCondition = (generator: typeof pythonGenerator, block: Blockly.Block) => {
  const condition = generator.valueToCode(block, "CONDITION", Order.NONE);
  return condition ? ` if ${condition}` : "";
};
pythonGenerator.forBlock.python_list_comprehension = (block, generator) => [`[${value(generator, block, "EXPRESSION")} for ${safeIdentifier(block.getFieldValue("VAR"), "项目")} in ${value(generator, block, "ITERABLE", "[]")}${comprehensionCondition(generator, block)}]`, Order.COLLECTION];
pythonGenerator.forBlock.python_set_comprehension = (block, generator) => [`{${value(generator, block, "EXPRESSION")} for ${safeIdentifier(block.getFieldValue("VAR"), "项目")} in ${value(generator, block, "ITERABLE", "[]")}${comprehensionCondition(generator, block)}}`, Order.COLLECTION];
pythonGenerator.forBlock.python_dict_comprehension = (block, generator) => [`{${value(generator, block, "KEY")}: ${value(generator, block, "VALUE")} for ${safeIdentifier(block.getFieldValue("VAR"), "项目")} in ${value(generator, block, "ITERABLE", "[]")}${comprehensionCondition(generator, block)}}`, Order.COLLECTION];
pythonGenerator.forBlock.python_lambda = (block, generator) => [`lambda ${safeParameters(block.getFieldValue("PARAMS"))}: ${value(generator, block, "EXPRESSION")}`, Order.LAMBDA];
pythonGenerator.forBlock.python_decorated_definition = (block, generator) => {
  const definition = generator.statementToCode(block, "DEFINITION") || `${generator.INDENT}pass\n`;
  const unindented = definition.replace(new RegExp(`^${generator.INDENT}`, "gm"), "");
  const adjacentDefinition = unindented.replace(/^# __visual_python_block_.+?__\n/, "");
  return `@${value(generator, block, "DECORATOR", "decorator")}\n${adjacentDefinition}`;
};
const structuredParameters = (block: Blockly.Block, generator: typeof pythonGenerator) => {
  const specs = (block as Blockly.Block & { parameters_?: ParameterSpec[] }).parameters_ ?? [];
  const parameters: string[] = [];
  let hasArgs = false;
  let keywordSeparatorAdded = false;
  specs.forEach((spec, i) => {
    const name = safeIdentifier(block.getFieldValue(`PARAM_NAME${i}`) || spec.name, "数值");
    const annotationValue = block.getFieldValue(`PARAM_TYPE${i}`) || spec.annotation;
    const annotation = annotationValue ? `: ${safeAnnotation(annotationValue)}` : "";
    if ((spec.kind === "keyword_only" || spec.kind === "keyword_only_default") && !hasArgs && !keywordSeparatorAdded) {
      parameters.push("*");
      keywordSeparatorAdded = true;
    }
    if (spec.kind === "args") {
      parameters.push(`*${name}${annotation}`);
      hasArgs = true;
    } else if (spec.kind === "kwargs") {
      parameters.push(`**${name}${annotation}`);
    } else if (spec.kind === "default" || spec.kind === "keyword_only_default") {
      parameters.push(`${name}${annotation}=${value(generator, block, `PARAM${i}`)}`);
    } else {
      parameters.push(`${name}${annotation}`);
    }
    if (spec.kind === "positional_only" && specs[i + 1]?.kind !== "positional_only") parameters.push("/");
  });
  return parameters.join(", ");
};
pythonGenerator.forBlock.python_function_structured = (block, generator) => `def ${safeIdentifier(block.getFieldValue("NAME"), "自定义函数")}(${structuredParameters(block, generator)}):\n${suite(generator, block, "BODY")}`;
pythonGenerator.forBlock.python_method_structured = pythonGenerator.forBlock.python_function_structured;
pythonGenerator.forBlock.python_async_function_structured = (block, generator) => `async def ${safeIdentifier(block.getFieldValue("NAME"), "自定义函数")}(${structuredParameters(block, generator)}):\n${suite(generator, block, "BODY")}`;
pythonGenerator.forBlock.python_typed_function_structured = (block, generator) => `def ${safeIdentifier(block.getFieldValue("NAME"), "自定义函数")}(${structuredParameters(block, generator)}) -> ${safeAnnotation(block.getFieldValue("RETURN_TYPE"), "None")}:\n${suite(generator, block, "BODY")}`;
pythonGenerator.forBlock.python_async_typed_function_structured = (block, generator) => `async def ${safeIdentifier(block.getFieldValue("NAME"), "自定义函数")}(${structuredParameters(block, generator)}) -> ${safeAnnotation(block.getFieldValue("RETURN_TYPE"), "None")}:\n${suite(generator, block, "BODY")}`;
const structuredArguments = (block: Blockly.Block, generator: typeof pythonGenerator) => {
  const specs = (block as Blockly.Block & { arguments_?: ArgumentSpec[] }).arguments_ ?? [];
  return specs.map((spec, i) => {
    const argument = value(generator, block, `ARG${i}`);
    if (spec.kind === "keyword") return `${safeIdentifier(block.getFieldValue(`ARG_NAME${i}`) || spec.name, "名称")}=${argument}`;
    if (spec.kind === "star") return `*${argument}`;
    if (spec.kind === "kwargs") return `**${argument}`;
    return argument;
  }).join(", ");
};
const structuredCallCode = (block: Blockly.Block, generator: typeof pythonGenerator) => `${safeIdentifier(block.getFieldValue("TARGET"), "自定义函数")}(${structuredArguments(block, generator)})`;
pythonGenerator.forBlock.python_call_structured = (block, generator) => [structuredCallCode(block, generator), Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_call_statement_structured = (block, generator) => `${structuredCallCode(block, generator)}\n`;
pythonGenerator.forBlock.python_method_call_structured = pythonGenerator.forBlock.python_call_structured;
pythonGenerator.forBlock.python_method_statement_structured = pythonGenerator.forBlock.python_call_statement_structured;
pythonGenerator.forBlock.python_new_object_structured = pythonGenerator.forBlock.python_call_structured;

const numberShadow = (value: number) => ({ shadow: { type: "math_number", fields: { NUM: value } } });
const textShadow = (value: string) => ({ shadow: { type: "text", fields: { TEXT: value } } });
const booleanShadow = (value: "TRUE" | "FALSE") => ({ shadow: { type: "logic_boolean", fields: { BOOL: value } } });
const toolboxVariableField = (name: string) => ({ id: `toolbox-variable-${name}`, name });
const variableShadow = (name: string) => ({ shadow: { type: "variables_get", fields: { VAR: toolboxVariableField(name) } } });
const listShadow = (values: number[] = []) => ({
  block: {
    type: "python_list_collection",
    extraState: { itemCount: values.length },
    inputs: Object.fromEntries(values.map((item, index) => [`ITEM${index}`, numberShadow(item)])),
  },
});
const tupleShadow = (values: number[] = []) => ({
  block: {
    type: "python_sequence_collection",
    fields: { KIND: "tuple" },
    extraState: { itemCount: values.length },
    inputs: Object.fromEntries(values.map((item, index) => [`ITEM${index}`, numberShadow(item)])),
  },
});
const setShadow = (values: number[] = []) => ({
  block: {
    type: "python_sequence_collection",
    fields: { KIND: "set" },
    extraState: { itemCount: values.length },
    inputs: Object.fromEntries(values.map((item, index) => [`ITEM${index}`, numberShadow(item)])),
  },
});
const textListShadow = (values: string[]) => ({
  block: {
    type: "python_list_collection",
    extraState: { itemCount: values.length },
    inputs: Object.fromEntries(values.map((item, index) => [`ITEM${index}`, textShadow(item)])),
  },
});
const toolboxSectionLabel = (text: string) => ({
  kind: "label",
  text,
  "web-class": "python-standard-library-label",
}) as unknown as Blockly.utils.toolbox.FlyoutItemInfo;
const collectionToolboxBlock = (kind: "list" | "tuple" | "set", values: number[]) => ({
  kind: "block" as const,
  type: "python_sequence_collection",
  fields: { KIND: kind },
  extraState: { itemCount: values.length },
  inputs: Object.fromEntries(values.map((item, index) => [`ITEM${index}`, numberShadow(item)])),
});
const dictionaryShadow = () => ({
  shadow: {
    type: "python_dynamic_dict",
    extraState: { itemCount: 1 },
    inputs: { KEY0: textShadow("名称"), VALUE0: textShadow("示例") },
  },
});

export const toolbox: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: "categoryToolbox",
  contents: [
    { kind: "category", name: "输入输出", colour: "#2f9e8f", contents: [
      toolboxSectionLabel("基础输出"),
      { kind: "block", type: "python_print", inputs: { VALUE: textShadow("你好，世界") } },
      { kind: "sep", gap: 20 },
      toolboxSectionLabel("多值输出"),
      { kind: "block", type: "python_print_many", extraState: { itemCount: 2 }, fields: { SEP: " | ", END: "\\n" }, inputs: { ITEM0: textShadow("姓名"), ITEM1: numberShadow(95) } },
      { kind: "sep", gap: 20 },
      toolboxSectionLabel("用户输入"),
      { kind: "block", type: "python_input_assign", inputs: { PROMPT: textShadow("请输入：") } },
      { kind: "block", type: "python_input", inputs: { PROMPT: textShadow("请输入：") } },
      { kind: "block", type: "python_input_typed_assign", fields: { TYPE: "int" }, inputs: { PROMPT: textShadow("请输入数字：") } },
      { kind: "block", type: "python_input_many_assign", extraState: { itemCount: 2, variables: ["第一个数", "第二个数"] }, fields: { SEP: "", TYPE: "int" }, inputs: { PROMPT: textShadow("请输入两个数字：") } },
      { kind: "sep", gap: 20 },
      toolboxSectionLabel("类型处理"),
      { kind: "block", type: "python_length", inputs: { VALUE: textShadow("示例文本") } },
      { kind: "block", type: "python_convert", fields: { TYPE: "int" }, inputs: { VALUE: textShadow("42") } },
    ] },
    { kind: "category", name: "赋值", colour: "#b95073", contents: [...pythonSyntaxToolbox.assignment] },
    { kind: "category", name: "逻辑", categorystyle: "logic_category", contents: [
      { kind: "block", type: "controls_if", inputs: { IF0: booleanShadow("TRUE") } },
      { kind: "block", type: "logic_compare", inputs: { A: numberShadow(0), B: numberShadow(10) } },
      { kind: "block", type: "logic_operation", inputs: { A: booleanShadow("TRUE"), B: booleanShadow("FALSE") } },
      { kind: "block", type: "logic_negate", inputs: { BOOL: booleanShadow("TRUE") } },
      { kind: "block", type: "logic_boolean" },
      { kind: "block", type: "python_membership", inputs: { ITEM: textShadow("Python"), COLLECTION: textListShadow(["Python", "Blockly"]) } },
      { kind: "block", type: "python_conditional", inputs: { CONDITION: booleanShadow("TRUE"), TRUE_VALUE: textShadow("成立"), FALSE_VALUE: textShadow("不成立") } },
      { kind: "block", type: "python_none" },
      { kind: "block", type: "python_identity", inputs: { A: variableShadow("数值"), B: { shadow: { type: "python_none" } } } },
      ...pythonSyntaxToolbox.logic,
    ] },
    { kind: "category", name: "循环", categorystyle: "loop_category", contents: [
      { kind: "block", type: "controls_repeat_ext", inputs: { TIMES: numberShadow(10) } },
      { kind: "block", type: "python_for_in", inputs: { ITERABLE: listShadow([1, 2, 3]) } },
      { kind: "block", type: "python_range", inputs: { START: numberShadow(0), STOP: numberShadow(10), STEP: numberShadow(1) } },
      { kind: "block", type: "controls_whileUntil", inputs: { BOOL: booleanShadow("TRUE") } },
      { kind: "block", type: "python_for_enumerate", inputs: { ITERABLE: listShadow([1, 2, 3]) } },
      { kind: "block", type: "controls_for", inputs: { FROM: numberShadow(0), TO: numberShadow(10), BY: numberShadow(1) } },
      { kind: "block", type: "controls_flow_statements" },
      { kind: "block", type: "python_for_else", inputs: { ITERABLE: listShadow() } },
      { kind: "block", type: "python_while_else", inputs: { CONDITION: booleanShadow("TRUE") } },
      { kind: "block", type: "python_pass" },
    ] },
    { kind: "category", name: "数学", categorystyle: "math_category", contents: [
      toolboxSectionLabel("基础计算"),
      { kind: "block", type: "math_number", fields: { NUM: 0 } },
      { kind: "block", type: "math_arithmetic", fields: { OP: "ADD" }, inputs: { A: numberShadow(1), B: numberShadow(1) } },
      { kind: "block", type: "python_floor_divide", inputs: { A: numberShadow(7), B: numberShadow(3) } },
      { kind: "block", type: "math_modulo", inputs: { DIVIDEND: numberShadow(7), DIVISOR: numberShadow(3) } },
      { kind: "block", type: "math_single", fields: { OP: "ROOT" }, inputs: { NUM: numberShadow(9) } },
      { kind: "block", type: "math_round", fields: { OP: "ROUND" }, inputs: { NUM: numberShadow(3.6) } },
      { kind: "block", type: "math_constant", fields: { CONSTANT: "PI" } },
      { kind: "block", type: "math_constrain", inputs: { VALUE: numberShadow(15), LOW: numberShadow(0), HIGH: numberShadow(10) } },
      { kind: "sep", gap: 20 },
      toolboxSectionLabel("随机与统计"),
      { kind: "block", type: "math_random_int", inputs: { FROM: numberShadow(1), TO: numberShadow(10) } },
      { kind: "block", type: "math_random_float" },
      { kind: "block", type: "math_on_list", fields: { OP: "SUM" }, inputs: { LIST: listShadow([1, 2, 3]) } },
      { kind: "sep", gap: 20 },
      toolboxSectionLabel("进阶运算"),
      { kind: "block", type: "python_bitwise", fields: { OP: "&" }, inputs: { A: numberShadow(5), B: numberShadow(3) } },
      { kind: "block", type: "python_bitwise_not", inputs: { VALUE: numberShadow(5) } },
      ...pythonSyntaxToolbox.math,
    ] },
    { kind: "category", name: "文本", categorystyle: "text_category", contents: [
      { kind: "block", type: "text", fields: { TEXT: "你好，世界" } },
      { kind: "block", type: "text_join", extraState: { itemCount: 2 }, inputs: { ADD0: textShadow("你好，"), ADD1: textShadow("世界") } },
      { kind: "block", type: "text_length", inputs: { VALUE: textShadow("示例文本") } },
      { kind: "block", type: "python_string_method", fields: { METHOD: "upper" }, inputs: { TEXT: textShadow("Python") } },
      { kind: "block", type: "python_text_replace", inputs: { TEXT: textShadow("你好，世界"), OLD: textShadow("世界"), NEW: textShadow("Python") } },
      ...pythonSyntaxToolbox.text,
    ] },
    { kind: "category", name: "集合", colour: "#7657b5", contents: [
      toolboxSectionLabel("创建"),
      collectionToolboxBlock("list", [1, 2, 3]),
      collectionToolboxBlock("tuple", [1, 2]),
      collectionToolboxBlock("set", [1, 2]),
      { kind: "block", type: "python_dynamic_dict", extraState: { itemCount: 1 }, inputs: { KEY0: textShadow("名称"), VALUE0: textShadow("示例") } },
      toolboxSectionLabel("列表与元组"),
      { kind: "block", type: "python_list_method", fields: { METHOD: "append" }, inputs: { LIST: listShadow([1, 2]), ARG: numberShadow(3) } },
      { kind: "block", type: "python_list_insert", inputs: { LIST: listShadow([1, 3]), INDEX: numberShadow(1), VALUE: numberShadow(2) } },
      { kind: "block", type: "python_list_set", inputs: { LIST: listShadow([1, 2, 3]), INDEX: numberShadow(0), VALUE: numberShadow(10) } },
      { kind: "block", type: "python_list_slice_set", inputs: { LIST: listShadow([1, 2, 3, 4]), START: numberShadow(1), STOP: numberShadow(3), STEP: numberShadow(1), VALUES: listShadow([20, 30]) } },
      { kind: "block", type: "python_list_slice_delete", inputs: { LIST: listShadow([1, 2, 3, 4]), START: numberShadow(1), STOP: numberShadow(3), STEP: numberShadow(1) } },
      { kind: "block", type: "python_sequence_query", fields: { METHOD: "count" }, inputs: { SEQUENCE: listShadow([1, 2, 1]), VALUE: numberShadow(1) } },
      { kind: "block", type: "python_sequence_query", fields: { METHOD: "index" }, inputs: { SEQUENCE: tupleShadow([10, 20, 30]), VALUE: numberShadow(20) } },
      { kind: "block", type: "python_sequence_combine", fields: { OPERATION: "concat" }, inputs: { SEQUENCE: listShadow([1, 2]), OTHER: listShadow([3, 4]) } },
      { kind: "block", type: "python_list_copy", inputs: { LIST: listShadow([1, 2, 3]) } },
      { kind: "block", type: "python_index", inputs: { OBJECT: listShadow([1, 2, 3]), INDEX: numberShadow(0) } },
      { kind: "block", type: "python_slice", inputs: { OBJECT: listShadow([1, 2, 3]), START: numberShadow(0), STOP: numberShadow(2), STEP: numberShadow(1) } },
      toolboxSectionLabel("集合运算与修改"),
      { kind: "block", type: "python_set_operation", fields: { OPERATION: "union" }, inputs: { LEFT: setShadow([1, 2]), RIGHT: setShadow([2, 3]) } },
      { kind: "block", type: "python_set_relation", fields: { RELATION: "subset" }, inputs: { LEFT: setShadow([1, 2]), RIGHT: setShadow([1, 2, 3]) } },
      { kind: "block", type: "python_set_method", fields: { METHOD: "add" }, inputs: { SET: setShadow([1, 2]), ARG: numberShadow(3) } },
      { kind: "block", type: "python_set_copy", inputs: { SET: setShadow([1, 2, 3]) } },
      toolboxSectionLabel("字典"),
      { kind: "block", type: "python_dict_get", inputs: { DICT: dictionaryShadow(), KEY: textShadow("名称"), DEFAULT: textShadow("") } },
      { kind: "block", type: "python_dict_set", inputs: { DICT: dictionaryShadow(), KEY: textShadow("名称"), VALUE: textShadow("新值") } },
      { kind: "block", type: "python_dict_remove", inputs: { DICT: dictionaryShadow(), KEY: textShadow("名称") } },
      { kind: "block", type: "python_dict_view", fields: { METHOD: "keys" }, inputs: { DICT: dictionaryShadow() } },
      { kind: "block", type: "python_dict_method", fields: { METHOD: "update" }, inputs: { DICT: dictionaryShadow(), OTHER: dictionaryShadow() } },
      { kind: "block", type: "python_dict_query", fields: { METHOD: "copy" }, inputs: { DICT: dictionaryShadow() } },
      { kind: "block", type: "python_dict_fromkeys", inputs: { KEYS: textListShadow(["名称", "语言"]), VALUE: textShadow("") } },
      { kind: "sep", gap: 20 },
      toolboxSectionLabel("推导式"),
      { kind: "block", type: "python_list_comprehension", fields: { VAR: "项目" }, inputs: { EXPRESSION: { shadow: { type: "python_raw_expression", fields: { CODE: "项目 * 2" } } }, ITERABLE: listShadow([1, 2, 3]) } },
      { kind: "block", type: "python_set_comprehension", fields: { VAR: "项目" }, inputs: { EXPRESSION: { shadow: { type: "python_raw_expression", fields: { CODE: "项目" } } }, ITERABLE: listShadow([1, 2, 2, 3]) } },
      { kind: "block", type: "python_dict_comprehension", fields: { VAR: "项目" }, inputs: { KEY: { shadow: { type: "python_raw_expression", fields: { CODE: "项目" } } }, VALUE: { shadow: { type: "python_raw_expression", fields: { CODE: "项目 * 2" } } }, ITERABLE: listShadow([1, 2, 3]) } },
    ] },
    { kind: "category", name: "内置函数", colour: "#397bc0", contents: [...pythonSyntaxToolbox.builtins] },
    { kind: "category", name: "变量", categorystyle: "variable_category", custom: "USED_VARIABLES" },
    { kind: "category", name: "函数", categorystyle: "procedure_category", contents: [
      toolboxSectionLabel("常用"),
      { kind: "block", type: "python_function_structured" },
      { kind: "block", type: "python_return", inputs: { VALUE: numberShadow(0) } },
      { kind: "block", type: "python_return_none" },
      { kind: "block", type: "python_lambda", inputs: { EXPRESSION: { shadow: { type: "python_raw_expression", fields: { CODE: "数值" } } } } },
      { kind: "sep", gap: 20 },
      toolboxSectionLabel("进阶"),
      { kind: "block", type: "python_typed_function_structured" },
      { kind: "block", type: "python_decorated_definition", inputs: {
        DECORATOR: { shadow: { type: "python_functools_cache" } },
        DEFINITION: { block: {
          type: "python_function_structured", fields: { NAME: "计算", PARAM_NAME0: "数值" }, extraState: { parameters: [{ kind: "positional", name: "数值" }] },
          inputs: { BODY: { block: { type: "python_return", inputs: { VALUE: { shadow: { type: "python_raw_expression", fields: { CODE: "数值" } } } } } } },
        } },
      } },
      { kind: "block", type: "python_scope_declaration" },
      ...pythonSyntaxToolbox.function,
    ] },
    { kind: "category", name: "调用", colour: "#397bc0", custom: "DEFINED_FUNCTION_CALLS" },
    { kind: "category", name: "文件", colour: colours.file, contents: [
      toolboxSectionLabel("快捷读写"),
      { kind: "block", type: "python_file_read_text", fields: { ENCODING: "utf-8" }, inputs: { PATH: textShadow("data.txt") } },
      { kind: "block", type: "python_file_write_text", fields: { MODE: "w", ENCODING: "utf-8" }, inputs: { VALUE: textShadow("示例内容"), PATH: textShadow("output.txt") } },
      { kind: "block", type: "python_file_write_text", fields: { MODE: "a", ENCODING: "utf-8" }, inputs: { VALUE: textShadow("追加内容"), PATH: textShadow("output.txt") } },
      { kind: "sep", gap: 20 },
      toolboxSectionLabel("安全打开"),
      { kind: "block", type: "python_with", fields: { ALIAS: toolboxVariableField("文件") }, inputs: {
        CONTEXT: { shadow: { type: "python_open_file", fields: { MODE: "r", ENCODING: "utf-8" }, inputs: { PATH: textShadow("data.txt") } } },
        BODY: { block: { type: "variables_set", fields: { VAR: toolboxVariableField("文件内容") }, inputs: { VALUE: { block: { type: "python_file_read", fields: { METHOD: "read" }, inputs: { FILE: variableShadow("文件") } } } } } },
      } },
      { kind: "block", type: "python_with", fields: { ALIAS: toolboxVariableField("文件") }, inputs: {
        CONTEXT: { shadow: { type: "python_open_file", fields: { MODE: "w", ENCODING: "utf-8" }, inputs: { PATH: textShadow("output.txt") } } },
        BODY: { block: { type: "python_file_write", fields: { METHOD: "write" }, inputs: { FILE: variableShadow("文件"), VALUE: textShadow("示例内容") } } },
      } },
      { kind: "sep", gap: 20 },
      toolboxSectionLabel("文件对象"),
      { kind: "block", type: "python_open_file", fields: { MODE: "r", ENCODING: "utf-8" }, inputs: { PATH: textShadow("data.txt") } },
      { kind: "block", type: "python_file_read", fields: { METHOD: "read" }, inputs: { FILE: variableShadow("文件") } },
      { kind: "block", type: "python_file_write", fields: { METHOD: "write" }, inputs: { FILE: variableShadow("文件"), VALUE: textShadow("示例内容") } },
      { kind: "block", type: "python_file_tell", inputs: { FILE: variableShadow("文件") } },
      { kind: "block", type: "python_file_seek", fields: { WHENCE: "0" }, inputs: { FILE: variableShadow("文件"), OFFSET: numberShadow(0) } },
      { kind: "block", type: "python_file_control", fields: { ACTION: "flush" }, inputs: { FILE: variableShadow("文件") } },
      { kind: "sep", gap: 20 },
      toolboxSectionLabel("查询与查找"),
      { kind: "block", type: "python_file_exists", inputs: { PATH: textShadow("data.txt") } },
      { kind: "block", type: "python_directory_exists", inputs: { PATH: textShadow("data") } },
      { kind: "block", type: "python_path_info", fields: { PATH_KIND: "file", INFO: "name" }, inputs: { PATH: textShadow("data.txt") } },
      { kind: "block", type: "python_os_listdir", fields: { FILTER: "all" }, inputs: { PATH: textShadow(".") } },
      { kind: "block", type: "python_directory_find", fields: { SCOPE: "recursive" }, inputs: { PATH: textShadow("."), PATTERN: textShadow("*.txt") } },
      { kind: "sep", gap: 20 },
      toolboxSectionLabel("文件管理"),
      { kind: "block", type: "python_file_copy", inputs: { SOURCE: textShadow("source.txt"), TARGET: textShadow("copy.txt") } },
      { kind: "block", type: "python_file_move", fields: { PATH_KIND: "file" }, inputs: { SOURCE: textShadow("old.txt"), TARGET: textShadow("new.txt") } },
      { kind: "block", type: "python_file_delete", fields: { MISSING_OK: "True" }, inputs: { PATH: textShadow("data.txt") } },
      { kind: "sep", gap: 20 },
      toolboxSectionLabel("目录操作"),
      { kind: "block", type: "python_os_getcwd" },
      { kind: "block", type: "python_os_makedirs", fields: { DIRECTORY_NAME: "新建目录", EXIST_OK: "True" }, inputs: { PATH: textShadow(".") } },
      { kind: "block", type: "python_directory_copy", fields: { DIRECTORY_NAME: "目录副本", EXIST_OK: "True" }, inputs: { SOURCE: textShadow("源目录"), TARGET: textShadow(".") } },
      { kind: "block", type: "python_directory_move", fields: { DIRECTORY_NAME: "新目录名称" }, inputs: { SOURCE: textShadow("源目录"), TARGET: textShadow(".") } },
      { kind: "block", type: "python_directory_remove", fields: { REMOVE_MODE: "empty" }, inputs: { PATH: textShadow("空目录") } },
      { kind: "sep", gap: 20 },
      toolboxSectionLabel("路径和资源"),
      ...pythonSyntaxToolbox.file,
    ] },
    { kind: "category", name: "对象", colour: "#a64ca6", custom: "DEFINED_OBJECTS" },
    { kind: "category", name: "异常", colour: "#b95050", contents: [
      toolboxSectionLabel("捕获错误"),
      { kind: "block", type: "python_try_except" },
      { kind: "block", type: "python_try_full" },
      { kind: "block", type: "python_try_two_except" },
      { kind: "sep", gap: 20 },
      toolboxSectionLabel("检查与抛出"),
      { kind: "block", type: "python_assert", inputs: { CONDITION: booleanShadow("TRUE"), MESSAGE: textShadow("条件不成立") } },
      { kind: "block", type: "python_raise", inputs: { ERROR: { shadow: { type: "python_raw_expression", fields: { CODE: "ValueError('错误信息')" } } } } },
      ...pythonSyntaxToolbox.exception,
    ] },
    { kind: "category", name: "模块", colour: "#c58b32", contents: [
      toolboxSectionLabel("常用导入"),
      { kind: "block", type: "python_import", fields: { MODULE: "math" } },
      { kind: "block", type: "python_from_import", fields: { MODULE: "math", NAME: "sqrt" } },
      ...pythonSyntaxToolbox.module,
      { kind: "sep", gap: 20 },
      toolboxSectionLabel("高级"),
      { kind: "block", type: "python_raw_expression", fields: { CODE: "len([1, 2, 3])" } },
    ] },
    { kind: "category", name: "标准库", colour: "#c58b32", contents: [...pythonSyntaxToolbox.standardLibrary] },
    { kind: "category", name: "现代语法", colour: "#5968b0", contents: [...pythonSyntaxToolbox.modern] },
    { kind: "category", name: "异步", colour: "#8762b8", contents: [...pythonSyntaxToolbox.async] },
  ],
};

export const starterState = {
  blocks: { languageVersion: 0, blocks: [{ type: "variables_set", x: 90, y: 70, fields: { VAR: { name: "消息" } }, inputs: { VALUE: { block: { type: "text", fields: { TEXT: "你好，Python！" } } } }, next: { block: { type: "python_print", inputs: { VALUE: { block: { type: "variables_get", fields: { VAR: { name: "消息" } } } } }, next: { block: { type: "controls_repeat_ext", inputs: { TIMES: { shadow: { type: "math_number", fields: { NUM: 3 } } }, DO: { block: { type: "python_print", inputs: { VALUE: { block: { type: "text", fields: { TEXT: "图形化编程" } } } } } } } } } } } }] },
};

function stripGeneratedVariableDeclarations(code: string): string {
  const lines = code.split("\n");
  let declarationStart = 0;
  while (declarationStart < lines.length && (/^(?:from\s+\S+\s+)?import\s+\S+/.test(lines[declarationStart] || "") || !lines[declarationStart]?.trim())) declarationStart += 1;
  let declarationEnd = declarationStart;
  while (/^[_\p{ID_Start}][_\p{ID_Continue}]* = None$/u.test(lines[declarationEnd] || "")) declarationEnd += 1;
  if (declarationEnd === declarationStart) return code;
  while (declarationEnd < lines.length && !lines[declarationEnd]?.trim()) declarationEnd += 1;
  return [...lines.slice(0, declarationStart), ...lines.slice(declarationEnd)].join("\n");
}

export function generatePython(state: object): string {
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(state, workspace);
  const code = stripGeneratedVariableDeclarations(pythonGenerator.workspaceToCode(workspace));
  workspace.dispose();
  return code;
}

const DEFERRED_INPUTS_KEY = "vpDeferred";
const STATEMENT_INPUT_NAMES = new Set([
  "BODY", "STACK", "DO", "DO0", "DO1", "DO2", "DO3", "TRY", "EXCEPT", "ELSE", "FINALLY", "THEN", "STATEMENT", "COMMANDS",
]);

type SerializedBlock = Record<string, unknown> & {
  data?: string;
  collapsed?: boolean;
  inputs?: Record<string, { block?: SerializedBlock; shadow?: SerializedBlock }>;
  next?: { block?: SerializedBlock };
};

type DeferredPayload = {
  [DEFERRED_INPUTS_KEY]?: Record<string, SerializedBlock>;
  vpUserData?: string;
};

function statementInputBlock(block: SerializedBlock | undefined) {
  const inputs = block?.inputs;
  return inputs?.BODY?.block || inputs?.STACK?.block || inputs?.DO?.block || inputs?.DO0?.block;
}

function nextChainLength(block: SerializedBlock | undefined) {
  let count = 0;
  let current = block;
  while (current) {
    count += 1;
    current = current.next?.block;
  }
  return count;
}

export function countSerializedBlocks(state: object) {
  let count = 0;
  const visit = (block: SerializedBlock | undefined) => {
    if (!block) return;
    count += 1;
    if (block.inputs) for (const connection of Object.values(block.inputs)) visit(connection?.block);
    visit(block.next?.block);
  };
  const tops = (state as { blocks?: { blocks?: SerializedBlock[] } }).blocks?.blocks;
  if (Array.isArray(tops)) for (const block of tops) visit(block);
  return count;
}

function readDeferredPayload(data: string | undefined | null): DeferredPayload {
  if (!data) return {};
  try {
    const parsed = JSON.parse(data) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && (DEFERRED_INPUTS_KEY in parsed || "vpUserData" in parsed)) {
      return parsed as DeferredPayload;
    }
  } catch {
    // Preserve non-JSON block data as opaque user data.
  }
  return { vpUserData: data };
}

function writeDeferredPayload(payload: DeferredPayload) {
  const deferred = payload[DEFERRED_INPUTS_KEY];
  if (!deferred || !Object.keys(deferred).length) return payload.vpUserData;
  return JSON.stringify(payload);
}

function isStatementConnection(name: string, child: SerializedBlock) {
  return STATEMENT_INPUT_NAMES.has(name) || Boolean(child.next);
}

function deferBlockInputs(block: SerializedBlock | undefined, minStatements: number, minTree: number) {
  if (!block) return;
  if (block.inputs) {
    for (const [name, connection] of Object.entries(block.inputs)) {
      const child = connection?.block;
      if (!child) continue;
      const treeSize = countSerializedBlocks({ blocks: { languageVersion: 0, blocks: [child] } });
      if (isStatementConnection(name, child) && (nextChainLength(child) >= minStatements || treeSize >= minTree)) {
        const payload = readDeferredPayload(typeof block.data === "string" ? block.data : undefined);
        payload[DEFERRED_INPUTS_KEY] = { ...payload[DEFERRED_INPUTS_KEY], [name]: child };
        const nextData = writeDeferredPayload(payload);
        if (nextData) block.data = nextData;
        else delete block.data;
        delete block.inputs[name];
        block.collapsed = true;
        continue;
      }
      deferBlockInputs(child, minStatements, minTree);
    }
  }
  deferBlockInputs(block.next?.block, minStatements, minTree);
}

export function deferHeavyStatementInputs(state: object, minStatements = 16, minTree = 40) {
  const tops = (state as { blocks?: { blocks?: SerializedBlock[] } }).blocks?.blocks;
  if (!Array.isArray(tops)) return state;
  for (const block of tops) deferBlockInputs(block, minStatements, minTree);
  return state;
}

function restoreBlockInputs(block: SerializedBlock | undefined) {
  if (!block) return;
  const payload = readDeferredPayload(typeof block.data === "string" ? block.data : undefined);
  const deferred = payload[DEFERRED_INPUTS_KEY];
  if (deferred) {
    block.inputs = block.inputs ?? {};
    for (const [name, child] of Object.entries(deferred)) {
      const existing = block.inputs[name]?.block;
      if (existing) {
        let tail = existing;
        while (tail.next?.block) tail = tail.next.block;
        tail.next = { block: child };
      } else {
        block.inputs[name] = { ...(block.inputs[name] ?? {}), block: child };
      }
      restoreBlockInputs(child);
    }
    delete payload[DEFERRED_INPUTS_KEY];
    const nextData = writeDeferredPayload(payload);
    if (nextData) block.data = nextData;
    else delete block.data;
  }
  if (block.inputs) for (const connection of Object.values(block.inputs)) restoreBlockInputs(connection?.block);
  restoreBlockInputs(block.next?.block);
}

export function restoreDeferredIntoState(state: object) {
  const tops = (state as { blocks?: { blocks?: SerializedBlock[] } }).blocks?.blocks;
  if (Array.isArray(tops)) for (const block of tops) restoreBlockInputs(block);
  return state;
}

export function markHeavyStacksCollapsed(state: object, minStatements = 24) {
  const tops = (state as { blocks?: { blocks?: SerializedBlock[] } }).blocks?.blocks;
  if (!Array.isArray(tops)) return state;
  for (const block of tops) {
    if (nextChainLength(statementInputBlock(block)) >= minStatements) block.collapsed = true;
  }
  return state;
}

export function collapseHeavyStatementBlocks(workspace: Blockly.Workspace, minStatements = 24) {
  for (const block of workspace.getTopBlocks(false)) {
    const input = block.getInput("BODY") || block.getInput("STACK") || block.getInput("DO") || block.getInput("DO0");
    const start = input?.connection?.targetBlock();
    if (!start) continue;
    let count = 0;
    for (let current: Blockly.Block | null = start; current; current = current.getNextBlock()) count += 1;
    if (count >= minStatements) block.setCollapsed(true);
  }
}

function workspaceHasDeferred(workspace: Blockly.Workspace) {
  return workspace.getAllBlocks(false).some((block) => String(block.data || "").includes(`"${DEFERRED_INPUTS_KEY}"`));
}

type HydrationJob = { cancelled: boolean };
const hydrationJobs = new WeakMap<Blockly.Block, HydrationJob>();
const hydratingWorkspaces = new WeakSet<Blockly.Workspace>();

export function isHydratingWorkspace(workspace: Blockly.Workspace) {
  return hydratingWorkspaces.has(workspace);
}

function splitStatementChain(root: SerializedBlock) {
  const parts: SerializedBlock[] = [];
  let current: SerializedBlock | undefined = root;
  while (current) {
    const next: SerializedBlock | undefined = current.next?.block;
    const part: SerializedBlock = { ...current };
    delete part.next;
    parts.push(part);
    current = next;
  }
  return parts;
}

function linkStatementChain(parts: SerializedBlock[]) {
  if (!parts.length) return undefined;
  const nodes = parts.map((part) => {
    const node: SerializedBlock = { ...part };
    delete node.next;
    return node;
  });
  for (let index = 0; index < nodes.length - 1; index += 1) nodes[index].next = { block: nodes[index + 1] };
  return nodes[0];
}

function appendSerializedStatement(parent: Blockly.Block, inputName: string, state: SerializedBlock) {
  const child = Blockly.serialization.blocks.append(state as unknown as Blockly.serialization.blocks.State, parent.workspace, { recordUndo: false });
  const input = parent.getInput(inputName);
  if (!input?.connection) return child;
  const existing = input.connection.targetBlock();
  if (existing && child.previousConnection) {
    let tail: Blockly.Block = existing;
    while (tail.getNextBlock()) tail = tail.getNextBlock()!;
    tail.nextConnection?.connect(child.previousConnection);
  } else {
    const target = child.previousConnection || child.outputConnection;
    if (target) input.connection.connect(target);
  }
  return child;
}

function persistHydrationQueue(block: Blockly.Block, queue: Array<{ name: string; remaining: SerializedBlock[] }>) {
  const payload = readDeferredPayload(block.data);
  const deferred: Record<string, SerializedBlock> = {};
  for (const item of queue) {
    const root = linkStatementChain(item.remaining);
    if (root) deferred[item.name] = root;
  }
  if (Object.keys(deferred).length) payload[DEFERRED_INPUTS_KEY] = deferred;
  else delete payload[DEFERRED_INPUTS_KEY];
  block.data = writeDeferredPayload(payload) ?? null;
}

function finishHydration(block: Blockly.Block, job: HydrationJob) {
  if (job.cancelled) return;
  hydrationJobs.delete(block);
  const workspace = block.workspace;
  if (workspace) hydratingWorkspaces.delete(workspace);
  const svgWorkspace = workspace as Blockly.WorkspaceSvg | undefined;
  svgWorkspace?.getInjectionDiv?.()?.classList.remove("blocklyHydrating");
  if (!workspace || job.cancelled) return;
  const event = new Blockly.Events.BlockChange(block, "collapsed", null, true, false);
  event.recordUndo = false;
  Blockly.Events.fire(event);
}

export function hydrateDeferredInputs(block: Blockly.Block, options?: { sync?: boolean }) {
  const existingJob = hydrationJobs.get(block);
  if (existingJob && !options?.sync) return false;
  if (existingJob && options?.sync) existingJob.cancelled = true;
  const payload = readDeferredPayload(block.data);
  const deferred = payload[DEFERRED_INPUTS_KEY];
  if (!deferred) return false;
  const queue = Object.entries(deferred).map(([name, root]) => ({ name, remaining: splitStatementChain(root) }));
  if (!queue.some((item) => item.remaining.length)) return false;
  const job: HydrationJob = { cancelled: false };
  hydrationJobs.set(block, job);
  const workspace = block.workspace;
  hydratingWorkspaces.add(workspace);
  const svgWorkspace = workspace as Blockly.WorkspaceSvg;
  svgWorkspace.getInjectionDiv?.()?.classList.add("blocklyHydrating");
  const frameBudgetMs = options?.sync ? Number.POSITIVE_INFINITY : 7;
  const runChunk = () => {
    if (job.cancelled || !block.workspace) {
      hydrationJobs.delete(block);
      hydratingWorkspaces.delete(workspace);
      svgWorkspace.getInjectionDiv?.()?.classList.remove("blocklyHydrating");
      return;
    }
    const eventsWereEnabled = typeof Blockly.Events.isEnabled === "function" ? Blockly.Events.isEnabled() : true;
    Blockly.Events.disable();
    const canToggleResize = typeof svgWorkspace.setResizesEnabled === "function";
    try {
      if (canToggleResize) svgWorkspace.setResizesEnabled(false);
      const deadline = performance.now() + frameBudgetMs;
      for (const item of queue) {
        while (item.remaining.length && performance.now() < deadline) {
          appendSerializedStatement(block, item.name, item.remaining.shift()!);
        }
        if (performance.now() >= deadline) break;
      }
      persistHydrationQueue(block, queue);
    } finally {
      if (canToggleResize) svgWorkspace.setResizesEnabled(true);
      if (eventsWereEnabled) Blockly.Events.enable();
    }
    if (queue.some((item) => item.remaining.length)) {
      if (options?.sync) runChunk();
      else scheduleAnimationFrame(runChunk);
      return;
    }
    finishHydration(block, job);
  };
  if (options?.sync) runChunk();
  else scheduleAnimationFrame(runChunk);
  return true;
}

export function hydrateAllDeferredInputs(workspace: Blockly.Workspace) {
  let hydrated = false;
  for (const block of workspace.getAllBlocks(false)) {
    if (hydrateDeferredInputs(block, { sync: true })) hydrated = true;
  }
  return hydrated;
}

export function installDeferredHydration(workspace: Blockly.Workspace) {
  workspace.addChangeListener((event) => {
    if (event.type === Blockly.Events.BLOCK_CHANGE) {
      const change = event as Blockly.Events.BlockChange;
      if (change.element !== "collapsed" || change.newValue !== false || !change.blockId) return;
      const block = workspace.getBlockById(change.blockId);
      if (block) hydrateDeferredInputs(block);
      return;
    }
    if (event.type !== Blockly.Events.BLOCK_MOVE && event.type !== Blockly.Events.BLOCK_CREATE) return;
    const blockId = (event as Blockly.Events.BlockCreate | Blockly.Events.BlockMove).blockId;
    const block = blockId ? workspace.getBlockById(blockId) : null;
    let current = block?.getParent() ?? null;
    while (current) {
      if (hydrateDeferredInputs(current)) break;
      current = current.getParent();
    }
  });
}

export function saveWorkspaceState(workspace: Blockly.Workspace) {
  const state = Blockly.serialization.workspaces.save(workspace) as object;
  restoreDeferredIntoState(state);
  return state;
}

function withRestoredWorkspace<T>(workspace: Blockly.Workspace, read: (workspace: Blockly.Workspace) => T) {
  if (!workspaceHasDeferred(workspace)) return read(workspace);
  const temp = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(saveWorkspaceState(workspace), temp);
    return read(temp);
  } finally {
    temp.dispose();
  }
}

export function generateWorkspacePython(workspace: Blockly.Workspace): string {
  return withRestoredWorkspace(workspace, (current) => stripGeneratedVariableDeclarations(pythonGenerator.workspaceToCode(current)));
}

export function loadWorkspaceFast(workspace: Blockly.Workspace, state: object, options?: { collapseIfBlocks?: number }) {
  const eventsWereEnabled = typeof Blockly.Events.isEnabled === "function" ? Blockly.Events.isEnabled() : true;
  Blockly.Events.disable();
  const svgWorkspace = workspace as Blockly.WorkspaceSvg;
  const canToggleResize = typeof svgWorkspace.setResizesEnabled === "function";
  try {
    if (canToggleResize) svgWorkspace.setResizesEnabled(false);
    const nextState = structuredClone(state) as object;
    const collapseAt = options?.collapseIfBlocks ?? 80;
    if (collapseAt > 0 && countSerializedBlocks(nextState) >= collapseAt) deferHeavyStatementInputs(nextState);
    else if (collapseAt > 0) markHeavyStacksCollapsed(nextState);
    Blockly.serialization.workspaces.load(nextState, workspace);
    if (workspace.getAllBlocks(false).length >= collapseAt) collapseHeavyStatementBlocks(workspace);
  } finally {
    if (canToggleResize) svgWorkspace.setResizesEnabled(true);
    if (eventsWereEnabled) Blockly.Events.enable();
  }
}

export type GeneratedBlockMap = { code: string; blockIdByLine: Map<number, string> };
export type BlockCodeRange = { startLineNumber: number; endLineNumber: number };

export function generateWorkspacePythonWithBlockMap(workspace: Blockly.Workspace): GeneratedBlockMap {
  const previousPrefix = pythonGenerator.STATEMENT_PREFIX;
  pythonGenerator.STATEMENT_PREFIX = "# __visual_python_block_%1__\n";
  try {
    return withRestoredWorkspace(workspace, (current) => {
      const code = stripGeneratedVariableDeclarations(pythonGenerator.workspaceToCode(current));
      const blockIdByLine = new Map<number, string>();
      let currentBlockId = "";
      code.split("\n").forEach((line, index) => {
        const marker = line.match(/# __visual_python_block_(.+?)__\s*$/);
        if (marker) {
          const encodedId = marker[1];
          currentBlockId = encodedId.length >= 2 && encodedId[0] === encodedId.at(-1) && (encodedId[0] === "'" || encodedId[0] === '"')
            ? encodedId.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\")
            : encodedId;
        }
        if (currentBlockId) blockIdByLine.set(index + 1, currentBlockId);
      });
      return { code, blockIdByLine };
    });
  } finally {
    pythonGenerator.STATEMENT_PREFIX = previousPrefix;
  }
}

export function findWorkspaceBlockCodeRange(workspace: Blockly.Workspace, blockId: string): BlockCodeRange | null {
  if (!workspace.getBlockById(blockId)) hydrateAllDeferredInputs(workspace);
  let candidate = workspace.getBlockById(blockId);
  if (!candidate) return null;
  const generated = generateWorkspacePythonWithBlockMap(workspace);
  const visibleLines: Array<{ lineNumber: number; blockId?: string; hasCode: boolean }> = [];
  let lineNumber = 0;
  generated.code.split("\n").forEach((line, index) => {
    if (line.trimStart().startsWith("# __visual_python_block_")) return;
    lineNumber += 1;
    visibleLines.push({ lineNumber, blockId: generated.blockIdByLine.get(index + 1), hasCode: Boolean(line.trim()) });
  });

  const inputSubtreeIds = (root: Blockly.Block) => {
    const ids = new Set<string>();
    const visitBlock = (block: Blockly.Block) => {
      if (ids.has(block.id)) return;
      ids.add(block.id);
      for (const input of block.inputList) {
        let child = input.connection?.targetBlock() ?? null;
        while (child) {
          visitBlock(child);
          child = child.getNextBlock();
        }
      }
    };
    visitBlock(root);
    return ids;
  };

  while (candidate) {
    const ids = inputSubtreeIds(candidate);
    const lines = visibleLines.filter((line) => line.hasCode && line.blockId && ids.has(line.blockId));
    if (lines.length) return { startLineNumber: lines[0].lineNumber, endLineNumber: lines.at(-1)!.lineNumber };
    candidate = candidate.getParent();
  }
  return null;
}

const structuredDefinitionTypes = new Set([
  "python_function_structured",
  "python_method_structured",
  "python_async_function_structured",
  "python_typed_function_structured",
  "python_async_typed_function_structured",
]);

function readDefinitionParameters(block: Blockly.Block): ParameterSpec[] {
  if (structuredDefinitionTypes.has(block.type)) {
    return ((block as Blockly.Block & { parameters_?: ParameterSpec[] }).parameters_ ?? []).map((parameter, index) => ({
      ...parameter,
      name: block.getFieldValue(`PARAM_NAME${index}`) || parameter.name,
    }));
  }

  const parts = String(block.getFieldValue("PARAMS") || "").split(",").map((part) => part.trim()).filter(Boolean);
  const slashIndex = parts.indexOf("/");
  let keywordOnly = false;
  return parts.flatMap((part, index): ParameterSpec[] => {
    if (part === "/") return [];
    if (part === "*") {
      keywordOnly = true;
      return [];
    }
    if (part.startsWith("**")) {
      const name = part.slice(2).split(":", 1)[0].trim();
      return [{ kind: "kwargs", name }];
    }
    if (part.startsWith("*")) {
      keywordOnly = true;
      const name = part.slice(1).split(":", 1)[0].trim();
      return [{ kind: "args", name }];
    }
    const hasDefault = part.includes("=");
    const name = part.split("=", 1)[0].split(":", 1)[0].trim();
    const kind: ParameterSpec["kind"] = keywordOnly
      ? hasDefault ? "keyword_only_default" : "keyword_only"
      : hasDefault ? "default" : slashIndex >= 0 && index < slashIndex ? "positional_only" : "positional";
    return [{ kind, name }];
  }).filter((parameter) => Boolean(parameter.name));
}

const requiredCallArguments = (parameters: ParameterSpec[]): ArgumentSpec[] => parameters.flatMap((parameter): ArgumentSpec[] => {
  if (parameter.kind === "positional" || parameter.kind === "positional_only") return [{ kind: "positional", name: "" }];
  if (parameter.kind === "keyword_only") return [{ kind: "keyword", name: parameter.name }];
  return [];
});

const callToolboxBlock = (type: string, target: string, arguments_: ArgumentSpec[]) => {
  const fields: Record<string, string> = { TARGET: target };
  arguments_.forEach((argument, index) => { if (argument.kind === "keyword") fields[`ARG_NAME${index}`] = argument.name; });
  return { kind: "block", type, fields, extraState: { arguments: arguments_ } } as Blockly.utils.toolbox.BlockInfo;
};

const callableFunctionDefinitionTypes = new Set([...structuredDefinitionTypes].filter((type) => type !== "python_method_structured"));

export function buildFunctionCallBlockInfo(
  definition: Blockly.Block,
  type: "python_call_structured" | "python_call_statement_structured" = "python_call_statement_structured",
): Blockly.utils.toolbox.BlockInfo | null {
  if (!callableFunctionDefinitionTypes.has(definition.type) && definition.type !== "python_function_def") return null;
  const name = safeIdentifier(definition.getFieldValue("NAME") || "", "");
  return name ? callToolboxBlock(type, name, requiredCallArguments(readDefinitionParameters(definition))) : null;
}

export function buildDefinedFunctionCallToolbox(workspace: Blockly.Workspace): Blockly.utils.toolbox.FlyoutItemInfoArray {
  const names = new Set<string>();
  const calls: Blockly.utils.toolbox.FlyoutItemInfoArray = [
    { kind: "block", type: "python_call_structured" },
    { kind: "block", type: "python_call_statement_structured" },
  ];
  const definedCalls: Blockly.utils.toolbox.FlyoutItemInfoArray = [];
  for (const block of workspace.getAllBlocks(false)) {
    if (!callableFunctionDefinitionTypes.has(block.type) && block.type !== "python_function_def") continue;
    const surroundParent = block.getSurroundParent();
    if (surroundParent && (surroundParent.type !== "python_decorated_definition" || surroundParent.getSurroundParent())) continue;
    const callInfo = buildFunctionCallBlockInfo(block, "python_call_structured");
    const name = callInfo?.fields?.TARGET;
    if (!name || names.has(name)) continue;
    names.add(name);

    definedCalls.push(callInfo);
  }
  if (definedCalls.length) calls.push({ kind: "sep", gap: 20 }, ...definedCalls);
  return calls;
}

const objectToolboxBlocks: Blockly.utils.toolbox.FlyoutItemInfoArray = [
  { kind: "block", type: "python_class_def" },
  { kind: "block", type: "python_method_structured" },
  { kind: "block", type: "python_set_attribute", inputs: { OBJECT: variableShadow("self"), VALUE: numberShadow(0) } } as Blockly.utils.toolbox.BlockInfo,
  { kind: "block", type: "python_super_call" },
  { kind: "block", type: "python_new_object_structured" },
  { kind: "block", type: "python_attribute", inputs: { OBJECT: variableShadow("object") } } as Blockly.utils.toolbox.BlockInfo,
  { kind: "block", type: "python_method_call_structured" },
  { kind: "block", type: "python_method_statement_structured" },
];

const classBodyDefinition = (block: Blockly.Block) => block.type === "python_decorated_definition"
  ? block.getInputTargetBlock("DEFINITION")
  : block;

export function buildDefinedClassConstructorToolbox(workspace: Blockly.Workspace): Blockly.utils.toolbox.FlyoutItemInfoArray {
  const calls: Blockly.utils.toolbox.FlyoutItemInfoArray = [...objectToolboxBlocks];
  const constructors: Blockly.utils.toolbox.FlyoutItemInfoArray = [];
  const names = new Set<string>();
  for (const classBlock of workspace.getAllBlocks(false).filter((block) => block.type === "python_class_def")) {
    const className = safeIdentifier(classBlock.getFieldValue("NAME") || "", "");
    if (!className || names.has(className)) continue;
    names.add(className);

    let definition = classBlock.getInputTargetBlock("BODY");
    let constructor: Blockly.Block | null = null;
    while (definition) {
      const candidate = classBodyDefinition(definition);
      if (candidate && (candidate.type === "python_method_structured" || candidate.type === "python_method_def") && candidate.getFieldValue("NAME") === "__init__") {
        constructor = candidate;
        break;
      }
      definition = definition.getNextBlock();
    }

    const parameters = constructor ? readDefinitionParameters(constructor) : [];
    if (parameters[0] && ["self", "cls"].includes(parameters[0].name)) parameters.shift();
    constructors.push(callToolboxBlock("python_new_object_structured", className, requiredCallArguments(parameters)));
  }
  if (constructors.length) calls.push({ kind: "sep", gap: 20 }, ...constructors);
  return calls;
}

export function registerUsedVariablesToolbox(workspace: Blockly.WorkspaceSvg) {
  workspace.registerButtonCallback("CREATE_USED_VARIABLE", () => Blockly.Variables.createVariableButtonHandler(workspace, (name) => {
    if (!name) return;
    const variable = workspace.getVariableMap().getVariable(name, "");
    if (!variable) return;
    const setter = workspace.newBlock("variables_set");
    setter.setFieldValue(variable.getId(), "VAR");
    setter.initSvg(); setter.render();
    const metrics = workspace.getMetrics();
    setter.moveBy(metrics.viewLeft + 48, metrics.viewTop + 48);
  }));
  workspace.registerToolboxCategoryCallback("USED_VARIABLES", () => {
    const usedVariables = Blockly.Variables.allUsedVarModels(workspace);
    const variableBlocks = Blockly.Variables.jsonFlyoutCategoryBlocks(workspace, usedVariables, true);
    return [
      { kind: "button", text: "创建变量...", callbackKey: "CREATE_USED_VARIABLE" },
      ...variableBlocks,
    ];
  });
  workspace.registerToolboxCategoryCallback("DEFINED_FUNCTION_CALLS", () => buildDefinedFunctionCallToolbox(workspace));
  workspace.registerToolboxCategoryCallback("DEFINED_OBJECTS", () => buildDefinedClassConstructorToolbox(workspace));
}
