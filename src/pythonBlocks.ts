import * as Blockly from "blockly/core";
import "blockly/blocks";
import * as ZhHans from "blockly/msg/zh-hans";
import { pythonGenerator } from "blockly/python";
import { Order } from "blockly/python";
import { pythonSyntaxToolbox, registerPythonSyntaxBlocks } from "./pythonSyntaxBlocks";

const locale = Object.fromEntries(
  Object.entries(ZhHans).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
);
Blockly.setLocale(locale);

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
} as const;
const expressionColour = colours.call;
const collectionColour = colours.collection;
const objectColour = colours.object;
const statementColour = colours.exception;

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
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    } finally {
      bubbleCanvas.classList.remove("visual-python-mutator-opening");
    }
  }
}

const createMutatorIcon = (blockTypes: string[], block: Blockly.BlockSvg) => new ThemedMutatorIcon(blockTypes, block);

Blockly.common.defineBlocksWithJsonArray([
  { type: "python_print", message0: "打印 %1", args0: [{ type: "input_value", name: "VALUE" }], previousStatement: null, nextStatement: null, colour: colours.inputOutput },
  { type: "python_input", message0: "输入，提示 %1", args0: [{ type: "input_value", name: "PROMPT", check: "String" }], output: null, colour: colours.inputOutput },
  { type: "python_input_assign", message0: "输入并保存到 %1 提示 %2", args0: [{ type: "field_variable", name: "VAR", variable: "answer" }, { type: "input_value", name: "PROMPT", check: "String" }], previousStatement: null, nextStatement: null, colour: colours.inputOutput },
  { type: "python_import", message0: "导入模块 %1", args0: [{ type: "field_input", name: "MODULE", text: "math" }], previousStatement: null, nextStatement: null, colour: colours.module },
  { type: "python_from_import", message0: "从 %1 导入 %2", args0: [{ type: "field_input", name: "MODULE", text: "math" }, { type: "field_input", name: "NAME", text: "sqrt" }], previousStatement: null, nextStatement: null, colour: colours.module },
  { type: "python_raw_expression", message0: "Python 表达式 %1", args0: [{ type: "field_input", name: "CODE", text: "len(items)" }], output: null, colour: colours.module },
  { type: "python_floor_divide", message0: "%1 整除 // %2", args0: [{ type: "input_value", name: "A", check: "Number" }, { type: "input_value", name: "B", check: "Number" }], inputsInline: true, output: "Number", colour: "#4f72b8" },
  { type: "python_bitwise", message0: "%1 %2 %3", args0: [{ type: "input_value", name: "A", check: "Number" }, { type: "field_dropdown", name: "OP", options: [["按位与 &", "&"], ["按位或 |", "|"], ["按位异或 ^", "^"], ["左移 <<", "<<"], ["右移 >>", ">>"]] }, { type: "input_value", name: "B", check: "Number" }], inputsInline: true, output: "Number", colour: "#4f72b8" },
  { type: "python_bitwise_not", message0: "按位取反 ~ %1", args0: [{ type: "input_value", name: "VALUE", check: "Number" }], output: "Number", colour: "#4f72b8" },
  { type: "python_membership", message0: "%1 %2 %3", args0: [{ type: "input_value", name: "ITEM" }, { type: "field_dropdown", name: "OP", options: [["在 in", "in"], ["不在 not in", "not in"]] }, { type: "input_value", name: "COLLECTION" }], inputsInline: true, output: "Boolean", colour: "#5968b0" },
  { type: "python_identity", message0: "%1 %2 %3", args0: [{ type: "input_value", name: "A" }, { type: "field_dropdown", name: "OP", options: [["是 is", "is"], ["不是 is not", "is not"]] }, { type: "input_value", name: "B" }], inputsInline: true, output: "Boolean", colour: "#5968b0" },
  { type: "python_none", message0: "空值 None", output: null, colour: "#5968b0" },
  { type: "python_conditional", message0: "如果 %1 则 %2 否则 %3", args0: [{ type: "input_value", name: "CONDITION", check: "Boolean" }, { type: "input_value", name: "TRUE_VALUE" }, { type: "input_value", name: "FALSE_VALUE" }], inputsInline: true, output: null, colour: "#5968b0" },
  { type: "python_call", message0: "调用函数 %1 参数 %2", args0: [{ type: "field_input", name: "NAME", text: "len" }, { type: "input_value", name: "ARG" }], output: null, colour: expressionColour },
  { type: "python_call_statement", message0: "调用函数 %1 参数 %2", args0: [{ type: "field_input", name: "NAME", text: "print" }, { type: "input_value", name: "ARG" }], previousStatement: null, nextStatement: null, colour: expressionColour },
  { type: "python_keyword_argument", message0: "关键字参数 %1 = %2", args0: [{ type: "field_input", name: "NAME", text: "name" }, { type: "input_value", name: "VALUE" }], output: "PythonArgument", colour: expressionColour },
  { type: "python_tuple", message0: "元组 ( %1 , %2 )", args0: [{ type: "input_value", name: "A" }, { type: "input_value", name: "B" }], inputsInline: true, output: null, colour: collectionColour },
  { type: "python_set", message0: "集合 { %1 , %2 }", args0: [{ type: "input_value", name: "A" }, { type: "input_value", name: "B" }], inputsInline: true, output: null, colour: collectionColour },
  { type: "python_dict", message0: "字典 { %1 : %2 , %3 : %4 }", args0: [{ type: "input_value", name: "K1" }, { type: "input_value", name: "V1" }, { type: "input_value", name: "K2" }, { type: "input_value", name: "V2" }], inputsInline: true, output: null, colour: collectionColour },
  { type: "python_index", message0: "%1 的索引 %2", args0: [{ type: "input_value", name: "OBJECT" }, { type: "input_value", name: "INDEX" }], output: null, colour: collectionColour },
  { type: "python_slice", message0: "%1 切片 从 %2 到 %3 步长 %4", args0: [{ type: "input_value", name: "OBJECT" }, { type: "input_value", name: "START" }, { type: "input_value", name: "STOP" }, { type: "input_value", name: "STEP" }], output: null, colour: collectionColour },
  { type: "python_attribute", message0: "%1 的属性 %2", args0: [{ type: "input_value", name: "OBJECT" }, { type: "field_input", name: "ATTRIBUTE", text: "name" }], output: null, colour: objectColour },
  { type: "python_method_call", message0: "%1 调用方法 %2 参数 %3", args0: [{ type: "input_value", name: "OBJECT" }, { type: "field_input", name: "METHOD", text: "append" }, { type: "input_value", name: "ARG" }], output: null, colour: objectColour },
  { type: "python_method_statement", message0: "%1 调用方法 %2 参数 %3", args0: [{ type: "input_value", name: "OBJECT" }, { type: "field_input", name: "METHOD", text: "append" }, { type: "input_value", name: "ARG" }], previousStatement: null, nextStatement: null, colour: objectColour },
  { type: "python_new_object", message0: "创建 %1 参数 %2", args0: [{ type: "field_input", name: "CLASS", text: "Person" }, { type: "input_value", name: "ARG" }], output: null, colour: objectColour },
  { type: "python_return", message0: "返回 %1", args0: [{ type: "input_value", name: "VALUE" }], previousStatement: null, colour: colours.function },
  { type: "python_raise", message0: "抛出异常 %1", args0: [{ type: "input_value", name: "ERROR" }], previousStatement: null, nextStatement: null, colour: statementColour },
  { type: "python_try_except", message0: "尝试 %1 捕获 %2 命名为 %3 %4", args0: [{ type: "input_statement", name: "TRY" }, { type: "field_input", name: "ERROR", text: "Exception" }, { type: "field_variable", name: "ALIAS", variable: "error" }, { type: "input_statement", name: "EXCEPT" }], previousStatement: null, nextStatement: null, colour: statementColour },
  { type: "python_try_two_except", message0: "尝试 %1 捕获 %2 命名为 %3 %4 再捕获 %5 命名为 %6 %7 最终 %8", args0: [{ type: "input_statement", name: "TRY" }, { type: "field_input", name: "ERROR1", text: "ValueError" }, { type: "field_input", name: "ALIAS1", text: "error" }, { type: "input_statement", name: "EXCEPT1" }, { type: "field_input", name: "ERROR2", text: "TypeError" }, { type: "field_input", name: "ALIAS2", text: "error" }, { type: "input_statement", name: "EXCEPT2" }, { type: "input_statement", name: "FINALLY" }], previousStatement: null, nextStatement: null, colour: statementColour },
  { type: "python_for_in", message0: "对于 %1 在 %2 中 %3", args0: [{ type: "field_variable", name: "VAR", variable: "item" }, { type: "input_value", name: "ITERABLE" }, { type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null, colour: colours.loop },
  { type: "python_for_enumerate", message0: "枚举 %1 为 %2 , %3 %4", args0: [{ type: "input_value", name: "ITERABLE" }, { type: "field_variable", name: "INDEX", variable: "index" }, { type: "field_variable", name: "VALUE", variable: "item" }, { type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null, colour: colours.loop },
  { type: "python_while_else", message0: "当 %1 时 %2 否则 %3", args0: [{ type: "input_value", name: "CONDITION" }, { type: "input_statement", name: "DO" }, { type: "input_statement", name: "ELSE" }], previousStatement: null, nextStatement: null, colour: colours.loop },
  { type: "python_for_else", message0: "对于 %1 在 %2 中 %3 否则 %4", args0: [{ type: "field_variable", name: "VAR", variable: "item" }, { type: "input_value", name: "ITERABLE" }, { type: "input_statement", name: "DO" }, { type: "input_statement", name: "ELSE" }], previousStatement: null, nextStatement: null, colour: colours.loop },
  { type: "python_pass", message0: "跳过 pass", previousStatement: null, nextStatement: null, colour: colours.loop },
  { type: "python_assert", message0: "断言 %1 消息 %2", args0: [{ type: "input_value", name: "CONDITION" }, { type: "input_value", name: "MESSAGE" }], previousStatement: null, nextStatement: null, colour: statementColour },
  { type: "python_scope_declaration", message0: "%1 变量 %2", args0: [{ type: "field_dropdown", name: "SCOPE", options: [["全局 global", "global"], ["外层 nonlocal", "nonlocal"]] }, { type: "field_input", name: "NAMES", text: "counter" }], previousStatement: null, nextStatement: null, colour: colours.function },
  { type: "python_function_def", message0: "定义函数 %1 ( %2 ) %3", args0: [{ type: "field_input", name: "NAME", text: "my_function" }, { type: "field_input", name: "PARAMS", text: "value, count=1, *args, **kwargs" }, { type: "input_statement", name: "BODY" }], previousStatement: null, nextStatement: null, colour: colours.function },
  { type: "python_class_def", message0: "定义类 %1 继承 %2 %3", args0: [{ type: "field_input", name: "NAME", text: "MyClass" }, { type: "field_input", name: "BASES", text: "object" }, { type: "input_statement", name: "BODY" }], previousStatement: null, nextStatement: null, colour: objectColour },
  { type: "python_method_def", message0: "定义方法 %1 ( %2 ) %3", args0: [{ type: "field_input", name: "NAME", text: "method" }, { type: "field_input", name: "PARAMS", text: "self" }, { type: "input_statement", name: "BODY" }], previousStatement: null, nextStatement: null, colour: objectColour },
  { type: "python_set_attribute", message0: "设置 %1 的属性 %2 为 %3", args0: [{ type: "input_value", name: "OBJECT" }, { type: "field_input", name: "ATTRIBUTE", text: "name" }, { type: "input_value", name: "VALUE" }], previousStatement: null, nextStatement: null, colour: objectColour },
  { type: "python_super_call", message0: "调用父类方法 %1 参数 %2", args0: [{ type: "field_input", name: "METHOD", text: "__init__" }, { type: "input_value", name: "ARG" }], previousStatement: null, nextStatement: null, colour: objectColour },
  { type: "python_try_full", message0: "尝试 %1 捕获 %2 命名为 %3 %4 否则 %5 最终 %6", args0: [{ type: "input_statement", name: "TRY" }, { type: "field_input", name: "ERROR", text: "Exception" }, { type: "field_variable", name: "ALIAS", variable: "error" }, { type: "input_statement", name: "EXCEPT" }, { type: "input_statement", name: "ELSE" }, { type: "input_statement", name: "FINALLY" }], previousStatement: null, nextStatement: null, colour: statementColour },
  { type: "python_with", message0: "使用 with %1 命名为 %2 %3", args0: [{ type: "input_value", name: "CONTEXT" }, { type: "field_variable", name: "ALIAS", variable: "resource" }, { type: "input_statement", name: "BODY" }], previousStatement: null, nextStatement: null, colour: statementColour },
  { type: "python_list_comprehension", message0: "列表 [ %1 对于 %2 在 %3 中 如果 %4 ]", args0: [{ type: "input_value", name: "EXPRESSION" }, { type: "field_input", name: "VAR", text: "item" }, { type: "input_value", name: "ITERABLE" }, { type: "input_value", name: "CONDITION" }], inputsInline: true, output: null, colour: collectionColour },
  { type: "python_set_comprehension", message0: "集合 { %1 对于 %2 在 %3 中 如果 %4 }", args0: [{ type: "input_value", name: "EXPRESSION" }, { type: "field_input", name: "VAR", text: "item" }, { type: "input_value", name: "ITERABLE" }, { type: "input_value", name: "CONDITION" }], inputsInline: true, output: null, colour: collectionColour },
  { type: "python_dict_comprehension", message0: "字典 { %1 : %2 对于 %3 在 %4 中 如果 %5 }", args0: [{ type: "input_value", name: "KEY" }, { type: "input_value", name: "VALUE" }, { type: "field_input", name: "VAR", text: "item" }, { type: "input_value", name: "ITERABLE" }, { type: "input_value", name: "CONDITION" }], inputsInline: true, output: null, colour: collectionColour },
  { type: "python_lambda", message0: "lambda 参数 %1 返回 %2", args0: [{ type: "field_input", name: "PARAMS", text: "value" }, { type: "input_value", name: "EXPRESSION" }], inputsInline: true, output: null, colour: colours.function },
  { type: "python_decorated_definition", message0: "装饰器 @ %1 %2", args0: [{ type: "input_value", name: "DECORATOR" }, { type: "input_statement", name: "DEFINITION" }], previousStatement: null, nextStatement: null, colour: colours.function },
  { type: "python_range", message0: "range 从 %1 到 %2 步长 %3", args0: [{ type: "input_value", name: "START" }, { type: "input_value", name: "STOP" }, { type: "input_value", name: "STEP" }], inputsInline: true, output: null, colour: colours.loop },
  { type: "python_length", message0: "%1 的长度", args0: [{ type: "input_value", name: "VALUE" }], output: "Number", colour: colours.inputOutput },
  { type: "python_convert", message0: "转换 %1 为 %2", args0: [{ type: "input_value", name: "VALUE" }, { type: "field_dropdown", name: "TYPE", options: [["整数 int", "int"], ["浮点数 float", "float"], ["文本 str", "str"], ["布尔值 bool", "bool"], ["列表 list", "list"], ["元组 tuple", "tuple"], ["集合 set", "set"], ["字典 dict", "dict"]] }], inputsInline: true, output: null, colour: colours.inputOutput },
  { type: "python_string_method", message0: "文本 %1 方法 %2 参数 %3", args0: [{ type: "input_value", name: "TEXT", check: "String" }, { type: "field_dropdown", name: "METHOD", options: [["转大写 upper", "upper"], ["转小写 lower", "lower"], ["去空白 strip", "strip"], ["分割 split", "split"], ["连接 join", "join"]] }, { type: "input_value", name: "ARG" }], inputsInline: true, output: null, colour: colours.inputOutput },
  { type: "python_list_method", message0: "列表 %1 方法 %2 参数 %3", args0: [{ type: "input_value", name: "LIST" }, { type: "field_dropdown", name: "METHOD", options: [["追加 append", "append"], ["扩展 extend", "extend"], ["移除 remove", "remove"], ["弹出 pop", "pop"], ["排序 sort", "sort"], ["反转 reverse", "reverse"], ["清空 clear", "clear"]] }, { type: "input_value", name: "ARG" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: collectionColour },
  { type: "python_dict_get", message0: "字典 %1 获取键 %2 默认值 %3", args0: [{ type: "input_value", name: "DICT" }, { type: "input_value", name: "KEY" }, { type: "input_value", name: "DEFAULT" }], inputsInline: true, output: null, colour: collectionColour },
  { type: "python_dict_view", message0: "字典 %1 的 %2", args0: [{ type: "input_value", name: "DICT" }, { type: "field_dropdown", name: "METHOD", options: [["键 keys", "keys"], ["值 values", "values"], ["键值对 items", "items"]] }], inputsInline: true, output: null, colour: collectionColour },
  { type: "python_open_file", message0: "打开文件 %1 模式 %2 编码 %3", args0: [{ type: "input_value", name: "PATH", check: "String" }, { type: "field_dropdown", name: "MODE", options: [["读取 r", "r"], ["写入 w", "w"], ["追加 a", "a"], ["二进制读取 rb", "rb"], ["二进制写入 wb", "wb"]] }, { type: "field_input", name: "ENCODING", text: "utf-8" }], inputsInline: true, output: null, colour: colours.module },
  { type: "python_file_read", message0: "文件 %1 读取 %2", args0: [{ type: "input_value", name: "FILE" }, { type: "input_value", name: "SIZE" }], inputsInline: true, output: null, colour: colours.module },
  { type: "python_file_write", message0: "文件 %1 写入 %2", args0: [{ type: "input_value", name: "FILE" }, { type: "input_value", name: "VALUE" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.module },
]);

Blockly.Blocks.python_sequence_collection = {
  init(this: any) {
    this.setColour(collectionColour); this.setOutput(true); this.setInputsInline(true);
    const kindField = new Blockly.FieldDropdown([["列表 [", "list"], ["元组 (", "tuple"], ["集合 {", "set"]]);
    this.appendDummyInput("HEAD").appendField(kindField, "KIND");
    this.itemCount_ = 2; this.updateShape_();
    this.setMutator(createMutatorIcon(["python_collection_item"], this as Blockly.BlockSvg));
  },
  itemCount_: 2,
  saveExtraState(this: any) { return { itemCount: this.itemCount_ }; },
  loadExtraState(this: any, state: { itemCount?: number }) { this.itemCount_ = state.itemCount ?? 0; this.updateShape_(); },
  onchange(this: any, event: Blockly.Events.Abstract) {
    if (event.type === Blockly.Events.BLOCK_CHANGE && (event as Blockly.Events.BlockChange).blockId === this.id && (event as Blockly.Events.BlockChange).name === "KIND") this.updateTail_();
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
    for (let i = 0; this.getInput(`ITEM${i}`); i++) this.removeInput(`ITEM${i}`);
    this.getInput("EMPTY") && this.removeInput("EMPTY");
    if (!this.itemCount_) this.appendDummyInput("EMPTY").appendField("空");
    for (let i = 0; i < this.itemCount_; i++) { const input = this.appendValueInput(`ITEM${i}`); if (i > 0) input.appendField(","); }
    this.updateTail_();
    this.setInputsInline(true);
  },
  updateTail_(this: any) {
    this.getInput("TAIL") && this.removeInput("TAIL");
    const closing = this.getFieldValue("KIND") === "tuple" ? ")" : this.getFieldValue("KIND") === "set" ? "}" : "]";
    this.appendDummyInput("TAIL").appendField(closing);
  },
} as unknown as (typeof Blockly.Blocks)[string];
Blockly.Blocks.python_collection_container = { init(this: Blockly.Block) { this.setColour(collectionColour); this.appendDummyInput().appendField("项目"); this.appendStatementInput("STACK"); this.contextMenu = false; } };
Blockly.Blocks.python_collection_item = { init(this: Blockly.Block) { this.setColour(collectionColour); this.appendDummyInput().appendField("项目"); this.setPreviousStatement(true); this.setNextStatement(true); this.contextMenu = false; } };

Blockly.Blocks.python_list_collection = {
  init(this: any) {
    this.setColour(collectionColour); this.setOutput(true); this.setInputsInline(true);
    this.appendDummyInput("HEAD").appendField("列表 [");
    this.itemCount_ = 2; this.updateShape_();
    this.setMutator(createMutatorIcon(["python_collection_item"], this as Blockly.BlockSvg));
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
} as unknown as (typeof Blockly.Blocks)[string];

Blockly.Blocks.python_dynamic_dict = {
  init(this: any) { this.setColour(collectionColour); this.setOutput(true); this.setInputsInline(true); this.appendDummyInput("HEAD").appendField("字典 {"); this.itemCount_ = 2; this.updateShape_(); this.setMutator(createMutatorIcon(["python_collection_item"], this as Blockly.BlockSvg)); },
  itemCount_: 2,
  saveExtraState(this: any) { return { itemCount: this.itemCount_ }; },
  loadExtraState(this: any, state: { itemCount?: number }) { this.itemCount_ = state.itemCount ?? 0; this.updateShape_(); },
  decompose: Blockly.Blocks.python_sequence_collection.decompose,
  compose(this: any, container: Blockly.Block) {
    const pairs: Array<[Blockly.Connection | null, Blockly.Connection | null]> = []; let item = container.getInputTargetBlock("STACK");
    while (item) { if (!item.isInsertionMarker()) pairs.push([(item as Blockly.Block & { keyConnection_?: Blockly.Connection | null }).keyConnection_ ?? null, (item as Blockly.Block & { valueConnection_?: Blockly.Connection | null }).valueConnection_ ?? null]); item = item.getNextBlock(); }
    this.itemCount_ = pairs.length; this.updateShape_(); pairs.forEach(([key, val], i) => { key?.reconnect(this, `KEY${i}`); val?.reconnect(this, `VALUE${i}`); });
  },
  saveConnections(this: any, container: Blockly.Block) { let item = container.getInputTargetBlock("STACK"); let i = 0; while (item) { if (!item.isInsertionMarker()) { const typed = item as Blockly.Block & { keyConnection_?: Blockly.Connection | null; valueConnection_?: Blockly.Connection | null }; typed.keyConnection_ = this.getInput(`KEY${i}`)?.connection?.targetConnection; typed.valueConnection_ = this.getInput(`VALUE${i}`)?.connection?.targetConnection; i++; } item = item.getNextBlock(); } },
  updateShape_(this: any) { this.getInput("TAIL") && this.removeInput("TAIL"); for (let i = 0; this.getInput(`KEY${i}`); i++) { this.removeInput(`KEY${i}`); this.removeInput(`VALUE${i}`); } this.getInput("EMPTY") && this.removeInput("EMPTY"); if (!this.itemCount_) this.appendDummyInput("EMPTY").appendField("空"); for (let i = 0; i < this.itemCount_; i++) { const key = this.appendValueInput(`KEY${i}`); if (i > 0) key.appendField(","); this.appendValueInput(`VALUE${i}`).appendField(":"); } this.appendDummyInput("TAIL").appendField("}"); this.setInputsInline(true); },
} as unknown as (typeof Blockly.Blocks)[string];

type ParameterSpec = {
  kind: "positional_only" | "positional" | "default" | "args" | "keyword_only" | "keyword_only_default" | "kwargs";
  name: string;
  annotation?: string;
};
type ArgumentSpec = { kind: "positional" | "keyword" | "star" | "kwargs"; name: string };

const normalizeIdentifier = (name: string, fallback: string, used: Set<string>) => {
  const base = /^[A-Za-z_]\w*$/.test(name.trim()) ? name.trim() : fallback;
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
  const name = block.getFieldValue("NAME") || (block.type.includes("method") ? "method" : "my_function");
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
    while (item) { if (!item.isInsertionMarker()) { parameters.push({ kind: item.getFieldValue("KIND"), name: item.getFieldValue("NAME") || "value", annotation: item.getFieldValue("TYPE") || "" }); connections.push((item as any).valueConnection_ ?? null); } item = item.getNextBlock(); }
    const normalized = normalizeParameters(parameters);
    const orderedConnections = normalized.map((parameter) => connections[parameters.findIndex((item) => item.name === parameter.name)] ?? null);
    this.parameters_ = normalized; rebuildParameterShape(this); orderedConnections.forEach((connection, i) => connection?.reconnect(this, `PARAM${i}`));
  },
  saveConnections(this: any, container: Blockly.Block) { let item = container.getInputTargetBlock("STACK"); let i = 0; while (item) { if (!item.isInsertionMarker()) { (item as any).valueConnection_ = this.getInput(`PARAM${i}`)?.connection?.targetConnection; i++; } item = item.getNextBlock(); } },
};

Blockly.Blocks.python_parameter_container = { init(this: Blockly.Block) { this.setColour(colours.function); this.appendDummyInput().appendField("函数参数"); this.appendStatementInput("STACK"); this.contextMenu = false; } };
const parameterKindOptions: Blockly.MenuOption[] = [["仅限位置参数 /", "positional_only"], ["普通参数", "positional"], ["默认参数", "default"], ["*args", "args"], ["仅限关键字参数", "keyword_only"], ["关键字默认参数", "keyword_only_default"], ["**kwargs", "kwargs"]];
Blockly.Blocks.python_parameter_item = { init(this: Blockly.Block) { this.setColour(colours.function); this.appendDummyInput().appendField(new Blockly.FieldDropdown(parameterKindOptions), "KIND").appendField(new Blockly.FieldTextInput("value"), "NAME"); this.setPreviousStatement(true); this.setNextStatement(true); this.contextMenu = false; } };
Blockly.Blocks.python_typed_parameter_item = { init(this: Blockly.Block) { this.setColour(colours.function); this.appendDummyInput().appendField(new Blockly.FieldDropdown(parameterKindOptions), "KIND").appendField(new Blockly.FieldTextInput("value"), "NAME").appendField(":").appendField(new Blockly.FieldTextInput("object"), "TYPE"); this.setPreviousStatement(true); this.setNextStatement(true); this.contextMenu = false; } };

function defineStructuredFunction(type: string, label: string, colour: string, initial: ParameterSpec[]) {
  Blockly.Blocks[type] = { ...parameterMixin, init(this: any) { this.definitionLabel_ = label; this.setColour(colour); this.setPreviousStatement(true); this.setNextStatement(true); this.appendDummyInput("HEAD").appendField(label).appendField(new Blockly.FieldTextInput(type.includes("method") ? "method" : "my_function"), "NAME").appendField("("); this.parameters_ = initial.map((item) => ({ ...item })); rebuildParameterShape(this); this.appendStatementInput("BODY"); this.setMutator(createMutatorIcon([type.includes("typed_function") ? "python_typed_parameter_item" : "python_parameter_item"], this as Blockly.BlockSvg)); } } as any;
}
defineStructuredFunction("python_function_structured", "定义函数", colours.function, [{ kind: "positional", name: "value" }]);
defineStructuredFunction("python_method_structured", "定义方法", colours.object, [{ kind: "positional", name: "self" }]);
defineStructuredFunction("python_async_function_structured", "定义异步函数", colours.function, [{ kind: "positional", name: "value" }]);
defineStructuredFunction("python_typed_function_structured", "定义带类型函数", colours.function, [{ kind: "positional", name: "value", annotation: "object" }]);
defineStructuredFunction("python_async_typed_function_structured", "定义异步带类型函数", colours.function, [{ kind: "positional", name: "value", annotation: "object" }]);

function rebuildArgumentShape(block: any) {
  for (const input of [...block.inputList]) {
    if (/^ARG\d+$/.test(input.name)) block.removeInput(input.name);
  }
  block.getInput("TAIL") && block.removeInput("TAIL");
  const target = block.getFieldValue("TARGET") || (block.type.includes("method") ? "items.append" : block.type.includes("new_object") ? "Person" : "function");
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
        args.push({ kind: item.getFieldValue("KIND"), name: item.getFieldValue("NAME") || "name" });
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
    this.arguments_ = normalized;
    rebuildArgumentShape(this);
    connections.forEach((connection, index) => connection?.reconnect(this, `ARG${index}`));
  },
  saveConnections(this: any, container: Blockly.Block) { let item = container.getInputTargetBlock("STACK"); let i = 0; while (item) { if (!item.isInsertionMarker()) { (item as any).valueConnection_ = this.getInput(`ARG${i}`)?.connection?.targetConnection; i++; } item = item.getNextBlock(); } },
};
Blockly.Blocks.python_argument_container = { init(this: Blockly.Block) { this.setColour(colours.call); this.appendDummyInput().appendField("调用参数"); this.appendStatementInput("STACK"); this.contextMenu = false; } };
Blockly.Blocks.python_argument_item = { init(this: Blockly.Block) { this.setColour(colours.call); this.appendDummyInput().appendField(new Blockly.FieldDropdown([["位置参数", "positional"], ["关键字参数", "keyword"], ["展开参数 *", "star"], ["展开关键字参数 **", "kwargs"]]), "KIND").appendField(new Blockly.FieldTextInput("name"), "NAME"); this.setPreviousStatement(true); this.setNextStatement(true); this.contextMenu = false; } };

function defineStructuredCall(type: string, mode: "value" | "statement", target: "function" | "method" | "class") {
  Blockly.Blocks[type] = { ...argumentMixin, init(this: any) { this.setColour(target === "function" ? colours.call : colours.object); if (mode === "value") this.setOutput(true); else { this.setPreviousStatement(true); this.setNextStatement(true); } const head = this.appendDummyInput("HEAD"); if (target === "method") head.appendField("对象"); head.appendField(new Blockly.FieldTextInput(target === "class" ? "Person" : target === "method" ? "items.append" : "function"), "TARGET").appendField("("); this.arguments_ = []; rebuildArgumentShape(this); this.setMutator(createMutatorIcon(["python_argument_item"], this as Blockly.BlockSvg)); } } as any;
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
const safeIdentifier = (input: string, fallback: string) => /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(input.trim()) ? input.trim() : fallback;
const variableName = (generator: typeof pythonGenerator, block: Blockly.Block, field: string, fallback: string) => {
  const id = block.getFieldValue(field);
  return id ? generator.getVariableName(id) : fallback;
};
const safeParameters = (input: string) => input.split(",").map((part) => part.trim()).filter(Boolean).filter((part) => /^(?:\*{0,2}[A-Za-z_]\w*|[A-Za-z_]\w*\s*=\s*[^,]+)$/.test(part)).join(", ");
const safeAnnotation = (input: string, fallback = "object") => /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\[[A-Za-z0-9_., |\[\]]+\])?(?:\s*\|\s*[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)*$/.test(String(input || "").trim()) ? String(input).trim() : fallback;
const suite = (generator: typeof pythonGenerator, block: Blockly.Block, name: string) => generator.statementToCode(block, name) || `${generator.INDENT}pass\n`;

pythonGenerator.forBlock.python_print = (block, generator) => `print(${value(generator, block, "VALUE", "''")})\n`;
pythonGenerator.forBlock.python_input = (block, generator) => [`input(${value(generator, block, "PROMPT", "''")})`, Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_input_assign = (block, generator) => `${variableName(generator, block, "VAR", "answer")} = input(${value(generator, block, "PROMPT", "''")})\n`;
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
pythonGenerator.forBlock.python_call = (block, generator) => [`${safeIdentifier(block.getFieldValue("NAME"), "function")}(${value(generator, block, "ARG", "")})`, Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_call_statement = (block, generator) => `${safeIdentifier(block.getFieldValue("NAME"), "function")}(${value(generator, block, "ARG", "")})\n`;
pythonGenerator.forBlock.python_keyword_argument = (block, generator) => [`${safeIdentifier(block.getFieldValue("NAME"), "name")}=${value(generator, block, "VALUE")}`, Order.ATOMIC];
pythonGenerator.forBlock.python_tuple = (block, generator) => [`(${value(generator, block, "A")}, ${value(generator, block, "B")})`, Order.COLLECTION];
pythonGenerator.forBlock.python_set = (block, generator) => [`{${value(generator, block, "A")}, ${value(generator, block, "B")}}`, Order.COLLECTION];
pythonGenerator.forBlock.python_dict = (block, generator) => [`{${value(generator, block, "K1")}: ${value(generator, block, "V1")}, ${value(generator, block, "K2")}: ${value(generator, block, "V2")}}`, Order.COLLECTION];
pythonGenerator.forBlock.python_index = (block, generator) => [`${value(generator, block, "OBJECT", "None", Order.MEMBER)}[${value(generator, block, "INDEX", "0")}]`, Order.MEMBER];
pythonGenerator.forBlock.python_slice = (block, generator) => [`${value(generator, block, "OBJECT", "None", Order.MEMBER)}[${value(generator, block, "START", "")}:${value(generator, block, "STOP", "")}:${value(generator, block, "STEP", "")}]`, Order.MEMBER];
pythonGenerator.forBlock.python_attribute = (block, generator) => [`${value(generator, block, "OBJECT", "None", Order.MEMBER)}.${safeIdentifier(block.getFieldValue("ATTRIBUTE"), "attribute")}`, Order.MEMBER];
pythonGenerator.forBlock.python_method_call = (block, generator) => [`${value(generator, block, "OBJECT", "None", Order.MEMBER)}.${safeIdentifier(block.getFieldValue("METHOD"), "method")}(${value(generator, block, "ARG", "")})`, Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_method_statement = (block, generator) => `${value(generator, block, "OBJECT")}.${safeIdentifier(block.getFieldValue("METHOD"), "method")}(${value(generator, block, "ARG", "")})\n`;
pythonGenerator.forBlock.python_new_object = (block, generator) => [`${safeIdentifier(block.getFieldValue("CLASS"), "Object")}(${value(generator, block, "ARG", "")})`, Order.FUNCTION_CALL];
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
pythonGenerator.forBlock.python_for_in = (block, generator) => `for ${variableName(generator, block, "VAR", "item")} in ${value(generator, block, "ITERABLE", "[]")}:\n${suite(generator, block, "DO")}`;
pythonGenerator.forBlock.python_for_enumerate = (block, generator) => `for ${variableName(generator, block, "INDEX", "index")}, ${variableName(generator, block, "VALUE", "item")} in enumerate(${value(generator, block, "ITERABLE", "[]")}):\n${suite(generator, block, "DO")}`;
pythonGenerator.forBlock.python_while_else = (block, generator) => `while ${value(generator, block, "CONDITION", "False")}:\n${suite(generator, block, "DO")}else:\n${suite(generator, block, "ELSE")}`;
pythonGenerator.forBlock.python_for_else = (block, generator) => `for ${variableName(generator, block, "VAR", "item")} in ${value(generator, block, "ITERABLE", "[]")}:\n${suite(generator, block, "DO")}else:\n${suite(generator, block, "ELSE")}`;
pythonGenerator.forBlock.python_pass = () => "pass\n";
pythonGenerator.forBlock.python_assert = (block, generator) => {
  const message = generator.valueToCode(block, "MESSAGE", Order.NONE);
  return `assert ${value(generator, block, "CONDITION", "False")}${message ? `, ${message}` : ""}\n`;
};
pythonGenerator.forBlock.python_scope_declaration = (block) => {
  const names = block.getFieldValue("NAMES").split(",").map((name: string) => safeIdentifier(name, "")).filter(Boolean).join(", ");
  return names ? `${block.getFieldValue("SCOPE")} ${names}\n` : "";
};
pythonGenerator.forBlock.python_function_def = (block, generator) => `def ${safeIdentifier(block.getFieldValue("NAME"), "my_function")}(${safeParameters(block.getFieldValue("PARAMS"))}):\n${suite(generator, block, "BODY")}`;
pythonGenerator.forBlock.python_method_def = pythonGenerator.forBlock.python_function_def;
pythonGenerator.forBlock.python_class_def = (block, generator) => {
  const bases = block.getFieldValue("BASES").split(",").map((base: string) => safeIdentifier(base, "object")).join(", ");
  return `class ${safeIdentifier(block.getFieldValue("NAME"), "MyClass")}(${bases || "object"}):\n${suite(generator, block, "BODY")}`;
};
pythonGenerator.forBlock.python_set_attribute = (block, generator) => `${value(generator, block, "OBJECT", "self", Order.MEMBER)}.${safeIdentifier(block.getFieldValue("ATTRIBUTE"), "attribute")} = ${value(generator, block, "VALUE")}\n`;
pythonGenerator.forBlock.python_super_call = (block, generator) => `super().${safeIdentifier(block.getFieldValue("METHOD"), "__init__")}(${value(generator, block, "ARG", "")})\n`;
pythonGenerator.forBlock.python_try_full = (block, generator) => `try:\n${suite(generator, block, "TRY")}except ${safeIdentifier(block.getFieldValue("ERROR"), "Exception")} as ${variableName(generator, block, "ALIAS", "error")}:\n${suite(generator, block, "EXCEPT")}else:\n${suite(generator, block, "ELSE")}finally:\n${suite(generator, block, "FINALLY")}`;
pythonGenerator.forBlock.python_with = (block, generator) => `with ${value(generator, block, "CONTEXT")} as ${variableName(generator, block, "ALIAS", "resource")}:\n${suite(generator, block, "BODY")}`;
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
  const argument = optionalValue(generator, block, "ARG");
  return [`${value(generator, block, "TEXT", "''", Order.MEMBER)}.${block.getFieldValue("METHOD")}(${argument})`, Order.FUNCTION_CALL];
};
pythonGenerator.forBlock.python_list_method = (block, generator) => {
  const argument = optionalValue(generator, block, "ARG");
  return `${value(generator, block, "LIST", "[]", Order.MEMBER)}.${block.getFieldValue("METHOD")}(${argument})\n`;
};
pythonGenerator.forBlock.python_dict_get = (block, generator) => {
  const fallback = optionalValue(generator, block, "DEFAULT");
  return [`${value(generator, block, "DICT", "{}", Order.MEMBER)}.get(${value(generator, block, "KEY")}${fallback ? `, ${fallback}` : ""})`, Order.FUNCTION_CALL];
};
pythonGenerator.forBlock.python_dict_view = (block, generator) => [`${value(generator, block, "DICT", "{}", Order.MEMBER)}.${block.getFieldValue("METHOD")}()`, Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_open_file = (block, generator) => {
  const mode = block.getFieldValue("MODE");
  const encoding = block.getFieldValue("ENCODING").trim();
  const encodingArgument = mode.includes("b") || !encoding ? "" : `, encoding=${JSON.stringify(encoding)}`;
  return [`open(${value(generator, block, "PATH", "''")}, ${JSON.stringify(mode)}${encodingArgument})`, Order.FUNCTION_CALL];
};
pythonGenerator.forBlock.python_file_read = (block, generator) => {
  const size = optionalValue(generator, block, "SIZE");
  return [`${value(generator, block, "FILE", "file", Order.MEMBER)}.read(${size})`, Order.FUNCTION_CALL];
};
pythonGenerator.forBlock.python_file_write = (block, generator) => `${value(generator, block, "FILE", "file", Order.MEMBER)}.write(${value(generator, block, "VALUE", "''")})\n`;
const comprehensionCondition = (generator: typeof pythonGenerator, block: Blockly.Block) => {
  const condition = generator.valueToCode(block, "CONDITION", Order.NONE);
  return condition ? ` if ${condition}` : "";
};
pythonGenerator.forBlock.python_list_comprehension = (block, generator) => [`[${value(generator, block, "EXPRESSION")} for ${safeIdentifier(block.getFieldValue("VAR"), "item")} in ${value(generator, block, "ITERABLE", "[]")}${comprehensionCondition(generator, block)}]`, Order.COLLECTION];
pythonGenerator.forBlock.python_set_comprehension = (block, generator) => [`{${value(generator, block, "EXPRESSION")} for ${safeIdentifier(block.getFieldValue("VAR"), "item")} in ${value(generator, block, "ITERABLE", "[]")}${comprehensionCondition(generator, block)}}`, Order.COLLECTION];
pythonGenerator.forBlock.python_dict_comprehension = (block, generator) => [`{${value(generator, block, "KEY")}: ${value(generator, block, "VALUE")} for ${safeIdentifier(block.getFieldValue("VAR"), "item")} in ${value(generator, block, "ITERABLE", "[]")}${comprehensionCondition(generator, block)}}`, Order.COLLECTION];
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
    const name = safeIdentifier(block.getFieldValue(`PARAM_NAME${i}`) || spec.name, "value");
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
pythonGenerator.forBlock.python_function_structured = (block, generator) => `def ${safeIdentifier(block.getFieldValue("NAME"), "my_function")}(${structuredParameters(block, generator)}):\n${suite(generator, block, "BODY")}`;
pythonGenerator.forBlock.python_method_structured = pythonGenerator.forBlock.python_function_structured;
pythonGenerator.forBlock.python_async_function_structured = (block, generator) => `async def ${safeIdentifier(block.getFieldValue("NAME"), "my_function")}(${structuredParameters(block, generator)}):\n${suite(generator, block, "BODY")}`;
pythonGenerator.forBlock.python_typed_function_structured = (block, generator) => `def ${safeIdentifier(block.getFieldValue("NAME"), "my_function")}(${structuredParameters(block, generator)}) -> ${safeAnnotation(block.getFieldValue("RETURN_TYPE"), "None")}:\n${suite(generator, block, "BODY")}`;
pythonGenerator.forBlock.python_async_typed_function_structured = (block, generator) => `async def ${safeIdentifier(block.getFieldValue("NAME"), "my_function")}(${structuredParameters(block, generator)}) -> ${safeAnnotation(block.getFieldValue("RETURN_TYPE"), "None")}:\n${suite(generator, block, "BODY")}`;
const structuredArguments = (block: Blockly.Block, generator: typeof pythonGenerator) => {
  const specs = (block as Blockly.Block & { arguments_?: ArgumentSpec[] }).arguments_ ?? [];
  return specs.map((spec, i) => {
    const argument = value(generator, block, `ARG${i}`);
    if (spec.kind === "keyword") return `${safeIdentifier(block.getFieldValue(`ARG_NAME${i}`) || spec.name, "name")}=${argument}`;
    if (spec.kind === "star") return `*${argument}`;
    if (spec.kind === "kwargs") return `**${argument}`;
    return argument;
  }).join(", ");
};
const structuredCallCode = (block: Blockly.Block, generator: typeof pythonGenerator) => `${safeIdentifier(block.getFieldValue("TARGET"), "function")}(${structuredArguments(block, generator)})`;
pythonGenerator.forBlock.python_call_structured = (block, generator) => [structuredCallCode(block, generator), Order.FUNCTION_CALL];
pythonGenerator.forBlock.python_call_statement_structured = (block, generator) => `${structuredCallCode(block, generator)}\n`;
pythonGenerator.forBlock.python_method_call_structured = pythonGenerator.forBlock.python_call_structured;
pythonGenerator.forBlock.python_method_statement_structured = pythonGenerator.forBlock.python_call_statement_structured;
pythonGenerator.forBlock.python_new_object_structured = pythonGenerator.forBlock.python_call_structured;

export const toolbox: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: "categoryToolbox",
  contents: [
    { kind: "category", name: "输入输出", colour: "#2f9e8f", contents: [{ kind: "block", type: "python_print" }, { kind: "block", type: "python_input" }, { kind: "block", type: "python_input_assign" }, { kind: "block", type: "python_length" }, { kind: "block", type: "python_convert" }, { kind: "block", type: "text", fields: { TEXT: "hello python" } }] },
    { kind: "category", name: "赋值", colour: "#b95073", contents: [...pythonSyntaxToolbox.assignment] },
    { kind: "category", name: "逻辑", categorystyle: "logic_category", contents: [{ kind: "block", type: "controls_if" }, { kind: "block", type: "logic_compare" }, { kind: "block", type: "logic_operation" }, { kind: "block", type: "logic_negate" }, { kind: "block", type: "logic_boolean" }, { kind: "block", type: "python_none" }, { kind: "block", type: "python_membership" }, { kind: "block", type: "python_identity" }, { kind: "block", type: "python_conditional" }, ...pythonSyntaxToolbox.logic] },
    { kind: "category", name: "循环", categorystyle: "loop_category", contents: [{ kind: "block", type: "python_for_in" }, { kind: "block", type: "python_for_enumerate" }, { kind: "block", type: "python_for_else" }, { kind: "block", type: "python_while_else" }, { kind: "block", type: "python_range" }, { kind: "block", type: "controls_repeat_ext" }, { kind: "block", type: "controls_whileUntil" }, { kind: "block", type: "controls_for" }, { kind: "block", type: "controls_flow_statements" }, { kind: "block", type: "python_pass" }] },
    { kind: "category", name: "数学", categorystyle: "math_category", contents: [
      { kind: "block", type: "math_number" }, { kind: "block", type: "math_arithmetic" }, { kind: "block", type: "python_floor_divide" }, { kind: "block", type: "math_modulo" }, { kind: "block", type: "python_bitwise" }, { kind: "block", type: "python_bitwise_not" },
      { kind: "block", type: "math_single" }, { kind: "block", type: "math_round" }, { kind: "block", type: "math_constant" }, { kind: "block", type: "math_constrain" },
      { kind: "block", type: "math_random_int" }, { kind: "block", type: "math_random_float" }, { kind: "block", type: "math_on_list" }, ...pythonSyntaxToolbox.math,
    ] },
    { kind: "category", name: "文本", categorystyle: "text_category", contents: [
      { kind: "block", type: "text", fields: { TEXT: "hello python" } },
      { kind: "block", type: "text_join", extraState: { itemCount: 1 } },
      { kind: "block", type: "text_length" }, { kind: "block", type: "python_string_method" }, ...pythonSyntaxToolbox.text,
    ] },
    { kind: "category", name: "集合", colour: "#7657b5", contents: [
      { kind: "block", type: "python_sequence_collection", fields: { KIND: "list" } },
      { kind: "block", type: "python_sequence_collection", fields: { KIND: "tuple" } },
      { kind: "block", type: "python_sequence_collection", fields: { KIND: "set" } },
      { kind: "block", type: "python_dynamic_dict" },
      { kind: "block", type: "python_list_comprehension" }, { kind: "block", type: "python_set_comprehension" }, { kind: "block", type: "python_dict_comprehension" },
      { kind: "block", type: "python_index" }, { kind: "block", type: "python_slice" }, { kind: "block", type: "python_list_method" }, { kind: "block", type: "python_dict_get" }, { kind: "block", type: "python_dict_view" },
    ] },
    { kind: "category", name: "内置函数", colour: "#397bc0", contents: [...pythonSyntaxToolbox.builtins] },
    { kind: "category", name: "变量", categorystyle: "variable_category", custom: "USED_VARIABLES" },
    { kind: "category", name: "函数", categorystyle: "procedure_category", contents: [{ kind: "block", type: "python_function_structured" }, { kind: "block", type: "python_lambda" }, { kind: "block", type: "python_decorated_definition" }, { kind: "block", type: "python_scope_declaration" }, { kind: "block", type: "python_return" }, ...pythonSyntaxToolbox.function] },
    { kind: "category", name: "调用", colour: "#397bc0", custom: "DEFINED_FUNCTION_CALLS" },
    { kind: "category", name: "对象", colour: "#a64ca6", contents: [{ kind: "block", type: "python_class_def" }, { kind: "block", type: "python_method_structured" }, { kind: "block", type: "python_set_attribute" }, { kind: "block", type: "python_super_call" }, { kind: "block", type: "python_new_object_structured" }, { kind: "block", type: "python_attribute" }, { kind: "block", type: "python_method_call_structured" }, { kind: "block", type: "python_method_statement_structured" }] },
    { kind: "category", name: "异常", colour: "#b95050", contents: [{ kind: "block", type: "python_try_full" }, { kind: "block", type: "python_try_except" }, { kind: "block", type: "python_try_two_except" }, { kind: "block", type: "python_with" }, { kind: "block", type: "python_raise" }, { kind: "block", type: "python_assert" }, ...pythonSyntaxToolbox.exception] },
    { kind: "category", name: "模块", colour: "#c58b32", contents: [{ kind: "block", type: "python_import" }, { kind: "block", type: "python_from_import" }, ...pythonSyntaxToolbox.module, { kind: "block", type: "python_open_file" }, { kind: "block", type: "python_file_read" }, { kind: "block", type: "python_file_write" }, { kind: "block", type: "python_raw_expression" }] },
    { kind: "category", name: "标准库", colour: "#c58b32", contents: [...pythonSyntaxToolbox.standardLibrary] },
    { kind: "category", name: "现代语法", colour: "#5968b0", contents: [...pythonSyntaxToolbox.modern] },
    { kind: "category", name: "异步", colour: "#8762b8", contents: [...pythonSyntaxToolbox.async] },
  ],
};

export const starterState = {
  blocks: { languageVersion: 0, blocks: [{ type: "variables_set", x: 90, y: 70, fields: { VAR: { name: "message" } }, inputs: { VALUE: { block: { type: "text", fields: { TEXT: "Hello, Python!" } } } }, next: { block: { type: "python_print", inputs: { VALUE: { block: { type: "variables_get", fields: { VAR: { name: "message" } } } } }, next: { block: { type: "controls_repeat_ext", inputs: { TIMES: { shadow: { type: "math_number", fields: { NUM: 3 } } }, DO: { block: { type: "python_print", inputs: { VALUE: { block: { type: "text", fields: { TEXT: "Visual coding" } } } } } } } } } } } }] },
};

function stripGeneratedVariableDeclarations(code: string): string {
  const lines = code.split("\n");
  let index = 0;
  while (/^[A-Za-z_]\w* = None$/.test(lines[index] || "")) index += 1;
  if (!index) return code;
  while (!lines[index]?.trim()) index += 1;
  return lines.slice(index).join("\n");
}

export function generatePython(state: object): string {
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(state, workspace);
  const code = stripGeneratedVariableDeclarations(pythonGenerator.workspaceToCode(workspace));
  workspace.dispose();
  return code;
}

export function generateWorkspacePython(workspace: Blockly.Workspace): string {
  return stripGeneratedVariableDeclarations(pythonGenerator.workspaceToCode(workspace));
}

export type GeneratedBlockMap = { code: string; blockIdByLine: Map<number, string> };

export function generateWorkspacePythonWithBlockMap(workspace: Blockly.Workspace): GeneratedBlockMap {
  const previousPrefix = pythonGenerator.STATEMENT_PREFIX;
  pythonGenerator.STATEMENT_PREFIX = "# __visual_python_block_%1__\n";
  try {
    const code = stripGeneratedVariableDeclarations(pythonGenerator.workspaceToCode(workspace));
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
  } finally {
    pythonGenerator.STATEMENT_PREFIX = previousPrefix;
  }
}

export function buildDefinedFunctionCallToolbox(workspace: Blockly.Workspace): Blockly.utils.toolbox.FlyoutItemInfoArray {
  const names = new Set<string>();
  const calls: Blockly.utils.toolbox.FlyoutItemInfoArray = [
    { kind: "block", type: "python_call_structured" },
    { kind: "block", type: "python_call_statement_structured" },
  ];
  const definedCalls: Blockly.utils.toolbox.FlyoutItemInfoArray = [];
  const structuredFunctionTypes = new Set([
    "python_function_structured",
    "python_async_function_structured",
    "python_typed_function_structured",
    "python_async_typed_function_structured",
  ]);
  for (const block of workspace.getAllBlocks(false)) {
    if (!structuredFunctionTypes.has(block.type) && block.type !== "python_function_def") continue;
    const surroundParent = block.getSurroundParent();
    if (surroundParent && surroundParent.type !== "python_decorated_definition") continue;
    const name = safeIdentifier(block.getFieldValue("NAME") || "", "");
    if (!name || names.has(name)) continue;
    names.add(name);

    let parameters: ParameterSpec[] = [];
    if (structuredFunctionTypes.has(block.type)) {
      parameters = ((block as Blockly.Block & { parameters_?: ParameterSpec[] }).parameters_ ?? []).map((parameter, index) => ({
        ...parameter,
        name: block.getFieldValue(`PARAM_NAME${index}`) || parameter.name,
      }));
    } else {
      parameters = String(block.getFieldValue("PARAMS") || "").split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
        const rawName = part.replace(/^\*{1,2}/, "").split("=", 1)[0].trim();
        return { kind: part.startsWith("**") ? "kwargs" : part.startsWith("*") ? "args" : part.includes("=") ? "default" : "positional", name: rawName } as ParameterSpec;
      });
    }

    const arguments_: ArgumentSpec[] = parameters.filter((parameter) => parameter.kind !== "args" && parameter.kind !== "kwargs").map((parameter) => parameter.kind === "default" || parameter.kind === "keyword_only" || parameter.kind === "keyword_only_default"
      ? { kind: "keyword", name: parameter.name }
      : { kind: "positional", name: "" });
    const fields: Record<string, string> = { TARGET: name };
    arguments_.forEach((argument, index) => { if (argument.kind === "keyword") fields[`ARG_NAME${index}`] = argument.name; });
    definedCalls.push({ kind: "block", type: "python_call_structured", fields, extraState: { arguments: arguments_ } } as Blockly.utils.toolbox.BlockInfo);
  }
  if (definedCalls.length) calls.push({ kind: "sep", gap: 20 }, ...definedCalls);
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
}
