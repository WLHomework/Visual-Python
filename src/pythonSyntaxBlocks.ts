import * as Blockly from "blockly/core";
import { pythonGenerator, Order } from "blockly/python";

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
};

const identifier = (input: string, fallback: string) => {
  const value = String(input || "").trim();
  return /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(value) ? value : fallback;
};

const importName = (input: string, fallback: string) => {
  const value = String(input || "").trim();
  return /^\.*[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(value) ? value : fallback;
};

const annotationName = (input: string, fallback = "object") => {
  const value = String(input || "").trim();
  return /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\[[A-Za-z0-9_., |\[\]]+\])?(?:\s*\|\s*[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)*$/.test(value) ? value : fallback;
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

export const pythonSyntaxToolbox = {
  assignment: [
    { kind: "block", type: "python_assign_target" },
    { kind: "block", type: "python_augmented_assign" },
    { kind: "block", type: "python_annotated_assign" },
    { kind: "block", type: "python_delete" },
    { kind: "block", type: "python_variable_target" },
    { kind: "block", type: "python_index_target" },
    { kind: "block", type: "python_attribute_target" },
    { kind: "block", type: "python_unpack_target" },
    { kind: "block", type: "python_starred_target" },
    { kind: "block", type: "python_walrus" },
  ],
  text: [
    { kind: "block", type: "python_f_string" },
    { kind: "block", type: "python_multiline_string" },
    { kind: "block", type: "python_bytes" },
  ],
  math: [
    { kind: "block", type: "python_matrix_multiply" },
  ],
  builtins: [
    { kind: "block", type: "python_builtin_sum" },
    { kind: "block", type: "python_builtin_min_max" },
    { kind: "block", type: "python_builtin_sorted" },
    { kind: "block", type: "python_builtin_zip" },
    { kind: "block", type: "python_builtin_any_all" },
    { kind: "block", type: "python_builtin_map_filter" },
    { kind: "block", type: "python_builtin_enumerate" },
    { kind: "block", type: "python_builtin_reversed" },
    { kind: "block", type: "python_builtin_iter" },
    { kind: "block", type: "python_builtin_next" },
    { kind: "block", type: "python_builtin_type" },
    { kind: "block", type: "python_builtin_isinstance" },
    { kind: "block", type: "python_builtin_abs" },
    { kind: "block", type: "python_builtin_pow" },
    { kind: "block", type: "python_builtin_divmod" },
  ],
  logic: [
    { kind: "block", type: "python_chained_compare" },
  ],
  function: [
    { kind: "block", type: "python_typed_function_structured" },
    { kind: "block", type: "python_return_none" },
    { kind: "block", type: "python_yield" },
    { kind: "block", type: "python_yield_from" },
    { kind: "block", type: "python_generator_expression" },
  ],
  exception: [
    { kind: "block", type: "python_with_no_alias" },
    { kind: "block", type: "python_with_two" },
    { kind: "block", type: "python_raise_from" },
  ],
  module: [
    { kind: "block", type: "python_import_as" },
    { kind: "block", type: "python_import_multiple" },
    { kind: "block", type: "python_from_import_as" },
    { kind: "block", type: "python_from_import_multiple" },
    { kind: "block", type: "python_from_import_star" },
  ],
  standardLibrary: [
    { kind: "label", text: "导入", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_standard_library_import" },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "数学 math", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_math_constant" },
    { kind: "block", type: "python_math_unary" },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "随机 random", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_random_randint" },
    { kind: "block", type: "python_random_uniform" },
    { kind: "block", type: "python_random_choice" },
    { kind: "block", type: "python_random_sample" },
    { kind: "block", type: "python_random_shuffle" },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "JSON", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_json_dumps" },
    { kind: "block", type: "python_json_loads" },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "日期时间 datetime", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_datetime_now" },
    { kind: "block", type: "python_datetime_parse" },
    { kind: "block", type: "python_datetime_format" },
    { kind: "block", type: "python_datetime_timedelta" },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "路径 pathlib", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_path_create" },
    { kind: "block", type: "python_path_join" },
    { kind: "block", type: "python_path_check" },
    { kind: "block", type: "python_path_read_text" },
    { kind: "block", type: "python_path_write_text" },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "系统 os", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_os_getcwd" },
    { kind: "block", type: "python_os_listdir" },
    { kind: "block", type: "python_os_makedirs" },
    { kind: "block", type: "python_os_getenv" },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "正则表达式 re", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_re_search" },
    { kind: "block", type: "python_re_sub" },
    { kind: "block", type: "python_re_split" },
    { kind: "block", type: "python_re_compile" },
    { kind: "block", type: "python_re_flag" },
    { kind: "block", type: "python_re_group" },
    { kind: "sep", gap: 20 },
    { kind: "label", text: "集合工具 collections", "web-class": "python-standard-library-label" },
    { kind: "block", type: "python_collections_counter" },
    { kind: "block", type: "python_collections_defaultdict" },
    { kind: "block", type: "python_collections_deque" },
    { kind: "block", type: "python_collections_namedtuple" },
    { kind: "block", type: "python_deque_add" },
    { kind: "block", type: "python_deque_pop" },
    { kind: "block", type: "python_counter_most_common" },
  ],
  modern: [
    { kind: "block", type: "python_match" },
    { kind: "block", type: "python_case" },
    { kind: "block", type: "python_case_wildcard" },
  ],
  async: [
    { kind: "block", type: "python_async_function_structured" },
    { kind: "block", type: "python_async_typed_function_structured" },
    { kind: "block", type: "python_await" },
    { kind: "block", type: "python_async_for" },
    { kind: "block", type: "python_async_with" },
  ],
} as const;

const standardLibraryModuleByBlockType: Record<string, "math" | "random" | "json" | "datetime" | "pathlib" | "os" | "re" | "collections"> = {
  python_math_constant: "math",
  python_math_unary: "math",
  python_random_randint: "random",
  python_random_uniform: "random",
  python_random_choice: "random",
  python_random_sample: "random",
  python_random_shuffle: "random",
  python_json_dumps: "json",
  python_json_loads: "json",
  python_datetime_now: "datetime",
  python_datetime_parse: "datetime",
  python_datetime_timedelta: "datetime",
  python_path_create: "pathlib",
  python_os_getcwd: "os",
  python_os_listdir: "os",
  python_os_makedirs: "os",
  python_os_getenv: "os",
  python_re_search: "re",
  python_re_sub: "re",
  python_re_split: "re",
  python_re_compile: "re",
  python_re_flag: "re",
  python_collections_counter: "collections",
  python_collections_defaultdict: "collections",
  python_collections_deque: "collections",
  python_collections_namedtuple: "collections",
};

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

const standardLibraryCall = (block: Blockly.Block, moduleName: string, member: string) =>
  `${standardLibraryModuleReference(block.workspace, moduleName) ?? moduleName}.${member}`;

export function registerPythonSyntaxBlocks(colours: PythonSyntaxColours) {
  Blockly.common.defineBlocksWithJsonArray([
    { type: "python_variable_target", message0: "变量 %1", args0: [{ type: "field_variable", name: "VAR", variable: "value" }], output: "PythonAssignable", colour: colours.variable },
    { type: "python_index_target", message0: "%1 的索引 %2", args0: [{ type: "input_value", name: "OBJECT" }, { type: "input_value", name: "INDEX" }], inputsInline: true, output: "PythonAssignable", colour: colours.variable },
    { type: "python_attribute_target", message0: "%1 的属性 %2", args0: [{ type: "input_value", name: "OBJECT" }, { type: "field_input", name: "ATTRIBUTE", text: "name" }], inputsInline: true, output: "PythonAssignable", colour: colours.variable },
    { type: "python_unpack_target", message0: "解包为 %1 %2 , %3", args0: [{ type: "field_dropdown", name: "KIND", options: [["元组", "tuple"], ["列表", "list"]] }, { type: "input_value", name: "A", check: "PythonAssignable" }, { type: "input_value", name: "B", check: "PythonAssignable" }], inputsInline: true, output: "PythonAssignable", colour: colours.variable },
    { type: "python_starred_target", message0: "带星号 * %1", args0: [{ type: "input_value", name: "TARGET", check: "PythonAssignable" }], output: "PythonAssignable", colour: colours.variable },
    { type: "python_assign_target", message0: "设置 %1 为 %2", args0: [{ type: "input_value", name: "TARGET", check: "PythonAssignable" }, { type: "input_value", name: "VALUE" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.variable },
    { type: "python_augmented_assign", message0: "将 %1 %2 %3", args0: [{ type: "input_value", name: "TARGET", check: "PythonAssignable" }, { type: "field_dropdown", name: "OP", options: [["增加 +=", "+="], ["减少 -=", "-="], ["乘以 *=", "*="], ["除以 /=", "/="], ["整除 //=", "//="], ["取余 %=", "%="], ["幂 **=", "**="], ["矩阵乘 @=", "@="], ["按位与 &=", "&="], ["按位或 |=", "|="], ["按位异或 ^=", "^="], ["左移 <<=", "<<="], ["右移 >>=", ">>="]] }, { type: "input_value", name: "VALUE" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.variable },
    { type: "python_annotated_assign", message0: "变量 %1 类型 %2 初始值 %3", args0: [{ type: "field_variable", name: "VAR", variable: "value" }, { type: "field_input", name: "TYPE", text: "str" }, { type: "input_value", name: "VALUE" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.variable },
    { type: "python_delete", message0: "删除 %1", args0: [{ type: "input_value", name: "TARGET", check: "PythonAssignable" }], previousStatement: null, nextStatement: null, colour: colours.variable },
    { type: "python_walrus", message0: "赋值表达式 %1 := %2", args0: [{ type: "field_variable", name: "VAR", variable: "value" }, { type: "input_value", name: "VALUE" }], inputsInline: true, output: null, colour: colours.variable },
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
    { type: "python_generator_expression", message0: "生成器 ( %1 对于 %2 在 %3 中 如果 %4 )", args0: [{ type: "input_value", name: "EXPRESSION" }, { type: "field_variable", name: "VAR", variable: "item" }, { type: "input_value", name: "ITERABLE" }, { type: "input_value", name: "CONDITION" }], inputsInline: true, output: null, colour: colours.function },
    { type: "python_import_as", message0: "导入模块 %1 命名为 %2", args0: [{ type: "field_input", name: "MODULE", text: "numpy" }, { type: "field_input", name: "ALIAS", text: "np" }], previousStatement: null, nextStatement: null, colour: colours.module },
    { type: "python_import_multiple", message0: "导入模块 %1 和 %2", args0: [{ type: "field_input", name: "MODULE1", text: "os" }, { type: "field_input", name: "MODULE2", text: "sys" }], previousStatement: null, nextStatement: null, colour: colours.module },
    { type: "python_from_import_as", message0: "从 %1 导入 %2 命名为 %3", args0: [{ type: "field_input", name: "MODULE", text: "pathlib" }, { type: "field_input", name: "NAME", text: "Path" }, { type: "field_input", name: "ALIAS", text: "FilePath" }], previousStatement: null, nextStatement: null, colour: colours.module },
    { type: "python_from_import_multiple", message0: "从 %1 导入 %2 和 %3", args0: [{ type: "field_input", name: "MODULE", text: "collections" }, { type: "field_input", name: "NAME1", text: "Counter" }, { type: "field_input", name: "NAME2", text: "defaultdict" }], previousStatement: null, nextStatement: null, colour: colours.module },
    { type: "python_from_import_star", message0: "从 %1 导入全部 *", args0: [{ type: "field_input", name: "MODULE", text: "module" }], previousStatement: null, nextStatement: null, colour: colours.module },
    { type: "python_standard_library_import", message0: "导入标准库 %1", args0: [{ type: "field_dropdown", name: "MODULE", options: [["数学 math", "math"], ["随机 random", "random"], ["JSON json", "json"], ["日期时间 datetime", "datetime"], ["路径 pathlib", "pathlib"], ["系统 os", "os"], ["正则表达式 re", "re"], ["集合工具 collections", "collections"]] }], previousStatement: null, nextStatement: null, colour: colours.module },
    { type: "python_math_constant", message0: "数学常量 %1", args0: [{ type: "field_dropdown", name: "CONSTANT", options: [["圆周率 π", "pi"], ["自然常数 e", "e"], ["圆周常量 τ", "tau"], ["正无穷", "inf"]] }], output: "Number", colour: colours.module },
    { type: "python_math_unary", message0: "数学 %1 %2", args0: [{ type: "field_dropdown", name: "FUNCTION", options: [["平方根 sqrt", "sqrt"], ["正弦 sin", "sin"], ["余弦 cos", "cos"], ["正切 tan", "tan"], ["向上取整 ceil", "ceil"], ["向下取整 floor", "floor"], ["弧度转角度 degrees", "degrees"], ["角度转弧度 radians", "radians"]] }, { type: "input_value", name: "VALUE", check: "Number" }], inputsInline: true, output: "Number", colour: colours.module },
    { type: "python_random_randint", message0: "随机整数 random.randint 从 %1 到 %2", args0: [{ type: "input_value", name: "A", check: "Number" }, { type: "input_value", name: "B", check: "Number" }], inputsInline: true, output: "Number", colour: colours.module },
    { type: "python_random_uniform", message0: "随机小数 random.uniform 从 %1 到 %2", args0: [{ type: "input_value", name: "A", check: "Number" }, { type: "input_value", name: "B", check: "Number" }], inputsInline: true, output: "Number", colour: colours.module },
    { type: "python_random_choice", message0: "随机选择 random.choice %1", args0: [{ type: "input_value", name: "SEQUENCE" }], output: null, colour: colours.module },
    { type: "python_random_sample", message0: "随机抽样 random.sample 从 %1 数量 %2", args0: [{ type: "input_value", name: "POPULATION" }, { type: "input_value", name: "K", check: "Number" }], inputsInline: true, output: null, colour: colours.module },
    { type: "python_random_shuffle", message0: "打乱 random.shuffle %1", args0: [{ type: "input_value", name: "SEQUENCE" }], previousStatement: null, nextStatement: null, colour: colours.module },
    { type: "python_json_dumps", message0: "转 JSON json.dumps %1 缩进 %2", args0: [{ type: "input_value", name: "VALUE" }, { type: "input_value", name: "INDENT", check: "Number" }], inputsInline: true, output: "String", colour: colours.module },
    { type: "python_json_loads", message0: "解析 JSON json.loads %1", args0: [{ type: "input_value", name: "TEXT", check: "String" }], output: null, colour: colours.module },
    { type: "python_datetime_now", message0: "日期时间 %1", args0: [{ type: "field_dropdown", name: "MODE", options: [["当前日期时间 now", "now"], ["今天日期 today", "today"], ["当前 UTC 时间", "utc"]] }], output: null, colour: colours.module },
    { type: "python_datetime_parse", message0: "解析日期时间 %1 格式 %2", args0: [{ type: "input_value", name: "TEXT", check: "String" }, { type: "input_value", name: "FORMAT", check: "String" }], inputsInline: true, output: null, colour: colours.module },
    { type: "python_datetime_format", message0: "格式化日期时间 %1 格式 %2", args0: [{ type: "input_value", name: "VALUE" }, { type: "input_value", name: "FORMAT", check: "String" }], inputsInline: true, output: "String", colour: colours.module },
    { type: "python_datetime_timedelta", message0: "时间差 timedelta 天 %1 秒 %2 小时 %3", args0: [{ type: "input_value", name: "DAYS", check: "Number" }, { type: "input_value", name: "SECONDS", check: "Number" }, { type: "input_value", name: "HOURS", check: "Number" }], inputsInline: true, output: null, colour: colours.module },
    { type: "python_path_create", message0: "创建路径 Path %1", args0: [{ type: "input_value", name: "VALUE" }], output: null, colour: colours.module },
    { type: "python_path_join", message0: "拼接路径 %1 / %2", args0: [{ type: "input_value", name: "BASE" }, { type: "input_value", name: "CHILD" }], inputsInline: true, output: null, colour: colours.module },
    { type: "python_path_check", message0: "路径 %1 %2", args0: [{ type: "input_value", name: "PATH" }, { type: "field_dropdown", name: "METHOD", options: [["是否存在 exists", "exists"], ["是否为文件 is_file", "is_file"], ["是否为目录 is_dir", "is_dir"]] }], inputsInline: true, output: "Boolean", colour: colours.module },
    { type: "python_path_read_text", message0: "读取路径文本 %1 编码 %2", args0: [{ type: "input_value", name: "PATH" }, { type: "input_value", name: "ENCODING", check: "String" }], inputsInline: true, output: "String", colour: colours.module },
    { type: "python_path_write_text", message0: "写入路径 %1 文本 %2 编码 %3", args0: [{ type: "input_value", name: "PATH" }, { type: "input_value", name: "TEXT", check: "String" }, { type: "input_value", name: "ENCODING", check: "String" }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.module },
    { type: "python_os_getcwd", message0: "当前工作目录 os.getcwd", output: "String", colour: colours.module },
    { type: "python_os_listdir", message0: "列出目录 os.listdir %1", args0: [{ type: "input_value", name: "PATH" }], output: null, colour: colours.module },
    { type: "python_os_makedirs", message0: "创建目录 os.makedirs %1 已存在时 %2", args0: [{ type: "input_value", name: "PATH" }, { type: "field_dropdown", name: "EXIST_OK", options: [["忽略", "True"], ["报错", "False"]] }], inputsInline: true, previousStatement: null, nextStatement: null, colour: colours.module },
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
    { type: "python_with_no_alias", message0: "使用 with %1 %2", args0: [{ type: "input_value", name: "CONTEXT" }, { type: "input_statement", name: "BODY" }], previousStatement: null, nextStatement: null, colour: colours.exception },
    { type: "python_with_two", message0: "使用 with %1 命名为 %2 和 %3 命名为 %4 %5", args0: [{ type: "input_value", name: "CONTEXT1" }, { type: "field_variable", name: "ALIAS1", variable: "first" }, { type: "input_value", name: "CONTEXT2" }, { type: "field_variable", name: "ALIAS2", variable: "second" }, { type: "input_statement", name: "BODY" }], previousStatement: null, nextStatement: null, colour: colours.exception },
    { type: "python_raise_from", message0: "抛出异常 %1 原因 %2", args0: [{ type: "input_value", name: "ERROR" }, { type: "input_value", name: "CAUSE" }], previousStatement: null, nextStatement: null, colour: colours.exception },
    { type: "python_match", message0: "匹配 match %1 %2", args0: [{ type: "input_value", name: "SUBJECT" }, { type: "input_statement", name: "CASES", check: "PythonCase" }], previousStatement: null, nextStatement: null, colour: colours.logic },
    { type: "python_case", message0: "情况 case %1 如果 %2 %3", args0: [{ type: "input_value", name: "PATTERN" }, { type: "input_value", name: "GUARD" }, { type: "input_statement", name: "BODY" }], previousStatement: "PythonCase", nextStatement: "PythonCase", colour: colours.logic },
    { type: "python_case_wildcard", message0: "其他情况 case _ %1", args0: [{ type: "input_statement", name: "BODY" }], previousStatement: "PythonCase", nextStatement: "PythonCase", colour: colours.logic },
    { type: "python_await", message0: "等待 await %1", args0: [{ type: "input_value", name: "VALUE" }], output: null, colour: colours.function },
    { type: "python_async_for", message0: "异步对于 %1 在 %2 中 %3", args0: [{ type: "field_variable", name: "VAR", variable: "item" }, { type: "input_value", name: "ITERABLE" }, { type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null, colour: colours.loop },
    { type: "python_async_with", message0: "异步使用 %1 命名为 %2 %3", args0: [{ type: "input_value", name: "CONTEXT" }, { type: "field_variable", name: "ALIAS", variable: "resource" }, { type: "input_statement", name: "BODY" }], previousStatement: null, nextStatement: null, colour: colours.exception },
  ]);

  pythonGenerator.forBlock.python_variable_target = (block, generator) => [variableName(generator, block, "VAR", "value"), Order.ATOMIC];
  pythonGenerator.forBlock.python_index_target = (block, generator) => [`${value(generator, block, "OBJECT", "None", Order.MEMBER)}[${value(generator, block, "INDEX", "0")}]`, Order.MEMBER];
  pythonGenerator.forBlock.python_attribute_target = (block, generator) => [`${value(generator, block, "OBJECT", "None", Order.MEMBER)}.${identifier(block.getFieldValue("ATTRIBUTE"), "attribute")}`, Order.MEMBER];
  pythonGenerator.forBlock.python_unpack_target = (block, generator) => {
    const items = `${value(generator, block, "A", "value")}, ${value(generator, block, "B", "other")}`;
    return [block.getFieldValue("KIND") === "list" ? `[${items}]` : `(${items})`, Order.COLLECTION];
  };
  pythonGenerator.forBlock.python_starred_target = (block, generator) => [`*${value(generator, block, "TARGET", "rest")}`, Order.ATOMIC];
  pythonGenerator.forBlock.python_assign_target = (block, generator) => `${value(generator, block, "TARGET", "value")} = ${value(generator, block, "VALUE")}\n`;
  pythonGenerator.forBlock.python_augmented_assign = (block, generator) => `${value(generator, block, "TARGET", "value")} ${block.getFieldValue("OP")} ${value(generator, block, "VALUE")}\n`;
  pythonGenerator.forBlock.python_annotated_assign = (block, generator) => {
    const assigned = optionalValue(generator, block, "VALUE");
    return `${variableName(generator, block, "VAR", "value")}: ${annotationName(block.getFieldValue("TYPE"))}${assigned ? ` = ${assigned}` : ""}\n`;
  };
  pythonGenerator.forBlock.python_delete = (block, generator) => `del ${value(generator, block, "TARGET", "value")}\n`;
  pythonGenerator.forBlock.python_walrus = (block, generator) => [`(${variableName(generator, block, "VAR", "value")} := ${value(generator, block, "VALUE")})`, Order.ATOMIC];
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
  pythonGenerator.forBlock.python_builtin_map_filter = (block, generator) => [`${block.getFieldValue("FUNCTION")}(${value(generator, block, "CALLABLE", "lambda value: value")}, ${value(generator, block, "ITERABLE", "[]")})`, Order.FUNCTION_CALL];
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
    return [`(${value(generator, block, "EXPRESSION")} for ${variableName(generator, block, "VAR", "item")} in ${value(generator, block, "ITERABLE", "[]")}${condition ? ` if ${condition}` : ""})`, Order.ATOMIC];
  };
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
    return [`${standardLibraryCall(block, "os", "listdir")}(${path})`, Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock.python_os_makedirs = (block, generator) => `${standardLibraryCall(block, "os", "makedirs")}(${value(generator, block, "PATH", "''")}, exist_ok=${block.getFieldValue("EXIST_OK")})\n`;
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
  pythonGenerator.forBlock.python_with_two = (block, generator) => `with ${value(generator, block, "CONTEXT1")} as ${variableName(generator, block, "ALIAS1", "first")}, ${value(generator, block, "CONTEXT2")} as ${variableName(generator, block, "ALIAS2", "second")}:\n${suite(generator, block, "BODY")}`;
  pythonGenerator.forBlock.python_raise_from = (block, generator) => `raise ${value(generator, block, "ERROR", "Exception()")} from ${value(generator, block, "CAUSE", "None")}\n`;
  pythonGenerator.forBlock.python_match = (block, generator) => `match ${value(generator, block, "SUBJECT")}:\n${generator.statementToCode(block, "CASES") || `${generator.INDENT}case _:\n${generator.INDENT}${generator.INDENT}pass\n`}`;
  pythonGenerator.forBlock.python_case = (block, generator) => {
    const guard = optionalValue(generator, block, "GUARD");
    return `case ${value(generator, block, "PATTERN", "_")}${guard ? ` if ${guard}` : ""}:\n${suite(generator, block, "BODY")}`;
  };
  pythonGenerator.forBlock.python_case_wildcard = (block, generator) => `case _:\n${suite(generator, block, "BODY")}`;
  pythonGenerator.forBlock.python_await = (block, generator) => [`await ${value(generator, block, "VALUE")}`, Order.NONE];
  pythonGenerator.forBlock.python_async_for = (block, generator) => `async for ${variableName(generator, block, "VAR", "item")} in ${value(generator, block, "ITERABLE", "[]")}:\n${suite(generator, block, "DO")}`;
  pythonGenerator.forBlock.python_async_with = (block, generator) => `async with ${value(generator, block, "CONTEXT")} as ${variableName(generator, block, "ALIAS", "resource")}:\n${suite(generator, block, "BODY")}`;
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
  if (block.type === "python_await" || block.type === "python_async_for" || block.type === "python_async_with") {
    return enclosingFunction && asyncFunctionBlockTypes.has(enclosingFunction.type)
      ? null
      : `${block.type === "python_await" ? "await" : block.type === "python_async_for" ? "async for" : "async with"} 只能放在异步函数内部。`;
  }
  if (block.type === "python_case" || block.type === "python_case_wildcard") {
    return caseBelongsToMatch(block) ? null : "case 只能连接在 match 的情况区域中。";
  }
  if (block.type === "python_scope_declaration" && block.getFieldValue("SCOPE") === "nonlocal") {
    return enclosingFunctionCount(block) >= 2 ? null : "nonlocal 只能用于嵌套函数中的外层变量。";
  }
  return null;
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
  python_dict_get: [["DICT", "字典"], ["KEY", "键"]],
  python_dict_view: [["DICT", "字典"]],
  python_open_file: [["PATH", "文件路径"]],
  python_file_read: [["FILE", "文件对象"]],
  python_file_write: [["FILE", "文件对象"], ["VALUE", "写入内容"]],
  python_assign_target: [["TARGET", "赋值目标"], ["VALUE", "赋值内容"]],
  python_augmented_assign: [["TARGET", "赋值目标"], ["VALUE", "运算值"]],
  python_delete: [["TARGET", "删除目标"]],
  python_index_target: [["OBJECT", "对象"], ["INDEX", "索引"]],
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
  python_datetime_parse: [["TEXT", "日期时间文本"], ["FORMAT", "日期时间格式"]],
  python_datetime_format: [["VALUE", "日期时间对象"], ["FORMAT", "日期时间格式"]],
  python_path_create: [["VALUE", "路径内容"]],
  python_path_join: [["BASE", "基础路径"], ["CHILD", "子路径"]],
  python_path_check: [["PATH", "路径"]],
  python_path_read_text: [["PATH", "路径"]],
  python_path_write_text: [["PATH", "路径"], ["TEXT", "文本"]],
  python_os_makedirs: [["PATH", "路径"]],
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
  python_async_for: [["ITERABLE", "异步可迭代对象"]],
  python_async_with: [["CONTEXT", "异步上下文对象"]],
};

const hasConnectedBlock = (block: Blockly.Block, inputName: string) => Boolean(block.getInput(inputName)?.connection?.targetBlock());

export function getPythonRequiredInputWarning(block: Blockly.Block): string | null {
  const required = [...(requiredInputsByType[block.type] ?? [])];
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
  const missing = required.filter(([name]) => !hasConnectedBlock(block, name)).map(([, label]) => label);
  return missing.length ? `缺少必填输入：${missing.join("、")}。` : null;
}

const pythonKeywords = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue",
  "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in",
  "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
]);

const isPythonIdentifier = (name: string) => /^[A-Za-z_]\w*$/.test(name) && !pythonKeywords.has(name);
const isDottedPythonIdentifier = (name: string) => name.split(".").every(isPythonIdentifier);
const isPythonModuleName = (name: string, relative = false) => {
  const normalized = relative ? name.replace(/^\.+/, "") : name;
  return Boolean(normalized) && isDottedPythonIdentifier(normalized);
};
const isPythonAnnotation = (name: string) => /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\[[A-Za-z0-9_., |\[\]]+\])?(?:\s*\|\s*[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)*$/.test(name);

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

export function getPythonImportWarning(block: Blockly.Block): string | null {
  const moduleName = standardLibraryModuleByBlockType[block.type];
  if (!moduleName || standardLibraryModuleReference(block.workspace, moduleName)) return null;
  return `缺少标准库导入：请添加“导入标准库 ${moduleName}”积木。`;
}

export type PythonContextIssue = { blockId: string; message: string };

export function validatePythonBlockContexts(workspace: Blockly.Workspace): PythonContextIssue[] {
  const issues: PythonContextIssue[] = [];
  for (const block of workspace.getAllBlocks(false)) {
    const messages = [getPythonContextWarning(block), getPythonRequiredInputWarning(block), getPythonIdentifierWarning(block), getPythonImportWarning(block)].filter((message): message is string => Boolean(message));
    const message = messages.join(" ") || null;
    block.setWarningText(message, "python-context");
    if (message) issues.push({ blockId: block.id, message });
  }
  return issues;
}
