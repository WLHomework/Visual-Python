import * as Blockly from "blockly/core";
import { pythonGenerator, Order } from "blockly/python";
import { localizeBlockDefinitions } from "./blockDisplayLocalization";
import { isDottedPythonIdentifier, isPythonAnnotation, isPythonIdentifier, pythonIdentifierOrFallback, sanitizePythonIdentifier } from "./pythonIdentifiers";

export type PythonSyntaxColours = {
  variable: string;
  text: string;
  function: string;
  logic: string;
  loop: string;
  exception: string;
  module: string;
  call: string;
  collection: string;
  file: string;
};

const identifier = (input: string, fallback: string) => {
  return pythonIdentifierOrFallback(input, fallback);
};

const importName = (input: string, fallback: string) => {
  const value = String(input || "").trim().normalize("NFKC");
  const relativePrefix = value.match(/^\.+/)?.[0] || "";
  return isDottedPythonIdentifier(value.slice(relativePrefix.length)) ? value : fallback;
};

const annotationName = (input: string, fallback = "object") => {
  const value = String(input || "").trim();
  return isPythonAnnotation(value) ? value.normalize("NFKC") : fallback;
};

const value = (
  generator: typeof pythonGenerator,
  block: Blockly.Block,
  name: string,
  fallback = "None",
  order = Order.NONE,
) => generator.valueToCode(block, name, order) || fallback;

const optionalValue = (generator: typeof pythonGenerator, block: Blockly.Block, name: string) =>
  generator.valueToCode(block, name, Order.NONE);

const suite = (generator: typeof pythonGenerator, block: Blockly.Block, name: string) =>
  generator.statementToCode(block, name) || `${generator.INDENT}pass\n`;

const variableName = (generator: typeof pythonGenerator, block: Blockly.Block, field: string, fallback: string) => {
  const id = block.getFieldValue(field);
  return id ? generator.getVariableName(id) : fallback;
};

const escapeFStringText = (input: string) => String(input || "")
  .replace(/\\/g, "\\\\")
  .replace(/\{/g, "{{")
  .replace(/\}/g, "}}")
  .replace(/\n/g, "\\n")
  .replace(/\r/g, "\\r")
  .replace(/\"/g, '\\"');

const numberShadow = (value: number) => ({ shadow: { type: "math_number", fields: { NUM: value } } });
const textShadow = (value: string) => ({ shadow: { type: "text", fields: { TEXT: value } } });
const listShadow = (values: number[] = []) => ({
  block: {
    type: "python_list_collection",
    extraState: { itemCount: values.length },
    inputs: Object.fromEntries(values.map((item, index) => [`ITEM${index}`, numberShadow(item)])),
  },
});
const shadowList = (values: number[] = []) => ({
  shadow: {
    type: "python_list_collection",
    extraState: { itemCount: values.length },
    inputs: Object.fromEntries(values.map((item, index) => [`ITEM${index}`, numberShadow(item)])),
  },
});
const pathShadow = (path: string) => ({ shadow: { type: "python_path_create", inputs: { VALUE: textShadow(path) } } });
const variableField = (name: string) => ({ id: `toolbox-variable-${name}`, name });
const variableTargetShadow = (name = "数值") => ({ shadow: { type: "python_variable_target", fields: { VAR: variableField(name) } } });
const variableValueShadow = (name = "数值") => ({ shadow: { type: "variables_get", fields: { VAR: variableField(name) } } });
const expressionShadow = (code: string) => ({ shadow: { type: "python_raw_expression", fields: { CODE: code } } });
const openFileShadow = (path: string, mode: "r" | "w" | "a" = "r") => ({
  shadow: {
    type: "python_open_file",
    fields: { MODE: mode, ENCODING: "utf-8" },
    inputs: { PATH: textShadow(path) },
  },
});

export const pythonSyntaxToolbox = {
  assignment: [
    { kind: "block", type: "python_assign_target", inputs: { TARGET: variableTargetShadow(), VALUE: numberShadow(0) } },
    { kind: "block", type: "python_augmented_assign", fields: { OP: "+=" }, inputs: { TARGET: variableTargetShadow(), VALUE: numberShadow(1) } },
    { kind: "block", type: "python_variable_target" },
    { kind: "block", type: "python_index_target", inputs: { OBJECT: variableValueShadow("项目列表"), INDEX: numberShadow(0) } },
    { kind: "block", type: "python_slice_target", inputs: { OBJECT: variableValueShadow("项目列表"), START: numberShadow(0), STOP: numberShadow(2), STEP: numberShadow(1) } },
    { kind: "block", type: "python_attribute_target", inputs: { OBJECT: variableValueShadow("对象") } },
    { kind: "block", type: "python_unpack_target", inputs: { A: variableTargetShadow("第一个值"), B: variableTargetShadow("第二个值") } },
    { kind: "block", type: "python_unpack_many_target", extraState: { itemCount: 3 }, inputs: { TARGET0: variableTargetShadow("第一项"), TARGET1: variableTargetShadow("第二项"), TARGET2: variableTargetShadow("第三项") } },
    { kind: "block", type: "python_delete", inputs: { TARGET: variableTargetShadow() } },
    { kind: "block", type: "python_annotated_assign", inputs: { VALUE: numberShadow(0) } },
    { kind: "block", type: "python_starred_target", inputs: { TARGET: variableTargetShadow("其余值") } },
    { kind: "block", type: "python_walrus", inputs: { VALUE: numberShadow(0) } },
  ],
  text: [
    { kind: "block", type: "python_f_string", inputs: { VALUE: numberShadow(42) } },
    { kind: "block", type: "python_multiline_string" },
    { kind: "block", type: "python_bytes" },
  ],
  math: [
    { kind: "block", type: "python_matrix_multiply", inputs: { A: variableValueShadow("矩阵甲"), B: variableValueShadow("矩阵乙") } },
  ],
  builtins: [
    { kind: "label", text: "集合处理", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_builtin_sum", inputs: { ITERABLE: listShadow([1, 2, 3]) } },
    { kind: "block", type: "python_builtin_min_max", fields: { FUNCTION: "min" }, inputs: { ITERABLE: listShadow([1, 2, 3]) } },
    { kind: "block", type: "python_builtin_sorted", inputs: { ITERABLE: listShadow([3, 1, 2]) } },
    { kind: "block", type: "python_builtin_any_all", fields: { FUNCTION: "any" }, inputs: { ITERABLE: listShadow([0, 1, 0]) } },
    { kind: "block", type: "python_builtin_zip", inputs: { A: listShadow([1, 2, 3]), B: listShadow([4, 5, 6]) } },
    { kind: "block", type: "python_builtin_enumerate", inputs: { ITERABLE: listShadow([1, 2, 3]) } },
    { kind: "block", type: "python_builtin_reversed", inputs: { ITERABLE: listShadow([1, 2, 3]) } },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "类型与数值", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_builtin_type", inputs: { VALUE: textShadow("示例") } },
    { kind: "block", type: "python_builtin_isinstance", inputs: { OBJECT: textShadow("示例"), TYPES: expressionShadow("str") } },
    { kind: "block", type: "python_builtin_abs", inputs: { VALUE: numberShadow(-3) } },
    { kind: "block", type: "python_builtin_pow", inputs: { BASE: numberShadow(2), EXPONENT: numberShadow(3) } },
    { kind: "block", type: "python_builtin_divmod", inputs: { A: numberShadow(7), B: numberShadow(3) } },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "迭代工具", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_builtin_map_filter", fields: { FUNCTION: "map" }, inputs: { CALLABLE: expressionShadow("lambda 数值: 数值 * 2"), ITERABLE: listShadow([1, 2, 3]) } },
    { kind: "block", type: "python_builtin_iter", inputs: { ITERABLE: listShadow([1, 2, 3]) } },
    { kind: "block", type: "python_builtin_next", inputs: { ITERATOR: { shadow: { type: "python_builtin_iter", inputs: { ITERABLE: shadowList([1, 2, 3]) } } } } },
  ],
  logic: [
    { kind: "block", type: "python_chained_compare", fields: { OP1: "<", OP2: "<" }, inputs: { A: numberShadow(0), B: numberShadow(5), C: numberShadow(10) } },
  ],
  function: [
    { kind: "block", type: "python_yield", inputs: { VALUE: numberShadow(0) } },
    { kind: "block", type: "python_yield_from", inputs: { VALUE: listShadow([1, 2, 3]) } },
    { kind: "block", type: "python_generator_expression", fields: { VAR: variableField("项目") }, inputs: { EXPRESSION: expressionShadow("项目 * 2"), ITERABLE: listShadow([1, 2, 3]) } },
  ],
  exception: [
    { kind: "block", type: "python_raise_from", inputs: { ERROR: expressionShadow("ValueError('处理失败')"), CAUSE: variableValueShadow("错误") } },
  ],
  file: [
    { kind: "block", type: "python_path_create", fields: { PATH_KIND: "file" }, inputs: { VALUE: textShadow("data.txt") } },
    { kind: "block", type: "python_path_join", inputs: { BASE: pathShadow("output"), CHILD: textShadow("data.txt") } },
    { kind: "block", type: "python_path_check", inputs: { PATH: pathShadow("data.txt") } },
    { kind: "block", type: "python_path_read_text", inputs: { PATH: pathShadow("data.txt"), ENCODING: textShadow("utf-8") } },
    { kind: "block", type: "python_path_write_text", inputs: { PATH: pathShadow("data.txt"), TEXT: textShadow("示例内容"), ENCODING: textShadow("utf-8") } },
    { kind: "block", type: "python_with_no_alias", inputs: { CONTEXT: openFileShadow("output.txt", "w") } },
    { kind: "block", type: "python_with_two", fields: { ALIAS1: variableField("源文件"), ALIAS2: variableField("目标文件") }, inputs: { CONTEXT1: openFileShadow("source.txt"), CONTEXT2: openFileShadow("target.txt", "w") } },
  ],
  module: [
    { kind: "block", type: "python_import_as", fields: { MODULE: "json", ALIAS: "json_module" } },
    { kind: "block", type: "python_import_multiple", fields: { MODULE1: "os", MODULE2: "sys" } },
    { kind: "block", type: "python_from_import_as", fields: { MODULE: "pathlib", NAME: "Path", ALIAS: "FilePath" } },
    { kind: "block", type: "python_from_import_multiple", fields: { MODULE: "collections", NAME1: "Counter", NAME2: "defaultdict" } },
    { kind: "block", type: "python_from_import_star", fields: { MODULE: "math" } },
  ],
  standardLibrary: [
    { kind: "label", text: "输入输出", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_pprint", inputs: { VALUE: expressionShadow("数据") } },
    { kind: "block", type: "python_sys_argv" },
    { kind: "block", type: "python_sys_exit", inputs: { CODE: numberShadow(0) } },
    { kind: "block", type: "python_csv_read", fields: { VAR: variableField("表格数据"), DELIMITER: "," }, inputs: { PATH: textShadow("scores.csv") } },
    { kind: "block", type: "python_csv_write", fields: { DELIMITER: "," }, inputs: { PATH: textShadow("scores.csv"), DATA: listShadow([1, 2, 3]) } },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "数学", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_math_constant" },
    { kind: "block", type: "python_math_unary", inputs: { VALUE: numberShadow(9) } },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "随机", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_random_randint", inputs: { A: numberShadow(1), B: numberShadow(10) } },
    { kind: "block", type: "python_random_uniform", inputs: { A: numberShadow(0), B: numberShadow(1) } },
    { kind: "block", type: "python_random_choice", inputs: { SEQUENCE: listShadow([1, 2, 3]) } },
    { kind: "block", type: "python_random_sample", inputs: { POPULATION: listShadow([1, 2, 3]), K: numberShadow(1) } },
    { kind: "block", type: "python_random_shuffle", inputs: { SEQUENCE: listShadow([1, 2, 3]) } },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "JSON", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_json_dumps", inputs: { VALUE: textShadow("示例"), INDENT: numberShadow(2) } },
    { kind: "block", type: "python_json_loads", inputs: { TEXT: textShadow("{\"名称\": \"示例\"}") } },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "日期与时间", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_datetime_now" },
    { kind: "block", type: "python_datetime_parse", inputs: { TEXT: textShadow("2026-01-01"), FORMAT: textShadow("%Y-%m-%d") } },
    { kind: "block", type: "python_datetime_format", inputs: { VALUE: { shadow: { type: "python_datetime_now", fields: { MODE: "now" } } }, FORMAT: textShadow("%Y-%m-%d %H:%M") } },
    { kind: "block", type: "python_datetime_timedelta", inputs: { DAYS: numberShadow(1) } },
    { kind: "block", type: "python_time_sleep", inputs: { SECONDS: numberShadow(1) } },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "系统", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_os_getenv", inputs: { NAME: textShadow("HOME") } },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "正则表达式", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_re_search", inputs: { PATTERN: textShadow("[0-9]+"), TEXT: textShadow("编号 123") } },
    { kind: "block", type: "python_re_sub", inputs: { PATTERN: textShadow("\\s+"), REPLACEMENT: textShadow(" "), TEXT: textShadow("示例  文本") } },
    { kind: "block", type: "python_re_split", inputs: { PATTERN: textShadow(","), TEXT: textShadow("甲,乙,丙") } },
    { kind: "block", type: "python_re_compile", inputs: { PATTERN: textShadow("[0-9]+") } },
    { kind: "block", type: "python_re_flag" },
    { kind: "block", type: "python_re_group", inputs: { MATCH: { shadow: { type: "python_re_search", inputs: { PATTERN: textShadow("([0-9]+)"), TEXT: textShadow("编号 123") } } }, GROUP: numberShadow(1) } },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "集合工具", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_collections_counter", inputs: { ITERABLE: listShadow([1, 1, 2]) } },
    { kind: "block", type: "python_collections_defaultdict", inputs: { FACTORY: { shadow: { type: "python_raw_expression", fields: { CODE: "list" } } } } },
    { kind: "block", type: "python_collections_deque", inputs: { ITERABLE: listShadow([1, 2, 3]) } },
    { kind: "block", type: "python_collections_namedtuple", inputs: { NAME: textShadow("坐标"), FIELDS: { shadow: { type: "python_sequence_collection", fields: { KIND: "list" }, extraState: { itemCount: 2 }, inputs: { ITEM0: textShadow("x"), ITEM1: textShadow("y") } } } } },
    { kind: "block", type: "python_deque_add", inputs: { DEQUE: { shadow: { type: "python_collections_deque", inputs: { ITERABLE: shadowList([1, 2, 3]) } } }, VALUE: numberShadow(4) } },
    { kind: "block", type: "python_deque_pop", inputs: { DEQUE: { shadow: { type: "python_collections_deque", inputs: { ITERABLE: shadowList([1, 2, 3]) } } } } },
    { kind: "block", type: "python_counter_most_common", inputs: { COUNTER: { shadow: { type: "python_collections_counter", inputs: { ITERABLE: shadowList([1, 1, 2]) } } }, COUNT: numberShadow(3) } },
  ],
  modern: [
    { kind: "block", type: "python_match", inputs: {
      SUBJECT: textShadow("开始"),
      CASES: { block: {
        type: "python_case",
        inputs: { PATTERN: textShadow("开始"), BODY: { block: { type: "python_print", inputs: { VALUE: textShadow("开始处理") } } } },
        next: { block: { type: "python_case_wildcard", inputs: { BODY: { block: { type: "python_pass" } } } } },
      } },
    } },
    { kind: "block", type: "python_case", inputs: { PATTERN: textShadow("开始"), BODY: { block: { type: "python_pass" } } } },
    { kind: "block", type: "python_case_wildcard", inputs: { BODY: { block: { type: "python_pass" } } } },
  ],
  async: [
    { kind: "label", text: "入门模板", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_async_function_structured", fields: { NAME: "主函数" }, extraState: { parameters: [] }, inputs: {
      BODY: { block: { type: "python_print", inputs: { VALUE: textShadow("开始") }, next: { block: {
        type: "python_await_statement", inputs: { VALUE: { shadow: { type: "python_asyncio_sleep", inputs: { SECONDS: numberShadow(1) } } } },
        next: { block: { type: "python_print", inputs: { VALUE: textShadow("完成") } } },
      } } } },
    }, next: { block: { type: "python_asyncio_run", inputs: { COROUTINE: expressionShadow("主函数()") } } } },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "定义与操作", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_async_function_structured" },
    { kind: "block", type: "python_async_typed_function_structured" },
    { kind: "block", type: "python_asyncio_sleep", inputs: { SECONDS: numberShadow(1) } },
    { kind: "block", type: "python_asyncio_run", inputs: { COROUTINE: expressionShadow("主函数()") } },
    { kind: "block", type: "python_await_statement", inputs: { VALUE: { shadow: { type: "python_asyncio_sleep", inputs: { SECONDS: numberShadow(1) } } } } },
    { kind: "block", type: "python_await", inputs: { VALUE: { shadow: { type: "python_asyncio_sleep", inputs: { SECONDS: numberShadow(1) } } } } },
    { kind: "block", type: "python_async_for", fields: { VAR: variableField("项目") }, inputs: { ITERABLE: expressionShadow("异步可迭代对象"), DO: { block: { type: "python_print", inputs: { VALUE: expressionShadow("项目") } } } } },
    { kind: "block", type: "python_async_with", fields: { ALIAS: variableField("资源") }, inputs: { CONTEXT: expressionShadow("异步上下文"), BODY: { block: { type: "python_pass" } } } },
  ],
} as const;

const rootModuleName = (name: unknown) => String(name || "").trim().split(".", 1)[0];

function standardLibraryModuleReference(workspace: Blockly.Workspace, moduleName: string): string | null {
  let alias: string | null = null;
  for (const block of workspace.getAllBlocks(false)) {
    if (block.type === "python_standard_library_import" && block.getFieldValue("MODULE") === moduleName) return moduleName;
    if (block.type === "python_import" && rootModuleName(block.getFieldValue("MODULE")) === moduleName) return moduleName;
    if (block.type === "python_import_multiple" && ["MODULE1", "MODULE2"].some((field) => rootModuleName(block.getFieldValue(field)) === moduleName)) return moduleName;
    if (block.type === "python_import_as" && String(block.getFieldValue("MODULE") || "").trim() === moduleName) {
      alias ??= identifier(block.getFieldValue("ALIAS"), moduleName);
    }
  }
  return alias;
}

const standardLibraryReference = (block: Blockly.Block, moduleName: string) => {
  const existingReference = standardLibraryModuleReference(block.workspace, moduleName);
  if (existingReference) return existingReference;
  const generator = pythonGenerator as typeof pythonGenerator & { definitions_: Record<string, string> };
  generator.definitions_[`import_${moduleName}`] = `import ${moduleName}`;
  return moduleName;
};

export const standardLibraryCall = (block: Blockly.Block, moduleName: string, member: string) =>
  `${standardLibraryReference(block, moduleName)}.${member}`;

export function registerPythonSyntaxBlocks(colours: PythonSyntaxColours) {
  Blockly.common.defineBlocksWithJsonArray(localizeBlockDefinitions([
    { type: "python_variable_target", message0: "变量 %1", args0: [{ type: "field_variable", name: "VAR", variable: "数值" }], output: "PythonAssignable", colour: colours.variable },
    { type: "python_index_target", message0: "%1 的索引 %2", args0: [{ type: "input_value", name: "OBJECT" }, { type: "input_value", name: "INDEX" }], inputsInline: true, output: "PythonAssignable", colour: colours.variable },
    { type: "python_slice_target", message0: "%1 的切片 从 %2 到 %3 步长 %4", args0: [{ type: "input_value", name: "OBJECT" }, { type: "input_value", name: "START" }, { type: "input_value", name: "STOP" }, { type: "input_value", name: "STEP" }], inputsInline: true, output: "PythonAssignable", colour: colours.variable, tooltip: "可以放在赋值或删除积木中，用来修改或删除列表的一段内容。起点、终点和步长可以留空。" },
    { type: "python_attribute_target", message0: "%1 的属性 %2", args0: [{ type: "input_value", name: "OBJECT" }, { type: "field_input", name: "ATTRIBUTE", text: "名称" }], inputsInline: true, output: "PythonAssignable", colour: colours.variable },
    { type: "python_unpack_target", message0: "解包为 %1 %2 , %3", args0: [{ type: "field_dropdown", name: "KIND", options: [["元组", "tuple"], ["列表", "list"]] }, { type: "input_value", name: "A", check: "PythonAssignable" }, { type: "input_value", name: "B", check: "PythonAssignable" }], inputsInline: true, output: "PythonAssignable", colour: colours.variable },
    { type: "python_starred_target", message0: "带星号 * %1", args0: [{ type: "input_value", name: "TARGET", check: "PythonAssignable" }], output: "PythonAssignable", colour: colours.variable },
    { type: "python_assign_target", message0: "设置 %1 为 %2", args0: [{ type: "input_value", name: "TARGET", check: "PythonAssignable" }, { type: "input_value", name: "VALUE" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.variable },
    { type: "python_augmented_assign", message0: "将 %1 %2 %3", args0: [{ type: "input_value", name: "TARGET", check: "PythonAssignable" }, { type: "field_dropdown", name: "OP", options: [["增加", "+="], ["减少", "-="], ["乘以", "*="], ["除以", "/="], ["整除", "//="], ["取余", "%="], ["幂", "**="], ["矩阵乘", "@="], ["按位与", "&="], ["按位或", "|="], ["按位异或", "^="], ["左移", "<<="], ["右移", ">>="]] }, { type: "input_value", name: "VALUE" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.variable },
    { type: "python_annotated_assign", message0: "变量 %1 类型 %2 初始值 %3", args0: [{ type: "field_variable", name: "VAR", variable: "数值" }, { type: "field_input", name: "TYPE", text: "str" }, { type: "input_value", name: "VALUE" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.variable },
    { type: "python_delete", message0: "删除 %1", args0: [{ type: "input_value", name: "TARGET", check: "PythonAssignable" }], previousStatement: null, nextStatement: null, colour: colours.variable },
    { type: "python_walrus", message0: "赋值表达式 %1 := %2", args0: [{ type: "field_variable", name: "VAR", variable: "数值" }, { type: "input_value", name: "VALUE" }], inputsInline: true, output: null, colour: colours.variable },
    { type: "python_f_string", message0: "格式化文本 %1 值 %2 格式 %3 后缀 %4", args0: [{ type: "field_input", name: "PREFIX", text: "结果：" }, { type: "input_value", name: "VALUE" }, { type: "field_input", name: "FORMAT", text: "" }, { type: "field_input", name: "SUFFIX", text: "" }], inputsInline: true, output: "String", colour: colours.text },
    { type: "python_multiline_string", message0: "多行文本（用 \\n 换行） %1", args0: [{ type: "field_input", name: "TEXT", text: "第一行\\n第二行" }], output: "String", colour: colours.text },
    { type: "python_bytes", message0: "字节文本 %1 编码 %2", args0: [{ type: "field_input", name: "TEXT", text: "data" }, { type: "field_dropdown", name: "ENCODING", options: [["UTF-8", "utf-8"], ["ASCII", "ascii"], ["Latin-1", "latin-1"]] }], output: null, colour: colours.text },
    { type: "python_matrix_multiply", message0: "%1 矩阵乘 @ %2", args0: [{ type: "input_value", name: "A" }, { type: "input_value", name: "B" }], inputsInline: true, output: null, colour: "#4f72b8" },
    { type: "python_builtin_sum", message0: "求和 sum %1 起始值 %2", args0: [{ type: "input_value", name: "ITERABLE" }, { type: "input_value", name: "START" }], inputsInline: true, output: "Number", colour: colours.call },
    { type: "python_builtin_min_max", message0: "%1 %2 默认值 %3", args0: [{ type: "field_dropdown", name: "FUNCTION", options: [["最小值 min", "min"], ["最大值 max", "max"]] }, { type: "input_value", name: "ITERABLE" }, { type: "input_value", name: "DEFAULT" }], inputsInline: true, output: null, colour: colours.call },
    { type: "python_builtin_sorted", message0: "排序 sorted %1 键函数 %2 倒序 %3", args0: [{ type: "input_value", name: "ITERABLE" }, { type: "input_value", name: "KEY" }, { type: "input_value", name: "REVERSE", check: "Boolean" }], inputsInline: true, output: null, colour: colours.call },
    { type: "python_builtin_zip", message0: "配对 zip %1 和 %2", args0: [{ type: "input_value", name: "A" }, { type: "input_value", name: "B" }], inputsInline: true, output: null, colour: colours.call },
    { type: "python_builtin_any_all", message0: "%1 %2", args0: [{ type: "field_dropdown", name: "FUNCTION", options: [["任一为真 any", "any"], ["全部为真 all", "all"]] }, { type: "input_value", name: "ITERABLE" }], inputsInline: true, output: "Boolean", colour: colours.call },
    { type: "python_builtin_map_filter", message0: "%1 函数 %2 遍历 %3", args0: [{ type: "field_dropdown", name: "FUNCTION", options: [["映射 map", "map"], ["筛选 filter", "filter"]] }, { type: "input_value", name: "CALLABLE" }, { type: "input_value", name: "ITERABLE" }], inputsInline: true, output: null, colour: colours.call },
    { type: "python_builtin_enumerate", message0: "枚举 enumerate %1 起始值 %2", args0: [{ type: "input_value", name: "ITERABLE" }, { type: "input_value", name: "START" }], inputsInline: true, output: null, colour: colours.call },
    { type: "python_builtin_reversed", message0: "反向遍历 reversed %1", args0: [{ type: "input_value", name: "ITERABLE" }], output: null, colour: colours.call },
    { type: "python_builtin_iter", message0: "获取迭代器 iter %1", args0: [{ type: "input_value", name: "ITERABLE" }], output: null, colour: colours.call },
    { type: "python_builtin_next", message0: "获取下一项 next %1 默认值 %2", args0: [{ type: "input_value", name: "ITERATOR" }, { type: "input_value", name: "DEFAULT" }], inputsInline: true, output: null, colour: colours.call },
    { type: "python_builtin_type", message0: "类型 type %1", args0: [{ type: "input_value", name: "VALUE" }], output: null, colour: colours.call },
    { type: "python_builtin_isinstance", message0: "是否属于 isinstance %1 类型 %2", args0: [{ type: "input_value", name: "OBJECT" }, { type: "input_value", name: "TYPES" }], inputsInline: true, output: "Boolean", colour: colours.call },
    { type: "python_builtin_abs", message0: "绝对值 abs %1", args0: [{ type: "input_value", name: "VALUE" }], output: "Number", colour: colours.call },
    { type: "python_builtin_pow", message0: "幂 pow %1 指数 %2 模数 %3", args0: [{ type: "input_value", name: "BASE" }, { type: "input_value", name: "EXPONENT" }, { type: "input_value", name: "MODULO" }], inputsInline: true, output: "Number", colour: colours.call },
    { type: "python_builtin_divmod", message0: "商和余数 divmod %1 和 %2", args0: [{ type: "input_value", name: "A" }, { type: "input_value", name: "B" }], inputsInline: true, output: null, colour: colours.call },
    { type: "python_chained_compare", message0: "%1 %2 %3 %4 %5", args0: [{ type: "input_value", name: "A" }, { type: "field_dropdown", name: "OP1", options: [["<", "<"], ["≤", "<="], ["=", "=="], ["≠", "!="], ["≥", ">="], [">", ">"], ["是 is", "is"], ["在 in", "in"]] }, { type: "input_value", name: "B" }, { type: "field_dropdown", name: "OP2", options: [["<", "<"], ["≤", "<="], ["=", "=="], ["≠", "!="], ["≥", ">="], [">", ">"], ["是 is", "is"], ["在 in", "in"]] }, { type: "input_value", name: "C" }], inputsInline: true, output: "Boolean", colour: colours.logic },
    { type: "python_return_none", message0: "返回", previousStatement: null, colour: colours.function },
    { type: "python_yield", message0: "生成 yield %1", args0: [{ type: "input_value", name: "VALUE" }], previousStatement: null, nextStatement: null, colour: colours.function },
    { type: "python_yield_from", message0: "生成自 yield from %1", args0: [{ type: "input_value", name: "VALUE" }], previousStatement: null, nextStatement: null, colour: colours.function },
    { type: "python_generator_expression", message0: "生成器 ( %1 对于 %2 在 %3 中 如果 %4 )", args0: [{ type: "input_value", name: "EXPRESSION" }, { type: "field_variable", name: "VAR", variable: "项目" }, { type: "input_value", name: "ITERABLE" }, { type: "input_value", name: "CONDITION" }], inputsInline: true, output: null, colour: colours.function },
    { type: "python_functools_cache", message0: "缓存函数结果", output: null, colour: colours.function, tooltip: "缓存函数在相同参数下的返回结果。" },
    { type: "python_import_as", message0: "导入模块 %1 命名为 %2", args0: [{ type: "field_input", name: "MODULE", text: "json" }, { type: "field_input", name: "ALIAS", text: "json_module" }], previousStatement: null, nextStatement: null, colour: colours.module },
    { type: "python_import_multiple", message0: "导入模块 %1 和 %2", args0: [{ type: "field_input", name: "MODULE1", text: "os" }, { type: "field_input", name: "MODULE2", text: "sys" }], previousStatement: null, nextStatement: null, colour: colours.module },
    { type: "python_from_import_as", message0: "从 %1 导入 %2 命名为 %3", args0: [{ type: "field_input", name: "MODULE", text: "pathlib" }, { type: "field_input", name: "NAME", text: "Path" }, { type: "field_input", name: "ALIAS", text: "FilePath" }], previousStatement: null, nextStatement: null, colour: colours.module },
    { type: "python_from_import_multiple", message0: "从 %1 导入 %2 和 %3", args0: [{ type: "field_input", name: "MODULE", text: "collections" }, { type: "field_input", name: "NAME1", text: "Counter" }, { type: "field_input", name: "NAME2", text: "defaultdict" }], previousStatement: null, nextStatement: null, colour: colours.module },
    { type: "python_from_import_star", message0: "从 %1 导入全部 *", args0: [{ type: "field_input", name: "MODULE", text: "module" }], previousStatement: null, nextStatement: null, colour: colours.module },
    { type: "python_standard_library_import", message0: "导入标准库 %1", args0: [{ type: "field_dropdown", name: "MODULE", options: [["数学 math", "math"], ["随机 random", "random"], ["JSON json", "json"], ["日期时间 datetime", "datetime"], ["时间 time", "time"], ["路径 pathlib", "pathlib"], ["系统 os", "os"], ["系统参数 sys", "sys"], ["正则表达式 re", "re"], ["集合工具 collections", "collections"], ["结构化输出 pprint", "pprint"], ["表格数据 csv", "csv"]] }], previousStatement: null, nextStatement: null, colour: colours.module },
    { type: "python_math_constant", message0: "数学常量 %1", args0: [{ type: "field_dropdown", name: "CONSTANT", options: [["圆周率 π", "pi"], ["自然常数 e", "e"], ["圆周常量 τ", "tau"], ["正无穷", "inf"]] }], output: "Number", colour: colours.module },
    { type: "python_math_unary", message0: "数学 %1 %2", args0: [{ type: "field_dropdown", name: "FUNCTION", options: [["平方根 sqrt", "sqrt"], ["正弦 sin", "sin"], ["余弦 cos", "cos"], ["正切 tan", "tan"], ["向上取整 ceil", "ceil"], ["向下取整 floor", "floor"], ["弧度转角度 degrees", "degrees"], ["角度转弧度 radians", "radians"]] }, { type: "input_value", name: "VALUE", check: "Number" }], inputsInline: true, output: "Number", colour: colours.module },
    { type: "python_random_randint", message0: "随机整数 random.randint 从 %1 到 %2", args0: [{ type: "input_value", name: "A", check: "Number" }, { type: "input_value", name: "B", check: "Number" }], inputsInline: true, output: "Number", colour: colours.module },
    { type: "python_random_uniform", message0: "随机小数 random.uniform 从 %1 到 %2", args0: [{ type: "input_value", name: "A", check: "Number" }, { type: "input_value", name: "B", check: "Number" }], inputsInline: true, output: "Number", colour: colours.module },
    { type: "python_random_choice", message0: "随机选择 random.choice %1", args0: [{ type: "input_value", name: "SEQUENCE" }], output: null, colour: colours.module },
    { type: "python_random_sample", message0: "随机抽样 random.sample 从 %1 数量 %2", args0: [{ type: "input_value", name: "POPULATION" }, { type: "input_value", name: "K", check: "Number" }], inputsInline: true, output: null, colour: colours.module },
    { type: "python_random_shuffle", message0: "打乱 random.shuffle %1", args0: [{ type: "input_value", name: "SEQUENCE" }], previousStatement: null, nextStatement: null, colour: colours.module },
    { type: "python_json_dumps", message0: "转 JSON json.dumps %1 缩进 %2", args0: [{ type: "input_value", name: "VALUE" }, { type: "input_value", name: "INDENT", check: "Number" }], inputsInline: true, output: "String", colour: colours.module },
    { type: "python_json_loads", message0: "解析 JSON json.loads %1", args0: [{ type: "input_value", name: "TEXT", check: "String" }], output: null, colour: colours.module },
    { type: "python_pprint", message0: "结构化打印 %1", args0: [{ type: "input_value", name: "VALUE" }], previousStatement: null, nextStatement: null, colour: colours.module, tooltip: "以更易阅读的形式输出列表、字典和嵌套数据。" },
    { type: "python_sys_argv", message0: "命令行参数", output: "Array", colour: colours.module, tooltip: "返回启动 Python 程序时传入的参数列表。" },
    { type: "python_sys_exit", message0: "退出程序，状态码 %1", args0: [{ type: "input_value", name: "CODE", check: "Number" }], previousStatement: null, nextStatement: null, colour: colours.module, tooltip: "结束程序运行；状态码留空时使用默认值。" },
    { type: "python_csv_read", message0: "读取表格文件 %1 保存到 %2 分隔符 %3", args0: [{ type: "input_value", name: "PATH", check: "String" }, { type: "field_variable", name: "VAR", variable: "表格数据" }, { type: "field_input", name: "DELIMITER", text: "," }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.module, tooltip: "读取逗号分隔表格文件的全部行并保存为列表；也可以自定义分隔符。" },
    { type: "python_csv_write", message0: "将数据 %1 写入表格文件 %2 分隔符 %3", args0: [{ type: "input_value", name: "DATA" }, { type: "input_value", name: "PATH", check: "String" }, { type: "field_input", name: "DELIMITER", text: "," }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.module, tooltip: "将二维列表写入逗号分隔表格文件；会覆盖原文件并使用 UTF-8 编码。" },
    { type: "python_datetime_now", message0: "日期时间 %1", args0: [{ type: "field_dropdown", name: "MODE", options: [["当前日期时间 now", "now"], ["今天日期 today", "today"], ["当前 UTC 时间", "utc"]] }], output: null, colour: colours.module },
    { type: "python_datetime_parse", message0: "解析日期时间 %1 格式 %2", args0: [{ type: "input_value", name: "TEXT", check: "String" }, { type: "input_value", name: "FORMAT", check: "String" }], inputsInline: true, output: null, colour: colours.module },
    { type: "python_datetime_format", message0: "格式化日期时间 %1 格式 %2", args0: [{ type: "input_value", name: "VALUE" }, { type: "input_value", name: "FORMAT", check: "String" }], inputsInline: true, output: "String", colour: colours.module },
    { type: "python_datetime_timedelta", message0: "时间差 timedelta 天 %1 秒 %2 小时 %3", args0: [{ type: "input_value", name: "DAYS", check: "Number" }, { type: "input_value", name: "SECONDS", check: "Number" }, { type: "input_value", name: "HOURS", check: "Number" }], inputsInline: true, output: null, colour: colours.module },
    { type: "python_time_sleep", message0: "等待 %1 秒", args0: [{ type: "input_value", name: "SECONDS", check: "Number" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.module },
    { type: "python_path_create", message0: "创建 %1 路径 %2", args0: [{ type: "field_dropdown", name: "PATH_KIND", options: [["文件", "file"], ["目录", "directory"]] }, { type: "input_value", name: "VALUE" }], inputsInline: true, output: null, colour: colours.file },
    { type: "python_path_join", message0: "拼接路径 %1 / %2", args0: [{ type: "input_value", name: "BASE" }, { type: "input_value", name: "CHILD" }], inputsInline: true, output: null, colour: colours.file },
    { type: "python_path_check", message0: "路径 %1 %2", args0: [{ type: "input_value", name: "PATH" }, { type: "field_dropdown", name: "METHOD", options: [["是否存在", "exists"], ["是否为文件", "is_file"], ["是否为目录", "is_dir"]] }], inputsInline: true, output: "Boolean", colour: colours.file },
    { type: "python_path_read_text", message0: "读取路径文本 %1 编码 %2", args0: [{ type: "input_value", name: "PATH" }, { type: "input_value", name: "ENCODING", check: "String" }], inputsInline: true, output: "String", colour: colours.file },
    { type: "python_path_write_text", message0: "写入路径 %1 文本 %2 编码 %3", args0: [{ type: "input_value", name: "PATH" }, { type: "input_value", name: "TEXT", check: "String" }, { type: "input_value", name: "ENCODING", check: "String" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.file },
    { type: "python_os_getcwd", message0: "当前工作目录", output: "String", colour: colours.file },
    { type: "python_os_listdir", message0: "列出目录 %1 中的 %2", args0: [{ type: "input_value", name: "PATH" }, { type: "field_dropdown", name: "FILTER", options: [["全部内容", "all"], ["仅文件", "files"], ["仅目录", "directories"]] }], inputsInline: true, output: null, colour: colours.file, tooltip: "返回当前目录中的名称列表，可以只保留文件或目录。需要搜索子目录时使用“在目录中查找”积木。" },
    { type: "python_os_makedirs", message0: "在 %1 中创建目录 %2 已存在时 %3", args0: [{ type: "input_value", name: "PATH" }, { type: "field_input", name: "DIRECTORY_NAME", text: "" }, { type: "field_dropdown", name: "EXIST_OK", options: [["忽略", "True"], ["报错", "False"]] }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.file, tooltip: "点击文件夹图标选择父目录，然后输入要创建的新目录名称。名称留空时，直接使用完整路径。" },
    { type: "python_os_getenv", message0: "读取环境变量 os.getenv %1 默认值 %2", args0: [{ type: "input_value", name: "NAME", check: "String" }, { type: "input_value", name: "DEFAULT" }], inputsInline: true, output: null, colour: colours.module },
    { type: "python_re_search", message0: "正则 %1 模式 %2 文本 %3 标志 %4", args0: [{ type: "field_dropdown", name: "FUNCTION", options: [["搜索 search", "search"], ["开头匹配 match", "match"], ["完整匹配 fullmatch", "fullmatch"], ["查找全部 findall", "findall"], ["查找迭代器 finditer", "finditer"]] }, { type: "input_value", name: "PATTERN", check: "String" }, { type: "input_value", name: "TEXT", check: "String" }, { type: "input_value", name: "FLAGS", check: "Number" }], inputsInline: true, output: null, colour: colours.module },
    { type: "python_re_sub", message0: "正则替换 模式 %1 替换为 %2 文本 %3 次数 %4", args0: [{ type: "input_value", name: "PATTERN", check: "String" }, { type: "input_value", name: "REPLACEMENT" }, { type: "input_value", name: "TEXT", check: "String" }, { type: "input_value", name: "COUNT", check: "Number" }], inputsInline: true, output: "String", colour: colours.module },
    { type: "python_re_split", message0: "正则分割 模式 %1 文本 %2 最大次数 %3", args0: [{ type: "input_value", name: "PATTERN", check: "String" }, { type: "input_value", name: "TEXT", check: "String" }, { type: "input_value", name: "MAXSPLIT", check: "Number" }], inputsInline: true, output: null, colour: colours.module },
    { type: "python_re_compile", message0: "编译正则 模式 %1 标志 %2", args0: [{ type: "input_value", name: "PATTERN", check: "String" }, { type: "input_value", name: "FLAGS", check: "Number" }], inputsInline: true, output: null, colour: colours.module },
    { type: "python_re_flag", message0: "正则标志 %1", args0: [{ type: "field_dropdown", name: "FLAG", options: [["忽略大小写 IGNORECASE", "IGNORECASE"], ["多行 MULTILINE", "MULTILINE"], ["点匹配换行 DOTALL", "DOTALL"], ["详细模式 VERBOSE", "VERBOSE"], ["ASCII 模式", "ASCII"]] }], output: "Number", colour: colours.module },
    { type: "python_re_group", message0: "匹配结果 %1 获取分组 group %2", args0: [{ type: "input_value", name: "MATCH" }, { type: "input_value", name: "GROUP" }], inputsInline: true, output: null, colour: colours.module },
    { type: "python_collections_counter", message0: "计数器 Counter %1", args0: [{ type: "input_value", name: "ITERABLE" }], output: null, colour: colours.module },
    { type: "python_collections_defaultdict", message0: "默认字典 defaultdict 工厂 %1", args0: [{ type: "input_value", name: "FACTORY" }], output: null, colour: colours.module },
    { type: "python_collections_deque", message0: "双端队列 deque %1 最大长度 %2", args0: [{ type: "input_value", name: "ITERABLE" }, { type: "input_value", name: "MAXLEN", check: "Number" }], inputsInline: true, output: null, colour: colours.module },
    { type: "python_collections_namedtuple", message0: "命名元组 namedtuple 名称 %1 字段 %2", args0: [{ type: "input_value", name: "NAME", check: "String" }, { type: "input_value", name: "FIELDS" }], inputsInline: true, output: null, colour: colours.module },
    { type: "python_deque_add", message0: "双端队列 %1 %2 值 %3", args0: [{ type: "input_value", name: "DEQUE" }, { type: "field_dropdown", name: "METHOD", options: [["右侧添加 append", "append"], ["左侧添加 appendleft", "appendleft"], ["右侧扩展 extend", "extend"], ["左侧扩展 extendleft", "extendleft"]] }, { type: "input_value", name: "VALUE" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.module },
    { type: "python_deque_pop", message0: "双端队列 %1 %2", args0: [{ type: "input_value", name: "DEQUE" }, { type: "field_dropdown", name: "METHOD", options: [["右侧取出 pop", "pop"], ["左侧取出 popleft", "popleft"]] }], inputsInline: true, output: null, colour: colours.module },
    { type: "python_counter_most_common", message0: "计数器 %1 最常见 most_common 数量 %2", args0: [{ type: "input_value", name: "COUNTER" }, { type: "input_value", name: "COUNT", check: "Number" }], inputsInline: true, output: null, colour: colours.module },
    { type: "python_with_no_alias", message0: "安全使用资源 %1 %2", args0: [{ type: "input_value", name: "CONTEXT" }, { type: "input_statement", name: "BODY" }], previousStatement: null, nextStatement: null, colour: colours.file },
    { type: "python_with_two", message0: "安全使用 %1 命名为 %2 和 %3 命名为 %4 %5", args0: [{ type: "input_value", name: "CONTEXT1" }, { type: "field_variable", name: "ALIAS1", variable: "第一个资源" }, { type: "input_value", name: "CONTEXT2" }, { type: "field_variable", name: "ALIAS2", variable: "第二个资源" }, { type: "input_statement", name: "BODY" }], previousStatement: null, nextStatement: null, colour: colours.file },
    { type: "python_raise_from", message0: "抛出异常 %1 原因 %2", args0: [{ type: "input_value", name: "ERROR" }, { type: "input_value", name: "CAUSE" }], previousStatement: null, nextStatement: null, colour: colours.exception },
    { type: "python_match", message0: "匹配 match %1 %2", args0: [{ type: "input_value", name: "SUBJECT" }, { type: "input_statement", name: "CASES", check: "PythonCase" }], previousStatement: null, nextStatement: null, colour: colours.logic },
    { type: "python_case", message0: "情况 case %1 如果 %2 %3", args0: [{ type: "input_value", name: "PATTERN" }, { type: "input_value", name: "GUARD" }, { type: "input_statement", name: "BODY" }], previousStatement: "PythonCase", nextStatement: "PythonCase", colour: colours.logic },
    { type: "python_case_wildcard", message0: "其他情况 case _ %1", args0: [{ type: "input_statement", name: "BODY" }], previousStatement: "PythonCase", nextStatement: "PythonCase", colour: colours.logic },
    { type: "python_await", message0: "等待 await %1", args0: [{ type: "input_value", name: "VALUE" }], output: null, colour: colours.function },
    { type: "python_await_statement", message0: "等待 %1 完成", args0: [{ type: "input_value", name: "VALUE" }], previousStatement: null, nextStatement: null, colour: colours.function },
    { type: "python_async_for", message0: "异步对于 %1 在 %2 中 %3", args0: [{ type: "field_variable", name: "VAR", variable: "项目" }, { type: "input_value", name: "ITERABLE" }, { type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null, colour: colours.function },
    { type: "python_async_with", message0: "异步使用 %1 命名为 %2 %3", args0: [{ type: "input_value", name: "CONTEXT" }, { type: "field_variable", name: "ALIAS", variable: "资源" }, { type: "input_statement", name: "BODY" }], previousStatement: null, nextStatement: null, colour: colours.function },
    { type: "python_asyncio_sleep", message0: "异步等待 %1 秒", args0: [{ type: "input_value", name: "SECONDS", check: "Number" }], output: null, colour: colours.function },
    { type: "python_asyncio_run", message0: "运行异步函数 %1", args0: [{ type: "input_value", name: "COROUTINE" }], previousStatement: null, nextStatement: null, colour: colours.function },
  ]));

  const typedPythonOutputChecks: Record<string, string | string[]> = {
    python_list_comprehension: "Array",
    python_set_comprehension: "PythonSet",
    python_dict_comprehension: "PythonDict",
    python_sequence_combine: ["Array", "PythonTuple"],
    python_builtin_sorted: "Array",
    python_random_sample: "Array",
    python_os_listdir: "Array",
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

  Blockly.Blocks.python_unpack_many_target = {
    init(this: any) {
      this.setColour(colours.variable);
      this.setOutput(true, "PythonAssignable");
      this.setInputsInline(true);
      this.appendDummyInput("HEAD").appendField("多项解包为");
      this.itemCount_ = 3;
      this.updateShape_();
      this.setMutator(new Blockly.icons.MutatorIcon(["python_unpack_target_item"], this as Blockly.BlockSvg));
    },
    itemCount_: 3,
    saveExtraState(this: any) { return { itemCount: this.itemCount_ }; },
    loadExtraState(this: any, state: { itemCount?: number }) { this.itemCount_ = Math.max(2, state.itemCount ?? 2); this.updateShape_(); },
    decompose(this: any, workspace: Blockly.WorkspaceSvg) {
      const container = workspace.newBlock("python_unpack_target_container");
      container.initSvg();
      let connection = container.getInput("STACK")!.connection!;
      for (let i = 0; i < this.itemCount_; i++) {
        const item = workspace.newBlock("python_unpack_target_item");
        item.initSvg();
        connection.connect(item.previousConnection!);
        connection = item.nextConnection!;
      }
      return container;
    },
    compose(this: any, container: Blockly.Block) {
      const connections: Array<Blockly.Connection | null> = [];
      let item = container.getInputTargetBlock("STACK");
      while (item) {
        if (!item.isInsertionMarker()) connections.push((item as any).targetConnection_ ?? null);
        item = item.getNextBlock();
      }
      this.itemCount_ = Math.max(2, connections.length);
      this.updateShape_();
      connections.forEach((connection, index) => connection?.reconnect(this, `TARGET${index}`));
    },
    saveConnections(this: any, container: Blockly.Block) {
      let item = container.getInputTargetBlock("STACK");
      let index = 0;
      while (item) {
        if (!item.isInsertionMarker()) {
          (item as any).targetConnection_ = this.getInput(`TARGET${index}`)?.connection?.targetConnection ?? null;
          index += 1;
        }
        item = item.getNextBlock();
      }
    },
    updateShape_(this: any) {
      for (let index = 0; this.getInput(`TARGET${index}`); index += 1) this.removeInput(`TARGET${index}`);
      for (let index = 0; index < this.itemCount_; index += 1) {
        const input = this.appendValueInput(`TARGET${index}`).setCheck("PythonAssignable");
        if (index > 0) input.appendField(",");
      }
      this.setInputsInline(true);
    },
  } as any;
  Blockly.Blocks.python_unpack_target_container = { init(this: Blockly.Block) { this.setColour(colours.variable); this.appendDummyInput().appendField("解包目标"); this.appendStatementInput("STACK"); this.contextMenu = false; } };
  Blockly.Blocks.python_unpack_target_item = { init(this: Blockly.Block) { this.setColour(colours.variable); this.appendDummyInput().appendField("目标"); this.setPreviousStatement(true); this.setNextStatement(true); this.contextMenu = false; } };

  pythonGenerator.forBlock.python_variable_target = (block, generator) => [variableName(generator, block, "VAR", "数值"), Order.ATOMIC];
  pythonGenerator.forBlock.python_index_target = (block, generator) => [`${value(generator, block, "OBJECT", "None", Order.MEMBER)}[${value(generator, block, "INDEX", "0")}]`, Order.MEMBER];
  pythonGenerator.forBlock.python_slice_target = (block, generator) => {
    const start = optionalValue(generator, block, "START");
    const stop = optionalValue(generator, block, "STOP");
    const step = optionalValue(generator, block, "STEP");
    return [`${value(generator, block, "OBJECT", "None", Order.MEMBER)}[${start}:${stop}:${step}]`, Order.MEMBER];
  };
  pythonGenerator.forBlock.python_attribute_target = (block, generator) => [`${value(generator, block, "OBJECT", "None", Order.MEMBER)}.${identifier(block.getFieldValue("ATTRIBUTE"), "属性")}`, Order.MEMBER];
  pythonGenerator.forBlock.python_unpack_target = (block, generator) => {
    const items = `${value(generator, block, "A", "第一个值")}, ${value(generator, block, "B", "第二个值")}`;
    return [block.getFieldValue("KIND") === "list" ? `[${items}]` : `(${items})`, Order.COLLECTION];
  };
  pythonGenerator.forBlock.python_unpack_many_target = (block, generator) => {
    const count = (block as Blockly.Block & { itemCount_?: number }).itemCount_ ?? 2;
    const targets = Array.from({ length: count }, (_, index) => value(generator, block, `TARGET${index}`, `目标${index + 1}`));
    return [`(${targets.join(", ")})`, Order.COLLECTION];
  };
  pythonGenerator.forBlock.python_starred_target = (block, generator) => [`*${value(generator, block, "TARGET", "rest")}`, Order.ATOMIC];
  pythonGenerator.forBlock.python_assign_target = (block, generator) => `${value(generator, block, "TARGET", "value")} = ${value(generator, block, "VALUE")}\n`;
  pythonGenerator.forBlock.python_augmented_assign = (block, generator) => `${value(generator, block, "TARGET", "value")} ${block.getFieldValue("OP")} ${value(generator, block, "VALUE")}\n`;
  pythonGenerator.forBlock.python_annotated_assign = (block, generator) => {
    const assigned = optionalValue(generator, block, "VALUE");
    return `${variableName(generator, block, "VAR", "数值")}: ${annotationName(block.getFieldValue("TYPE"))}${assigned ? ` = ${assigned}` : ""}\n`;
  };
  pythonGenerator.forBlock.python_delete = (block, generator) => `del ${value(generator, block, "TARGET", "value")}\n`;
  pythonGenerator.forBlock.python_walrus = (block, generator) => [`(${variableName(generator, block, "VAR", "数值")} := ${value(generator, block, "VALUE")})`, Order.ATOMIC];
  pythonGenerator.forBlock.python_f_string = (block, generator) => {
    const format = String(block.getFieldValue("FORMAT") || "").trim();
    const expression = value(generator, block, "VALUE");
    const prefix = escapeFStringText(block.getFieldValue("PREFIX"));
    const suffix = escapeFStringText(block.getFieldValue("SUFFIX"));
    return [`f\"${prefix}{${expression}${format ? `:${format}` : ""}}${suffix}\"`, Order.ATOMIC];
  };
  pythonGenerator.forBlock.python_multiline_string = (block) => {
    const text = String(block.getFieldValue("TEXT") || "").replace(/\\n/g, "\n").replace(/\"\"\"/g, '\\"\\"\\"');
    return [`\"\"\"${text}\"\"\"`, Order.ATOMIC];
  };
  pythonGenerator.forBlock.python_bytes = (block) => [`${JSON.stringify(String(block.getFieldValue("TEXT") || ""))}.encode(${JSON.stringify(block.getFieldValue("ENCODING"))})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_matrix_multiply = (block, generator) => [`${value(generator, block, "A", "None", Order.MULTIPLICATIVE)} @ ${value(generator, block, "B", "None", Order.MULTIPLICATIVE)}`, Order.MULTIPLICATIVE];
  pythonGenerator.forBlock.python_builtin_sum = (block, generator) => {
    const start = optionalValue(generator, block, "START");
    return [`sum(${value(generator, block, "ITERABLE", "[]")}${start ? `, ${start}` : ""})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_builtin_min_max = (block, generator) => {
    const fallback = optionalValue(generator, block, "DEFAULT");
    return [`${block.getFieldValue("FUNCTION")}(${value(generator, block, "ITERABLE", "[]")}${fallback ? `, default=${fallback}` : ""})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_builtin_sorted = (block, generator) => {
    const key = optionalValue(generator, block, "KEY");
    const reverse = optionalValue(generator, block, "REVERSE");
    const options = [key ? `key=${key}` : "", reverse ? `reverse=${reverse}` : ""].filter(Boolean);
    return [`sorted(${value(generator, block, "ITERABLE", "[]")}${options.length ? `, ${options.join(", ")}` : ""})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_builtin_zip = (block, generator) => [`zip(${value(generator, block, "A", "[]")}, ${value(generator, block, "B", "[]")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_builtin_any_all = (block, generator) => [`${block.getFieldValue("FUNCTION")}(${value(generator, block, "ITERABLE", "[]")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_builtin_map_filter = (block, generator) => [`${block.getFieldValue("FUNCTION")}(${value(generator, block, "CALLABLE", "lambda 数值: 数值")}, ${value(generator, block, "ITERABLE", "[]")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_builtin_enumerate = (block, generator) => {
    const start = optionalValue(generator, block, "START");
    return [`enumerate(${value(generator, block, "ITERABLE", "[]")}${start ? `, start=${start}` : ""})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_builtin_reversed = (block, generator) => [`reversed(${value(generator, block, "ITERABLE", "[]")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_builtin_iter = (block, generator) => [`iter(${value(generator, block, "ITERABLE", "[]")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_builtin_next = (block, generator) => {
    const fallback = optionalValue(generator, block, "DEFAULT");
    return [`next(${value(generator, block, "ITERATOR", "iter([])")}${fallback ? `, ${fallback}` : ""})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_builtin_type = (block, generator) => [`type(${value(generator, block, "VALUE")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_builtin_isinstance = (block, generator) => [`isinstance(${value(generator, block, "OBJECT")}, ${value(generator, block, "TYPES", "object")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_builtin_abs = (block, generator) => [`abs(${value(generator, block, "VALUE", "0")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_builtin_pow = (block, generator) => {
    const modulo = optionalValue(generator, block, "MODULO");
    return [`pow(${value(generator, block, "BASE", "0")}, ${value(generator, block, "EXPONENT", "0")}${modulo ? `, ${modulo}` : ""})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_builtin_divmod = (block, generator) => [`divmod(${value(generator, block, "A", "0")}, ${value(generator, block, "B", "1")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_chained_compare = (block, generator) => [`${value(generator, block, "A")} ${block.getFieldValue("OP1")} ${value(generator, block, "B")} ${block.getFieldValue("OP2")} ${value(generator, block, "C")}`, Order.RELATIONAL];
  pythonGenerator.forBlock.python_return_none = () => "return\n";
  pythonGenerator.forBlock.python_yield = (block, generator) => {
    const yielded = optionalValue(generator, block, "VALUE");
    return `yield${yielded ? ` ${yielded}` : ""}\n`;
  };
  pythonGenerator.forBlock.python_yield_from = (block, generator) => `yield from ${value(generator, block, "VALUE", "[]")}\n`;
  pythonGenerator.forBlock.python_generator_expression = (block, generator) => {
    const condition = optionalValue(generator, block, "CONDITION");
    return [`(${value(generator, block, "EXPRESSION")} for ${variableName(generator, block, "VAR", "项目")} in ${value(generator, block, "ITERABLE", "[]")}${condition ? ` if ${condition}` : ""})`, Order.ATOMIC];
  };
  pythonGenerator.forBlock.python_functools_cache = (block) => [standardLibraryCall(block, "functools", "cache"), Order.MEMBER];
  pythonGenerator.forBlock.python_import_as = (block) => `import ${importName(block.getFieldValue("MODULE"), "module")} as ${identifier(block.getFieldValue("ALIAS"), "alias")}\n`;
  pythonGenerator.forBlock.python_import_multiple = (block) => `import ${importName(block.getFieldValue("MODULE1"), "module")}, ${importName(block.getFieldValue("MODULE2"), "other_module")}\n`;
  pythonGenerator.forBlock.python_from_import_as = (block) => `from ${importName(block.getFieldValue("MODULE"), "module")} import ${identifier(block.getFieldValue("NAME"), "name")} as ${identifier(block.getFieldValue("ALIAS"), "alias")}\n`;
  pythonGenerator.forBlock.python_from_import_multiple = (block) => `from ${importName(block.getFieldValue("MODULE"), "module")} import ${identifier(block.getFieldValue("NAME1"), "name")}, ${identifier(block.getFieldValue("NAME2"), "other_name")}\n`;
  pythonGenerator.forBlock.python_from_import_star = (block) => `from ${importName(block.getFieldValue("MODULE"), "module")} import *\n`;
  pythonGenerator.forBlock.python_standard_library_import = (block) => `import ${block.getFieldValue("MODULE")}\n`;
  pythonGenerator.forBlock.python_math_constant = (block) => [standardLibraryCall(block, "math", block.getFieldValue("CONSTANT") || "pi"), Order.MEMBER];
  pythonGenerator.forBlock.python_math_unary = (block, generator) => [`${standardLibraryCall(block, "math", block.getFieldValue("FUNCTION"))}(${value(generator, block, "VALUE", "0")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_random_randint = (block, generator) => [`${standardLibraryCall(block, "random", "randint")}(${value(generator, block, "A", "0")}, ${value(generator, block, "B", "1")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_random_uniform = (block, generator) => [`${standardLibraryCall(block, "random", "uniform")}(${value(generator, block, "A", "0")}, ${value(generator, block, "B", "1")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_random_choice = (block, generator) => [`${standardLibraryCall(block, "random", "choice")}(${value(generator, block, "SEQUENCE", "[]")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_random_sample = (block, generator) => [`${standardLibraryCall(block, "random", "sample")}(${value(generator, block, "POPULATION", "[]")}, ${value(generator, block, "K", "1")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_random_shuffle = (block, generator) => `${standardLibraryCall(block, "random", "shuffle")}(${value(generator, block, "SEQUENCE", "[]")})\n`;
  pythonGenerator.forBlock.python_json_dumps = (block, generator) => {
    const indent = optionalValue(generator, block, "INDENT");
    return [`${standardLibraryCall(block, "json", "dumps")}(${value(generator, block, "VALUE")}${indent ? `, indent=${indent}` : ""})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_json_loads = (block, generator) => [`${standardLibraryCall(block, "json", "loads")}(${value(generator, block, "TEXT", "''")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_pprint = (block, generator) => `${standardLibraryCall(block, "pprint", "pprint")}(${value(generator, block, "VALUE", "None")})\n`;
  pythonGenerator.forBlock.python_sys_argv = (block) => [`${standardLibraryCall(block, "sys", "argv")}`, Order.MEMBER];
  pythonGenerator.forBlock.python_sys_exit = (block, generator) => {
    const code = optionalValue(generator, block, "CODE");
    return `${standardLibraryCall(block, "sys", "exit")}(${code})\n`;
  };
  pythonGenerator.forBlock.python_csv_read = (block, generator) => {
    const delimiter = String(block.getFieldValue("DELIMITER") || ",");
    const path = value(generator, block, "PATH", "''");
    const variable = variableName(generator, block, "VAR", "表格数据");
    return `with open(${path}, "r", newline="", encoding="utf-8") as 文件:\n${generator.INDENT}${variable} = list(${standardLibraryCall(block, "csv", "reader")}(文件, delimiter=${JSON.stringify(delimiter)}))\n`;
  };
  pythonGenerator.forBlock.python_csv_write = (block, generator) => {
    const delimiter = String(block.getFieldValue("DELIMITER") || ",");
    const path = value(generator, block, "PATH", "''");
    const data = value(generator, block, "DATA", "[]");
    return `with open(${path}, "w", newline="", encoding="utf-8") as 文件:\n${generator.INDENT}${standardLibraryCall(block, "csv", "writer")}(文件, delimiter=${JSON.stringify(delimiter)}).writerows(${data})\n`;
  };
  pythonGenerator.forBlock.python_datetime_now = (block) => {
    const mode = block.getFieldValue("MODE");
    if (mode === "today") return [`${standardLibraryCall(block, "datetime", "date.today")}()`, Order.FUNCTION_CALL];
    if (mode === "utc") return [`${standardLibraryCall(block, "datetime", "datetime.now")}(${standardLibraryCall(block, "datetime", "timezone.utc")})`, Order.FUNCTION_CALL];
    return [`${standardLibraryCall(block, "datetime", "datetime.now")}()`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_datetime_parse = (block, generator) => [`${standardLibraryCall(block, "datetime", "datetime.strptime")}(${value(generator, block, "TEXT", "''")}, ${value(generator, block, "FORMAT", "''")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_datetime_format = (block, generator) => [`${value(generator, block, "VALUE", "None", Order.MEMBER)}.strftime(${value(generator, block, "FORMAT", "''")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_datetime_timedelta = (block, generator) => {
    const options = [["DAYS", "days"], ["SECONDS", "seconds"], ["HOURS", "hours"]]
      .map(([input, name]) => {
        const option = optionalValue(generator, block, input);
        return option ? `${name}=${option}` : "";
      }).filter(Boolean);
    return [`${standardLibraryCall(block, "datetime", "timedelta")}(${options.join(", ")})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_time_sleep = (block, generator) => `${standardLibraryCall(block, "time", "sleep")}(${value(generator, block, "SECONDS", "1")})\n`;
  pythonGenerator.forBlock.python_path_create = (block, generator) => [`${standardLibraryCall(block, "pathlib", "Path")}(${value(generator, block, "VALUE", "''")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_path_join = (block, generator) => [`${value(generator, block, "BASE", "None", Order.MULTIPLICATIVE)} / ${value(generator, block, "CHILD", "''", Order.MULTIPLICATIVE)}`, Order.MULTIPLICATIVE];
  pythonGenerator.forBlock.python_path_check = (block, generator) => [`${value(generator, block, "PATH", "None", Order.MEMBER)}.${block.getFieldValue("METHOD")}()`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_path_read_text = (block, generator) => {
    const encoding = optionalValue(generator, block, "ENCODING");
    return [`${value(generator, block, "PATH", "None", Order.MEMBER)}.read_text(${encoding ? `encoding=${encoding}` : ""})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_path_write_text = (block, generator) => {
    const encoding = optionalValue(generator, block, "ENCODING");
    return `${value(generator, block, "PATH", "None", Order.MEMBER)}.write_text(${value(generator, block, "TEXT", "''")}${encoding ? `, encoding=${encoding}` : ""})\n`;
  };
  pythonGenerator.forBlock.python_os_getcwd = (block) => [`${standardLibraryCall(block, "os", "getcwd")}()`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_os_listdir = (block, generator) => {
    const path = optionalValue(generator, block, "PATH");
    const filter = block.getFieldValue("FILTER") || "all";
    if (filter === "all") return [`${standardLibraryCall(block, "os", "listdir")}(${path})`, Order.FUNCTION_CALL];
    const directory = path || "'.'";
    const predicate = filter === "directories" ? "isdir" : "isfile";
    const listdir = standardLibraryCall(block, "os", "listdir");
    const join = standardLibraryCall(block, "os", "path.join");
    const check = standardLibraryCall(block, "os", `path.${predicate}`);
    return [`[名称 for 名称 in ${listdir}(${directory}) if ${check}(${join}(${directory}, 名称))]`, Order.COLLECTION];
  };
  pythonGenerator.forBlock.python_os_makedirs = (block, generator) => {
    const parent = value(generator, block, "PATH", "'.'");
    const directoryName = String(block.getFieldValue("DIRECTORY_NAME") || "").trim();
    const path = directoryName
      ? `${standardLibraryCall(block, "os", "path.join")}(${parent}, ${JSON.stringify(directoryName)})`
      : parent;
    return `${standardLibraryCall(block, "os", "makedirs")}(${path}, exist_ok=${block.getFieldValue("EXIST_OK") || "True"})\n`;
  };
  pythonGenerator.forBlock.python_os_getenv = (block, generator) => {
    const fallback = optionalValue(generator, block, "DEFAULT");
    return [`${standardLibraryCall(block, "os", "getenv")}(${value(generator, block, "NAME", "''")}${fallback ? `, ${fallback}` : ""})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_re_search = (block, generator) => {
    const flags = optionalValue(generator, block, "FLAGS");
    return [`${standardLibraryCall(block, "re", block.getFieldValue("FUNCTION"))}(${value(generator, block, "PATTERN", "''")}, ${value(generator, block, "TEXT", "''")}${flags ? `, flags=${flags}` : ""})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_re_sub = (block, generator) => {
    const count = optionalValue(generator, block, "COUNT");
    return [`${standardLibraryCall(block, "re", "sub")}(${value(generator, block, "PATTERN", "''")}, ${value(generator, block, "REPLACEMENT", "''")}, ${value(generator, block, "TEXT", "''")}${count ? `, count=${count}` : ""})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_re_split = (block, generator) => {
    const maxSplit = optionalValue(generator, block, "MAXSPLIT");
    return [`${standardLibraryCall(block, "re", "split")}(${value(generator, block, "PATTERN", "''")}, ${value(generator, block, "TEXT", "''")}${maxSplit ? `, maxsplit=${maxSplit}` : ""})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_re_compile = (block, generator) => {
    const flags = optionalValue(generator, block, "FLAGS");
    return [`${standardLibraryCall(block, "re", "compile")}(${value(generator, block, "PATTERN", "''")}${flags ? `, flags=${flags}` : ""})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_re_flag = (block) => [standardLibraryCall(block, "re", block.getFieldValue("FLAG")), Order.MEMBER];
  pythonGenerator.forBlock.python_re_group = (block, generator) => {
    const group = optionalValue(generator, block, "GROUP");
    return [`${value(generator, block, "MATCH", "None", Order.MEMBER)}.group(${group})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_collections_counter = (block, generator) => {
    const iterable = optionalValue(generator, block, "ITERABLE");
    return [`${standardLibraryCall(block, "collections", "Counter")}(${iterable})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_collections_defaultdict = (block, generator) => {
    const factory = optionalValue(generator, block, "FACTORY");
    return [`${standardLibraryCall(block, "collections", "defaultdict")}(${factory})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_collections_deque = (block, generator) => {
    const iterable = optionalValue(generator, block, "ITERABLE");
    const maxLength = optionalValue(generator, block, "MAXLEN");
    const arguments_ = [iterable || (maxLength ? "[]" : ""), maxLength ? `maxlen=${maxLength}` : ""].filter(Boolean);
    return [`${standardLibraryCall(block, "collections", "deque")}(${arguments_.join(", ")})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_collections_namedtuple = (block, generator) => [`${standardLibraryCall(block, "collections", "namedtuple")}(${value(generator, block, "NAME", "''")}, ${value(generator, block, "FIELDS", "[]")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_deque_add = (block, generator) => `${value(generator, block, "DEQUE", "None", Order.MEMBER)}.${block.getFieldValue("METHOD")}(${value(generator, block, "VALUE")})\n`;
  pythonGenerator.forBlock.python_deque_pop = (block, generator) => [`${value(generator, block, "DEQUE", "None", Order.MEMBER)}.${block.getFieldValue("METHOD")}()`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_counter_most_common = (block, generator) => {
    const count = optionalValue(generator, block, "COUNT");
    return [`${value(generator, block, "COUNTER", "None", Order.MEMBER)}.most_common(${count})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_with_no_alias = (block, generator) => `with ${value(generator, block, "CONTEXT")}:\n${suite(generator, block, "BODY")}`;
  pythonGenerator.forBlock.python_with_two = (block, generator) => `with ${value(generator, block, "CONTEXT1")} as ${variableName(generator, block, "ALIAS1", "第一个资源")}, ${value(generator, block, "CONTEXT2")} as ${variableName(generator, block, "ALIAS2", "第二个资源")}:\n${suite(generator, block, "BODY")}`;
  pythonGenerator.forBlock.python_raise_from = (block, generator) => `raise ${value(generator, block, "ERROR", "Exception()")} from ${value(generator, block, "CAUSE", "None")}\n`;
  pythonGenerator.forBlock.python_match = (block, generator) => `match ${value(generator, block, "SUBJECT")}:\n${generator.statementToCode(block, "CASES") || `${generator.INDENT}case _:\n${generator.INDENT}${generator.INDENT}pass\n`}`;
  pythonGenerator.forBlock.python_case = (block, generator) => {
    const guard = optionalValue(generator, block, "GUARD");
    return `case ${value(generator, block, "PATTERN", "_")}${guard ? ` if ${guard}` : ""}:\n${suite(generator, block, "BODY")}`;
  };
  pythonGenerator.forBlock.python_case_wildcard = (block, generator) => `case _:\n${suite(generator, block, "BODY")}`;
  pythonGenerator.forBlock.python_await = (block, generator) => [`await ${value(generator, block, "VALUE")}`, Order.NONE];
  pythonGenerator.forBlock.python_await_statement = (block, generator) => `await ${value(generator, block, "VALUE")}\n`;
  pythonGenerator.forBlock.python_async_for = (block, generator) => `async for ${variableName(generator, block, "VAR", "项目")} in ${value(generator, block, "ITERABLE", "[]")}:\n${suite(generator, block, "DO")}`;
  pythonGenerator.forBlock.python_async_with = (block, generator) => `async with ${value(generator, block, "CONTEXT")} as ${variableName(generator, block, "ALIAS", "资源")}:\n${suite(generator, block, "BODY")}`;
  pythonGenerator.forBlock.python_asyncio_sleep = (block, generator) => [`${standardLibraryCall(block, "asyncio", "sleep")}(${value(generator, block, "SECONDS", "1")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.python_asyncio_run = (block, generator) => `${standardLibraryCall(block, "asyncio", "run")}(${value(generator, block, "COROUTINE")})\n`;
}

const functionBlockTypes = new Set([
  "python_function_structured",
  "python_method_structured",
  "python_async_function_structured",
  "python_typed_function_structured",
  "python_async_typed_function_structured",
  "python_function_def",
  "python_method_def",
]);

const asyncFunctionBlockTypes = new Set([
  "python_async_function_structured",
  "python_async_typed_function_structured",
]);

const methodBlockTypes = new Set(["python_method_structured", "python_method_def"]);
const definitionBlockTypes = new Set([...functionBlockTypes, "python_class_def"]);

const nearestFunction = (block: Blockly.Block) => {
  let parent = block.getSurroundParent();
  while (parent) {
    if (functionBlockTypes.has(parent.type)) return parent;
    parent = parent.getSurroundParent();
  }
  return null;
};

const enclosingFunctionCount = (block: Blockly.Block) => {
  let count = 0;
  let parent = block.getSurroundParent();
  while (parent) {
    if (functionBlockTypes.has(parent.type)) count += 1;
    parent = parent.getSurroundParent();
  }
  return count;
};

const methodClass = (block: Blockly.Block) => {
  let parent = block.getSurroundParent();
  if (parent?.type === "python_decorated_definition") parent = parent.getSurroundParent();
  return parent?.type === "python_class_def" ? parent : null;
};

const caseBelongsToMatch = (block: Blockly.Block) => {
  let firstCase = block;
  let target = firstCase.previousConnection?.targetConnection;
  while (target) {
    const previous = target.getSourceBlock();
    if ((previous.type !== "python_case" && previous.type !== "python_case_wildcard") || previous.nextConnection !== target) break;
    firstCase = previous;
    target = firstCase.previousConnection?.targetConnection;
  }
  const parent = target?.getSourceBlock();
  return parent?.type === "python_match" && parent.getInput("CASES")?.connection === target;
};

export function getPythonContextWarning(block: Blockly.Block): string | null {
  const enclosingFunction = nearestFunction(block);
  if (methodBlockTypes.has(block.type)) {
    return methodClass(block) ? null : "方法定义只能放在类的内部。";
  }
  if (block.type === "python_super_call") {
    return enclosingFunction && methodBlockTypes.has(enclosingFunction.type) && methodClass(enclosingFunction)
      ? null
      : "super() 只能放在类的方法内部。";
  }
  if (block.type === "python_decorated_definition") {
    const definition = block.getInputTargetBlock("DEFINITION");
    if (!definition) return null;
    if (!definitionBlockTypes.has(definition.type) || definition.getNextBlock()) return "装饰器后只能连接一个函数、方法或类定义。";
  }
  if (block.type === "python_asyncio_run" && enclosingFunction && asyncFunctionBlockTypes.has(enclosingFunction.type)) {
    return "运行异步函数不能放在异步函数内部，请改用“等待完成”积木。";
  }
  if (block.type === "python_return" || block.type === "python_return_none") {
    return enclosingFunction ? null : "return 只能放在函数或方法内部。";
  }
  if (block.type === "python_yield") {
    return enclosingFunction ? null : "yield 只能放在函数或方法内部。";
  }
  if (block.type === "python_yield_from") {
    if (!enclosingFunction) return "yield from 只能放在函数或方法内部。";
    return asyncFunctionBlockTypes.has(enclosingFunction.type) ? "异步生成器不能使用 yield from，请改用 yield。" : null;
  }
  if (block.type === "python_await" || block.type === "python_await_statement" || block.type === "python_async_for" || block.type === "python_async_with") {
    return enclosingFunction && asyncFunctionBlockTypes.has(enclosingFunction.type)
      ? null
      : `${block.type === "python_await" || block.type === "python_await_statement" ? "await" : block.type === "python_async_for" ? "async for" : "async with"} 只能放在异步函数内部。`;
  }
  if (block.type === "python_case" || block.type === "python_case_wildcard") {
    return caseBelongsToMatch(block) ? null : "case 只能连接在 match 的情况区域中。";
  }
  if (block.type === "python_scope_declaration" && block.getFieldValue("SCOPE") === "nonlocal") {
    return enclosingFunctionCount(block) >= 2 ? null : "nonlocal 只能用于嵌套函数中的外层变量。";
  }
  return null;
}

type PythonContainerKind = "list" | "tuple" | "set" | "dict";

const pythonContainerLabels: Record<PythonContainerKind, string> = {
  list: "列表",
  tuple: "元组",
  set: "集合",
  dict: "字典",
};

const variableIdentity = (block: Blockly.Block) => String(block.getFieldValue("VAR") || block.getField("VAR")?.getText() || "");

function inferPythonContainerKind(block: Blockly.Block | null, visited = new Set<string>()): PythonContainerKind | null {
  if (!block || visited.has(block.id)) return null;
  visited.add(block.id);

  if (block.type === "python_sequence_collection") {
    const kind = block.getFieldValue("KIND");
    return kind === "tuple" || kind === "set" ? kind : "list";
  }
  if (["python_list_collection", "lists_create_with", "lists_repeat", "python_list_copy", "python_list_comprehension", "python_builtin_sorted", "python_random_sample", "python_os_listdir", "python_directory_find"].includes(block.type)) return "list";
  if (block.type === "python_string_method" && block.getFieldValue("METHOD") === "split") return "list";
  if (block.type === "python_tuple") return "tuple";
  if (["python_set", "python_set_copy", "python_set_operation", "python_set_comprehension"].includes(block.type)) return "set";
  if (["python_dict", "python_dynamic_dict", "python_dict_fromkeys", "python_dict_comprehension"].includes(block.type)) return "dict";
  if (block.type === "python_dict_query" && block.getFieldValue("METHOD") === "copy") return "dict";
  if (block.type === "python_sequence_combine") return inferPythonContainerKind(block.getInputTargetBlock("SEQUENCE"), visited);
  if (block.type === "python_convert") {
    const kind = block.getFieldValue("TYPE");
    return kind === "list" || kind === "tuple" || kind === "set" || kind === "dict" ? kind : null;
  }
  if (block.type !== "variables_get") return null;

  const identity = variableIdentity(block);
  if (!identity) return null;
  const assignedKinds = new Set<PythonContainerKind>();
  for (const candidate of block.workspace.getAllBlocks(false)) {
    let assignedValue: Blockly.Block | null = null;
    if ((candidate.type === "variables_set" || candidate.type === "python_annotated_assign" || candidate.type === "python_walrus") && variableIdentity(candidate) === identity) {
      assignedValue = candidate.getInputTargetBlock("VALUE");
    } else if (candidate.type === "python_assign_target") {
      const target = candidate.getInputTargetBlock("TARGET");
      if (target?.type === "python_variable_target" && variableIdentity(target) === identity) assignedValue = candidate.getInputTargetBlock("VALUE");
    }
    const kind = inferPythonContainerKind(assignedValue, new Set(visited));
    if (kind) assignedKinds.add(kind);
  }
  return assignedKinds.size === 1 ? [...assignedKinds][0] : null;
}

type ContainerInputExpectation = { input: string; kinds: PythonContainerKind[]; label: string };

const containerInputExpectations: Record<string, ContainerInputExpectation[]> = {
  python_list_method: [{ input: "LIST", kinds: ["list"], label: "列表操作" }],
  python_list_insert: [{ input: "LIST", kinds: ["list"], label: "列表操作" }],
  python_list_set: [{ input: "LIST", kinds: ["list"], label: "列表操作" }],
  python_list_slice_set: [
    { input: "LIST", kinds: ["list"], label: "列表操作" },
    { input: "VALUES", kinds: ["list"], label: "替换内容" },
  ],
  python_list_slice_delete: [{ input: "LIST", kinds: ["list"], label: "列表操作" }],
  python_list_copy: [{ input: "LIST", kinds: ["list"], label: "列表复制" }],
  python_sequence_query: [{ input: "SEQUENCE", kinds: ["list", "tuple"], label: "序列查询" }],
  python_sequence_combine: [{ input: "SEQUENCE", kinds: ["list", "tuple"], label: "序列操作" }],
  python_set_operation: [
    { input: "LEFT", kinds: ["set"], label: "左侧输入" },
    { input: "RIGHT", kinds: ["set"], label: "右侧输入" },
  ],
  python_set_relation: [
    { input: "LEFT", kinds: ["set"], label: "左侧输入" },
    { input: "RIGHT", kinds: ["set"], label: "右侧输入" },
  ],
  python_set_method: [{ input: "SET", kinds: ["set"], label: "集合操作" }],
  python_set_copy: [{ input: "SET", kinds: ["set"], label: "集合复制" }],
  python_dict_get: [{ input: "DICT", kinds: ["dict"], label: "字典操作" }],
  python_dict_set: [{ input: "DICT", kinds: ["dict"], label: "字典操作" }],
  python_dict_remove: [{ input: "DICT", kinds: ["dict"], label: "字典操作" }],
  python_dict_view: [{ input: "DICT", kinds: ["dict"], label: "字典操作" }],
  python_dict_method: [
    { input: "DICT", kinds: ["dict"], label: "字典操作" },
    { input: "OTHER", kinds: ["dict"], label: "合并内容" },
  ],
  python_dict_query: [{ input: "DICT", kinds: ["dict"], label: "字典操作" }],
  python_dict_fromkeys: [{ input: "KEYS", kinds: ["list", "tuple", "set"], label: "键集合" }],
};

export function getPythonCollectionTypeWarning(block: Blockly.Block): string | null {
  const messages: string[] = [];
  for (const expectation of containerInputExpectations[block.type] ?? []) {
    if (block.type === "python_dict_method" && expectation.input === "OTHER" && block.getFieldValue("METHOD") !== "update") continue;
    const actual = inferPythonContainerKind(block.getInputTargetBlock(expectation.input));
    if (!actual || expectation.kinds.includes(actual)) continue;
    const expected = expectation.kinds.map((kind) => pythonContainerLabels[kind]).join("或");
    messages.push(`${expectation.label}需要${expected}，当前连接的是${pythonContainerLabels[actual]}`);
  }

  if (block.type === "python_sequence_combine") {
    const left = inferPythonContainerKind(block.getInputTargetBlock("SEQUENCE"));
    const right = inferPythonContainerKind(block.getInputTargetBlock("OTHER"));
    if (block.getFieldValue("OPERATION") === "concat" && left && right && left !== right) {
      messages.push(`拼接两侧必须是同一种序列，当前是${pythonContainerLabels[left]}和${pythonContainerLabels[right]}`);
    } else if (block.getFieldValue("OPERATION") === "repeat" && right) {
      messages.push(`重复次数需要数字，当前连接的是${pythonContainerLabels[right]}`);
    }
  }

  return messages.length ? `${[...new Set(messages)].join("；")}。` : null;
}

const manimVoiceoverBlockTypes = new Set([
  "visual_python_manim_voiceover",
  "visual_python_manim_voiceover_with_animation",
]);

const manimSceneStatementBlockTypes = new Set([
  "visual_python_manim_assign_add",
  "visual_python_manim_add",
  "visual_python_manim_add_two",
  "visual_python_manim_remove",
  "visual_python_manim_remove_two",
  "visual_python_manim_clear",
  "visual_python_manim_play",
  "visual_python_manim_play_with_options",
  "visual_python_manim_play_two",
  "visual_python_manim_play_list",
  "visual_python_manim_wait",
  "visual_python_manim_play_local_audio",
  "visual_python_manim_play_local_audio_with_animation",
  "visual_python_manim_3d_camera_orientation",
  "visual_python_manim_3d_move_camera",
  "visual_python_manim_3d_ambient_rotation",
  "visual_python_manim_follow_target_updater",
  "visual_python_manim_clear_updaters",
]);

const isInsideManimScene = (block: Blockly.Block) => {
  let parent = block.getSurroundParent?.() ?? null;
  while (parent) {
    if (parent.type === "visual_python_manim_scene") return true;
    parent = parent.getSurroundParent?.() ?? null;
  }
  return false;
};

export function getManimVoiceoverContextWarning(block: Blockly.Block): string | null {
  if (!manimVoiceoverBlockTypes.has(block.type)) return null;
  return isInsideManimScene(block) ? null : "配音积木只能放在 Manim 场景内部。";
}

export function getManimSceneContextWarning(block: Blockly.Block): string | null {
  if (!manimSceneStatementBlockTypes.has(block.type)) return null;
  return isInsideManimScene(block) ? null : "此积木只能放在 Manim 场景内部（请把它放进场景积木的 BODY 语句输入）。";
}

export function getManimObjectReferenceWarning(block: Blockly.Block): string | null {
  if (block.type !== "visual_python_manim_object_ref" || block.isShadow?.()) return null;
  const rawName = String(block.getFieldValue("VAR") || block.getField("VAR")?.getText() || "").trim();
  if (!rawName) return "对象引用缺少名称。";
  const normalizeName = (value: unknown) => sanitizePythonIdentifier(value, "obj");
  const name = normalizeName(rawName);
  const assignedNames = block.workspace.getAllBlocks(false)
    .filter((candidate) => !candidate.isShadow?.() && (candidate.type === "visual_python_manim_assign" || candidate.type === "visual_python_manim_assign_add"))
    .map((candidate) => String(candidate.getFieldValue("VAR") ?? "").trim());
  if (assignedNames.map(normalizeName).includes(name)) return null;
  const available = [...new Set(assignedNames.filter(Boolean).map(normalizeName))].slice(0, 8);
  return `场景中没有名为“${name}”的已创建对象${available.length ? `（现有对象：${available.join("、")}）` : ""}。请先用创建对象积木命名对象，再引用它。`;
}

export function getManimAnimationConnectionWarning(block: Blockly.Block): string | null {
  if (!block.outputConnection?.getCheck()?.includes("ManimAnimation")) return null;
  const playbackBlocks = new Set([
    "visual_python_manim_play",
    "visual_python_manim_play_with_options",
    "visual_python_manim_play_two",
    "visual_python_manim_play_list",
  ]);
  let parent = block.getSurroundParent?.() ?? null;
  while (parent) {
    if (playbackBlocks.has(parent.type)) return null;
    parent = parent.getSurroundParent?.() ?? null;
  }
  return "动画效果需要连接到“播放动画”积木中。";
}

const requiredInputsByType: Record<string, Array<[string, string]>> = {
  variables_set: [["VALUE", "变量值"]],
  controls_repeat_ext: [["TIMES", "重复次数"]],
  controls_whileUntil: [["BOOL", "循环条件"]],
  controls_for: [["FROM", "起始值"], ["TO", "结束值"], ["BY", "步长"]],
  logic_compare: [["A", "左侧值"], ["B", "右侧值"]],
  logic_operation: [["A", "左侧条件"], ["B", "右侧条件"]],
  logic_negate: [["BOOL", "条件"]],
  math_arithmetic: [["A", "左侧数字"], ["B", "右侧数字"]],
  math_modulo: [["DIVIDEND", "被除数"], ["DIVISOR", "除数"]],
  math_single: [["NUM", "数字"]],
  math_round: [["NUM", "数字"]],
  math_constrain: [["VALUE", "数值"], ["LOW", "最小值"], ["HIGH", "最大值"]],
  math_random_int: [["FROM", "最小值"], ["TO", "最大值"]],
  math_on_list: [["LIST", "列表"]],
  text_length: [["VALUE", "文本"]],
  python_print: [["VALUE", "打印内容"]],
  python_floor_divide: [["A", "被除数"], ["B", "除数"]],
  python_bitwise: [["A", "左侧数字"], ["B", "右侧数字"]],
  python_bitwise_not: [["VALUE", "数字"]],
  python_membership: [["ITEM", "成员"], ["COLLECTION", "集合"]],
  python_identity: [["A", "左侧值"], ["B", "右侧值"]],
  python_conditional: [["CONDITION", "条件"], ["TRUE_VALUE", "成立值"], ["FALSE_VALUE", "不成立值"]],
  python_index: [["OBJECT", "对象"], ["INDEX", "索引"]],
  python_slice: [["OBJECT", "对象"]],
  python_attribute: [["OBJECT", "对象"]],
  python_method_call: [["OBJECT", "对象"]],
  python_method_statement: [["OBJECT", "对象"]],
  python_return: [["VALUE", "返回值"]],
  python_raise: [["ERROR", "异常"]],
  python_for_in: [["ITERABLE", "可迭代对象"]],
  python_for_enumerate: [["ITERABLE", "可迭代对象"]],
  python_for_else: [["ITERABLE", "可迭代对象"]],
  python_while_else: [["CONDITION", "循环条件"]],
  python_assert: [["CONDITION", "断言条件"]],
  python_set_attribute: [["OBJECT", "对象"], ["VALUE", "属性值"]],
  python_with: [["CONTEXT", "上下文对象"]],
  python_list_comprehension: [["EXPRESSION", "结果表达式"], ["ITERABLE", "可迭代对象"]],
  python_set_comprehension: [["EXPRESSION", "结果表达式"], ["ITERABLE", "可迭代对象"]],
  python_dict_comprehension: [["KEY", "键表达式"], ["VALUE", "值表达式"], ["ITERABLE", "可迭代对象"]],
  python_lambda: [["EXPRESSION", "返回表达式"]],
  python_decorated_definition: [["DECORATOR", "装饰器"], ["DEFINITION", "函数或类定义"]],
  python_length: [["VALUE", "对象"]],
  python_convert: [["VALUE", "待转换值"]],
  python_string_method: [["TEXT", "文本"]],
  python_text_replace: [["TEXT", "原文本"], ["OLD", "要查找的文本"], ["NEW", "替换文本"]],
  python_list_insert: [["LIST", "列表"], ["INDEX", "索引"], ["VALUE", "插入值"]],
  python_list_set: [["LIST", "列表"], ["INDEX", "索引"], ["VALUE", "新值"]],
  python_list_slice_set: [["LIST", "列表"], ["VALUES", "替换内容"]],
  python_list_slice_delete: [["LIST", "列表"]],
  python_sequence_query: [["SEQUENCE", "列表或元组"], ["VALUE", "要查询的值"]],
  python_sequence_combine: [["SEQUENCE", "列表或元组"], ["OTHER", "另一个列表、元组或重复次数"]],
  python_list_copy: [["LIST", "列表"]],
  python_set_operation: [["LEFT", "左侧集合"], ["RIGHT", "右侧集合"]],
  python_set_relation: [["LEFT", "左侧集合"], ["RIGHT", "右侧集合"]],
  python_set_copy: [["SET", "集合"]],
  python_dict_get: [["DICT", "字典"], ["KEY", "键"]],
  python_dict_set: [["DICT", "字典"], ["KEY", "键"], ["VALUE", "值"]],
  python_dict_remove: [["DICT", "字典"], ["KEY", "键"]],
  python_dict_view: [["DICT", "字典"]],
  python_dict_fromkeys: [["KEYS", "键集合"]],
  python_file_read_text: [["PATH", "文件路径"]],
  python_file_write_text: [["PATH", "文件路径"], ["VALUE", "写入内容"]],
  python_open_file: [["PATH", "文件路径"]],
  python_file_read: [["FILE", "文件对象"]],
  python_file_write: [["FILE", "文件对象"], ["VALUE", "写入内容"]],
  python_file_tell: [["FILE", "文件对象"]],
  python_file_seek: [["FILE", "文件对象"], ["OFFSET", "移动位置"]],
  python_file_control: [["FILE", "文件对象"]],
  python_file_exists: [["PATH", "文件路径"]],
  python_directory_exists: [["PATH", "目录路径"]],
  python_path_info: [["PATH", "路径"]],
  python_file_copy: [["SOURCE", "源文件路径"], ["TARGET", "目标文件路径"]],
  python_file_move: [["SOURCE", "源路径"], ["TARGET", "目标路径"]],
  python_file_delete: [["PATH", "文件路径"]],
  python_directory_find: [["PATH", "目录路径"], ["PATTERN", "查找模式"]],
  python_directory_copy: [["SOURCE", "源目录路径"], ["TARGET", "目标父目录"]],
  python_directory_move: [["SOURCE", "源目录路径"], ["TARGET", "目标父目录"]],
  python_directory_remove: [["PATH", "目录路径"]],
  python_assign_target: [["TARGET", "赋值目标"], ["VALUE", "赋值内容"]],
  python_augmented_assign: [["TARGET", "赋值目标"], ["VALUE", "运算值"]],
  python_delete: [["TARGET", "删除目标"]],
  python_index_target: [["OBJECT", "对象"], ["INDEX", "索引"]],
  python_slice_target: [["OBJECT", "对象"]],
  python_attribute_target: [["OBJECT", "对象"]],
  python_unpack_target: [["A", "第一个目标"], ["B", "第二个目标"]],
  python_starred_target: [["TARGET", "解包目标"]],
  python_walrus: [["VALUE", "赋值内容"]],
  python_f_string: [["VALUE", "格式化值"]],
  python_matrix_multiply: [["A", "左侧矩阵"], ["B", "右侧矩阵"]],
  python_builtin_sum: [["ITERABLE", "可迭代对象"]],
  python_builtin_min_max: [["ITERABLE", "可迭代对象"]],
  python_builtin_sorted: [["ITERABLE", "可迭代对象"]],
  python_builtin_zip: [["A", "第一个可迭代对象"], ["B", "第二个可迭代对象"]],
  python_builtin_any_all: [["ITERABLE", "可迭代对象"]],
  python_builtin_map_filter: [["CALLABLE", "函数"], ["ITERABLE", "可迭代对象"]],
  python_builtin_enumerate: [["ITERABLE", "可迭代对象"]],
  python_builtin_reversed: [["ITERABLE", "可迭代对象"]],
  python_builtin_iter: [["ITERABLE", "可迭代对象"]],
  python_builtin_next: [["ITERATOR", "迭代器"]],
  python_builtin_type: [["VALUE", "对象"]],
  python_builtin_isinstance: [["OBJECT", "对象"], ["TYPES", "类型"]],
  python_builtin_abs: [["VALUE", "数值"]],
  python_builtin_pow: [["BASE", "底数"], ["EXPONENT", "指数"]],
  python_builtin_divmod: [["A", "被除数"], ["B", "除数"]],
  python_math_unary: [["VALUE", "数值"]],
  python_random_randint: [["A", "最小值"], ["B", "最大值"]],
  python_random_uniform: [["A", "最小值"], ["B", "最大值"]],
  python_random_choice: [["SEQUENCE", "序列"]],
  python_random_sample: [["POPULATION", "总体"], ["K", "抽样数量"]],
  python_random_shuffle: [["SEQUENCE", "序列"]],
  python_json_dumps: [["VALUE", "待转换值"]],
  python_json_loads: [["TEXT", "JSON 文本"]],
  python_pprint: [["VALUE", "待打印对象"]],
  python_csv_read: [["PATH", "CSV 文件路径"]],
  python_csv_write: [["DATA", "表格数据"], ["PATH", "CSV 文件路径"]],
  python_datetime_parse: [["TEXT", "日期时间文本"], ["FORMAT", "日期时间格式"]],
  python_datetime_format: [["VALUE", "日期时间对象"], ["FORMAT", "日期时间格式"]],
  python_path_create: [["VALUE", "路径内容"]],
  python_path_join: [["BASE", "基础路径"], ["CHILD", "子路径"]],
  python_path_check: [["PATH", "路径"]],
  python_path_read_text: [["PATH", "路径"]],
  python_path_write_text: [["PATH", "路径"], ["TEXT", "文本"]],
  python_os_makedirs: [["PATH", "父目录"]],
  python_os_getenv: [["NAME", "环境变量名称"]],
  python_re_search: [["PATTERN", "正则模式"], ["TEXT", "待匹配文本"]],
  python_re_sub: [["PATTERN", "正则模式"], ["REPLACEMENT", "替换内容"], ["TEXT", "待替换文本"]],
  python_re_split: [["PATTERN", "正则模式"], ["TEXT", "待分割文本"]],
  python_re_compile: [["PATTERN", "正则模式"]],
  python_re_group: [["MATCH", "匹配结果"]],
  python_collections_namedtuple: [["NAME", "类型名称"], ["FIELDS", "字段"]],
  python_deque_add: [["DEQUE", "双端队列"], ["VALUE", "添加内容"]],
  python_deque_pop: [["DEQUE", "双端队列"]],
  python_counter_most_common: [["COUNTER", "计数器"]],
  python_chained_compare: [["A", "第一个值"], ["B", "第二个值"], ["C", "第三个值"]],
  python_yield_from: [["VALUE", "可迭代对象"]],
  python_generator_expression: [["EXPRESSION", "结果表达式"], ["ITERABLE", "可迭代对象"]],
  python_with_no_alias: [["CONTEXT", "上下文对象"]],
  python_with_two: [["CONTEXT1", "第一个上下文对象"], ["CONTEXT2", "第二个上下文对象"]],
  python_raise_from: [["ERROR", "异常"], ["CAUSE", "原始异常"]],
  python_match: [["SUBJECT", "匹配对象"], ["CASES", "至少一个 case"]],
  python_case: [["PATTERN", "匹配模式"]],
  python_await: [["VALUE", "等待对象"]],
  python_await_statement: [["VALUE", "等待对象"]],
  python_async_for: [["ITERABLE", "异步可迭代对象"]],
  python_async_with: [["CONTEXT", "异步上下文对象"]],
  python_asyncio_sleep: [["SECONDS", "等待秒数"]],
  python_asyncio_run: [["COROUTINE", "异步函数调用"]],
  python_time_sleep: [["SECONDS", "等待秒数"]],
};

const hasConnectedBlock = (block: Blockly.Block, inputName: string) => Boolean(block.getInput(inputName)?.connection?.targetBlock());

export function getRequiredInputEntries(block: Blockly.Block): Array<[string, string]> {
  const required = [...(requiredInputsByType[block.type] ?? [])];
  if (block.type.startsWith("visual_python_manim_")) {
    const labels: Record<string, string> = {
      MOBJECT: "对象", TARGET: "目标对象", SOURCE: "源对象", FIRST: "第一个对象或动画",
      SECOND: "第二个对象或动画", ANIMATION: "动画", ANIMATIONS: "动画列表", AXES: "坐标系",
      GRAPH: "曲线", TRACKER: "追踪器", TABLE: "表格", LINE1: "第一条直线", LINE2: "第二条直线",
    };
    for (const input of block.inputList) {
      if (input.type === Blockly.inputs.inputTypes.VALUE) required.push([input.name, labels[input.name] ?? "参数"]);
    }
  }
  if (block.type === "controls_if") {
    for (const input of block.inputList) if (/^IF\d+$/.test(input.name)) required.push([input.name, "判断条件"]);
  }
  if (block.type === "python_sequence_collection" || block.type === "python_list_collection") {
    for (const input of block.inputList) if (/^ITEM\d+$/.test(input.name)) required.push([input.name, `第 ${Number(input.name.slice(4)) + 1} 项`]);
  }
  if (block.type === "python_dynamic_dict") {
    for (const input of block.inputList) {
      if (/^KEY\d+$/.test(input.name)) required.push([input.name, `第 ${Number(input.name.slice(3)) + 1} 个键`]);
      if (/^VALUE\d+$/.test(input.name)) required.push([input.name, `第 ${Number(input.name.slice(5)) + 1} 个值`]);
    }
  }
  if (block.type === "python_unpack_many_target") {
    for (const input of block.inputList) if (/^TARGET\d+$/.test(input.name)) required.push([input.name, `第 ${Number(input.name.slice(6)) + 1} 个目标`]);
  }
  if (block.type.includes("_structured")) {
    for (const input of block.inputList) {
      if (/^ARG\d+$/.test(input.name)) required.push([input.name, `第 ${Number(input.name.slice(3)) + 1} 个调用参数`]);
      if (/^PARAM\d+$/.test(input.name)) required.push([input.name, `参数 ${block.getFieldValue(`PARAM_NAME${input.name.slice(5)}`) || Number(input.name.slice(5)) + 1} 的默认值`]);
    }
  }
  if (block.type === "python_string_method" && block.getFieldValue("METHOD") === "join") required.push(["ARG", "待连接内容"]);
  if (block.type === "python_list_method") {
    required.push(["LIST", "列表"]);
    if (["append", "extend", "remove"].includes(block.getFieldValue("METHOD"))) required.push(["ARG", "方法参数"]);
  }
  if (block.type === "python_set_method") {
    required.push(["SET", "集合"]);
    if (["add", "update", "remove", "discard"].includes(block.getFieldValue("METHOD"))) required.push(["ARG", "方法参数"]);
  }
  if (block.type === "python_dict_method") {
    required.push(["DICT", "字典"]);
    if (block.getFieldValue("METHOD") === "update") required.push(["OTHER", "要合并的字典"]);
  }
  if (block.type === "python_dict_query") {
    required.push(["DICT", "字典"]);
    if (["pop", "setdefault"].includes(block.getFieldValue("METHOD"))) required.push(["KEY", "键"]);
  }
  return required;
}

export function getRequiredInputNames(block: Blockly.Block): string[] {
  return [...new Set(getRequiredInputEntries(block).filter(([name]) => Boolean(block.getInput(name))).map(([name]) => name))];
}

export function getPythonRequiredInputWarning(block: Blockly.Block): string | null {
  const missing = getRequiredInputEntries(block)
    .filter(([name]) => !hasConnectedBlock(block, name))
    .map(([name, label]) => (label && label !== name ? `${label}（${name}）` : name));
  return missing.length ? `缺少必填输入：${missing.join("、")}。` : null;
}

const isPythonModuleName = (name: string, relative = false) => {
  const normalized = relative ? name.replace(/^\.+/, "") : name;
  return Boolean(normalized) && isDottedPythonIdentifier(normalized);
};
const duplicateNames = (names: string[]) => [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];

export function getPythonIdentifierWarning(block: Blockly.Block): string | null {
  const issues: string[] = [];
  const field = (name: string) => String(block.getFieldValue(name) || "").trim();
  const requireSimple = (fieldName: string, label: string) => {
    const name = field(fieldName);
    if (!isPythonIdentifier(name)) issues.push(`${label}“${name || "空"}”不是有效的 Python 标识符`);
  };
  const requireDotted = (fieldName: string, label: string) => {
    const name = field(fieldName);
    if (!isDottedPythonIdentifier(name)) issues.push(`${label}“${name || "空"}”不是有效的 Python 名称`);
  };

  if ([...functionBlockTypes].includes(block.type)) requireSimple("NAME", block.type.includes("method") ? "方法名称" : "函数名称");
  if (block.type === "python_class_def") {
    requireSimple("NAME", "类名称");
    const invalidBases = field("BASES").split(",").map((name) => name.trim()).filter((name) => !isDottedPythonIdentifier(name));
    if (invalidBases.length) issues.push(`父类名称无效：${invalidBases.join("、")}`);
  }

  if (block.type.includes("_structured") && functionBlockTypes.has(block.type)) {
    const names: string[] = [];
    for (let index = 0; block.getField(`PARAM_NAME${index}`); index += 1) {
      const name = field(`PARAM_NAME${index}`);
      names.push(name);
      if (!isPythonIdentifier(name)) issues.push(`参数名称“${name || "空"}”无效`);
      const annotation = field(`PARAM_TYPE${index}`);
      if (annotation && !isPythonAnnotation(annotation)) issues.push(`参数 ${name || index + 1} 的类型标注无效`);
    }
    const duplicates = duplicateNames(names);
    if (duplicates.length) issues.push(`函数参数名称重复：${duplicates.join("、")}`);
    const returnType = field("RETURN_TYPE");
    if (returnType && !isPythonAnnotation(returnType)) issues.push(`返回类型“${returnType}”无效`);
  }

  if (["python_function_def", "python_method_def", "python_lambda"].includes(block.type)) {
    const names = field("PARAMS").split(",").map((part) => part.trim()).filter(Boolean).map((part) => part.replace(/^\*{1,2}/, "").split("=", 1)[0].trim());
    const invalid = names.filter((name) => !isPythonIdentifier(name));
    if (invalid.length) issues.push(`参数名称无效：${invalid.join("、")}`);
    const duplicates = duplicateNames(names);
    if (duplicates.length) issues.push(`函数参数名称重复：${duplicates.join("、")}`);
  }

  if (block.type.includes("call_structured") || block.type.includes("statement_structured") || block.type === "python_new_object_structured") {
    requireDotted("TARGET", block.type.includes("new_object") ? "类名称" : "调用目标");
    const specs = (block as Blockly.Block & { arguments_?: Array<{ kind: string }> }).arguments_ ?? [];
    const keywordNames: string[] = [];
    let keywordSeen = false;
    specs.forEach((spec, index) => {
      if (spec.kind === "keyword") {
        keywordSeen = true;
        const name = field(`ARG_NAME${index}`);
        keywordNames.push(name);
        if (!isPythonIdentifier(name)) issues.push(`第 ${index + 1} 个关键字参数名称无效`);
      } else if (spec.kind === "positional" && keywordSeen) {
        issues.push("位置参数不能放在关键字参数之后");
      }
    });
    const duplicates = duplicateNames(keywordNames);
    if (duplicates.length) issues.push(`关键字参数名称重复：${duplicates.join("、")}`);
  }

  const simpleFieldsByType: Record<string, Array<[string, string]>> = {
    python_attribute: [["ATTRIBUTE", "属性名称"]],
    python_attribute_target: [["ATTRIBUTE", "属性名称"]],
    python_method_call: [["METHOD", "方法名称"]],
    python_method_statement: [["METHOD", "方法名称"]],
    python_set_attribute: [["ATTRIBUTE", "属性名称"]],
    python_super_call: [["METHOD", "父类方法名称"]],
    python_import_as: [["ALIAS", "模块别名"]],
    python_from_import_as: [["NAME", "导入名称"], ["ALIAS", "导入别名"]],
    python_from_import_multiple: [["NAME1", "第一个导入名称"], ["NAME2", "第二个导入名称"]],
    python_try_two_except: [["ALIAS1", "第一个异常别名"], ["ALIAS2", "第二个异常别名"]],
    python_list_comprehension: [["VAR", "推导式变量"]],
    python_set_comprehension: [["VAR", "推导式变量"]],
    python_dict_comprehension: [["VAR", "推导式变量"]],
  };
  for (const [fieldName, label] of simpleFieldsByType[block.type] ?? []) requireSimple(fieldName, label);

  const dottedFieldsByType: Record<string, Array<[string, string]>> = {
    python_new_object: [["CLASS", "类名称"]],
    python_try_except: [["ERROR", "异常类型"]],
    python_try_two_except: [["ERROR1", "第一个异常类型"], ["ERROR2", "第二个异常类型"]],
    python_try_full: [["ERROR", "异常类型"]],
  };
  for (const [fieldName, label] of dottedFieldsByType[block.type] ?? []) requireDotted(fieldName, label);

  const moduleFieldsByType: Record<string, Array<[string, boolean]>> = {
    python_import: [["MODULE", false]],
    python_from_import: [["MODULE", true]],
    python_import_as: [["MODULE", false]],
    python_import_multiple: [["MODULE1", false], ["MODULE2", false]],
    python_from_import_as: [["MODULE", true]],
    python_from_import_multiple: [["MODULE", true]],
    python_from_import_star: [["MODULE", true]],
  };
  for (const [fieldName, relative] of moduleFieldsByType[block.type] ?? []) {
    const name = field(fieldName);
    if (!isPythonModuleName(name, relative)) issues.push(`模块名称“${name || "空"}”无效`);
  }

  if (block.type === "python_scope_declaration") {
    const names = field("NAMES").split(",").map((name) => name.trim()).filter(Boolean);
    const invalid = names.filter((name) => !isPythonIdentifier(name));
    if (!names.length || invalid.length) issues.push(`作用域变量名称无效${invalid.length ? `：${invalid.join("、")}` : ""}`);
  }

  return issues.length ? `${issues.join("；")}。` : null;
}

export function getPythonImportWarning(_block: Blockly.Block): string | null {
  return null;
}

export type PythonContextIssue = { blockId: string; message: string };

const pythonContextWarningCache = new WeakMap<Blockly.Block, string | null>();

export function uniqueIssueMessages(issues: PythonContextIssue[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const issue of issues) {
    if (seen.has(issue.message)) continue;
    seen.add(issue.message);
    unique.push(issue.message);
  }
  return unique;
}

export function validatePythonBlockContexts(workspace: Blockly.Workspace): PythonContextIssue[] {
  const issues: PythonContextIssue[] = [];
  for (const block of workspace.getAllBlocks(false)) {
    if (block.isShadow?.()) continue;
    const messages = [getPythonContextWarning(block), getPythonCollectionTypeWarning(block), getManimVoiceoverContextWarning(block), getManimSceneContextWarning(block), getManimObjectReferenceWarning(block), getManimAnimationConnectionWarning(block), getPythonRequiredInputWarning(block), getPythonIdentifierWarning(block), getPythonImportWarning(block)].filter((message): message is string => Boolean(message));
    const message = messages.join(" ") || null;
    if ((pythonContextWarningCache.get(block) ?? null) !== message) {
      block.setWarningText(message, "python-context");
      pythonContextWarningCache.set(block, message);
    }
    if (message) issues.push({ blockId: block.id, message });
  }
  return issues;
}
