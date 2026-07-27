import { describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { buildDefinedFunctionCallToolbox, defaultVisualThemeId, findWorkspaceBlockCodeRange, generatePython, generateWorkspacePython, generateWorkspacePythonWithBlockMap, starterState, toolbox, visualPythonTheme, visualPythonThemes } from "./pythonBlocks";
import { getManimVoiceoverContextWarning, getPythonContextWarning, getPythonIdentifierWarning, getPythonImportWarning, getPythonRequiredInputWarning, validatePythonBlockContexts } from "./pythonSyntaxBlocks";

const variableFields: Record<string, string[]> = {
  variables_set: ["VAR"], variables_get: ["VAR"],
  python_input_assign: ["VAR"], python_for_in: ["VAR"], python_for_enumerate: ["INDEX", "VALUE"], python_for_else: ["VAR"],
  python_try_except: ["ALIAS"], python_try_full: ["ALIAS"], python_with: ["ALIAS"],
  python_variable_target: ["VAR"], python_annotated_assign: ["VAR"], python_walrus: ["VAR"],
  python_generator_expression: ["VAR"], python_with_two: ["ALIAS1", "ALIAS2"],
  python_async_for: ["VAR"], python_async_with: ["ALIAS"],
};

describe("Manim voiceover context validation", () => {
  it("requires voiceover blocks to be nested in a Manim scene", () => {
    const outside = {
      type: "visual_python_manim_voiceover",
      getSurroundParent: () => null,
      getParent: () => null,
    } as unknown as Blockly.Block;
    expect(getManimVoiceoverContextWarning(outside)).toBe("配音积木只能放在 Manim 场景内部。");

    const scene = { type: "visual_python_manim_scene", getSurroundParent: () => null } as unknown as Blockly.Block;
    const inside = {
      type: "visual_python_manim_voiceover_with_animation",
      getSurroundParent: () => scene,
    } as unknown as Blockly.Block;
    expect(getManimVoiceoverContextWarning(inside)).toBeNull();
  });
});
const state = (block: object) => {
  const copy = structuredClone(block) as Record<string, any>;
  const variables = new Map<string, { name: string; id: string }>();
  const visit = (current: any) => {
    if (!current || typeof current !== "object") return;
    for (const field of variableFields[current.type] ?? []) {
      const name = current.fields?.[field];
      if (typeof name === "string") {
        const id = `variable-${name}`; variables.set(name, { name, id }); current.fields[field] = { id, name };
      }
    }
    Object.values(current).forEach(visit);
  };
  visit(copy);
  return { variables: [...variables.values()], blocks: { languageVersion: 0, blocks: [copy] } };
};
const text = (value: string) => ({ block: { type: "text", fields: { TEXT: value } } });
const number = (value: number) => ({ block: { type: "math_number", fields: { NUM: value } } });
const expression = (code: string) => ({ block: { type: "python_raw_expression", fields: { CODE: code } } });

describe("Python block generators", () => {
  it("uses the light workspace theme by default", () => {
    expect(defaultVisualThemeId).toBe("visual-light");
    expect(visualPythonTheme).toBe(visualPythonThemes[defaultVisualThemeId]);
  });

  it("generates dictionaries, tuples and sets", () => {
    expect(generatePython(state({ type: "python_tuple", inputs: { A: number(1), B: number(2) } }))).toContain("(1, 2)");
    expect(generatePython(state({ type: "python_set", inputs: { A: text("a"), B: text("b") } }))).toContain("{'a', 'b'}");
    expect(generatePython(state({ type: "python_dict", inputs: { K1: text("name"), V1: text("Ada"), K2: text("lang"), V2: text("Python") } }))).toContain("{'name': 'Ada', 'lang': 'Python'}");
  });

  it("generates indexing and slicing", () => {
    expect(generatePython(state({ type: "python_index", inputs: { OBJECT: { block: { type: "python_raw_expression", fields: { CODE: "items" } } }, INDEX: number(0) } }))).toContain("items[0]");
    expect(generatePython(state({ type: "python_slice", inputs: { OBJECT: { block: { type: "python_raw_expression", fields: { CODE: "items" } } }, START: number(1), STOP: number(5), STEP: number(2) } }))).toContain("items[1:5:2]");
  });

  it("generates calls, attributes and methods", () => {
    expect(generatePython(state({ type: "python_call", fields: { NAME: "len" }, inputs: { ARG: expression("items") } }))).toContain("len(items)");
    expect(generatePython(state({ type: "python_attribute", fields: { ATTRIBUTE: "name" }, inputs: { OBJECT: expression("user") } }))).toContain("user.name");
    const appendBlock = {
      type: "python_method_statement",
      fields: { METHOD: "append" },
      inputs: { OBJECT: expression("items"), ARG: number(3) },
    };
    expect(generatePython(state(appendBlock))).toBe("items.append(3)\n");
  });

  it("generates structured exception handling", () => {
    const tryExceptBlock = {
      type: "python_try_except",
      fields: { ERROR: "ValueError", ALIAS: "error" },
      inputs: {
        TRY: { block: { type: "python_raise", inputs: { ERROR: { block: { type: "python_new_object", fields: { CLASS: "ValueError" }, inputs: { ARG: text("bad") } } } } } },
        EXCEPT: { block: { type: "python_print", inputs: { VALUE: expression("error") } } },
      },
    };
    const code = generatePython(state(tryExceptBlock));
    expect(code).toContain("try:\n  raise ValueError('bad')");
    expect(code).toContain("except ValueError as error:\n  print(error)");
  });

  it("sanitizes invalid identifiers", () => {
    expect(generatePython(state({ type: "python_call", fields: { NAME: "bad code!" } }))).toContain("function()");
  });

  it("generates dynamic collections including empty and single item forms", () => {
    expect(generatePython(state({ type: "python_sequence_collection", fields: { KIND: "list" }, extraState: { itemCount: 0 } }))).toBe("[]\n");
    expect(generatePython(state({ type: "python_sequence_collection", fields: { KIND: "tuple" }, extraState: { itemCount: 1 }, inputs: { ITEM0: number(1) } }))).toBe("(1,)\n");
    expect(generatePython(state({ type: "python_sequence_collection", fields: { KIND: "set" }, extraState: { itemCount: 0 } }))).toBe("set()\n");
    expect(generatePython(state({ type: "python_list_collection", extraState: { itemCount: 2 }, inputs: { ITEM0: number(1), ITEM1: number(2) } }))).toBe("[1, 2]\n");
    expect(generatePython(state({ type: "python_dynamic_dict", extraState: { itemCount: 1 }, inputs: { KEY0: text("name"), VALUE0: text("Ada") } }))).toBe("{'name': 'Ada'}\n");
  });

  it("generates for-in, enumerate, pass and assert", () => {
    const loop = { type: "python_for_enumerate", fields: { INDEX: "index", VALUE: "item" }, inputs: { ITERABLE: expression("items"), DO: { block: { type: "python_assert", inputs: { CONDITION: expression("item is not None") } } } } };
    expect(generatePython(state(loop))).toContain("for index, item in enumerate(items):\n  assert item is not None\n");
    expect(generatePython(state({ type: "python_for_in", fields: { VAR: "item" }, inputs: { ITERABLE: expression("items"), DO: { block: { type: "python_pass" } } } }))).toContain("for item in items:\n  pass");
  });

  it("generates functions with advanced parameters", () => {
    const fn = { type: "python_function_def", fields: { NAME: "collect", PARAMS: "value, count=1, *args, **kwargs" }, inputs: { BODY: { block: { type: "python_return", inputs: { VALUE: expression("value") } } } } };
    expect(generatePython(state(fn))).toBe("def collect(value, count=1, *args, **kwargs):\n  return value\n");
  });

  it("generates classes, methods, inheritance and attributes", () => {
    const method = { type: "python_method_def", fields: { NAME: "__init__", PARAMS: "self, name" }, inputs: { BODY: { block: { type: "python_set_attribute", fields: { ATTRIBUTE: "name" }, inputs: { OBJECT: expression("self"), VALUE: expression("name") } } } } };
    const cls = { type: "python_class_def", fields: { NAME: "Person", BASES: "Base" }, inputs: { BODY: { block: method } } };
    expect(generatePython(state(cls))).toContain("class Person(Base):\n  def __init__(self, name):\n    self.name = name");
  });

  it("generates full exception handling and with", () => {
    const fullTry = { type: "python_try_full", fields: { ERROR: "ValueError", ALIAS: "error" }, inputs: { TRY: { block: { type: "python_pass" } }, EXCEPT: { block: { type: "python_pass" } }, ELSE: { block: { type: "python_pass" } }, FINALLY: { block: { type: "python_pass" } } } };
    const code = generatePython(state(fullTry));
    expect(code).toContain("except ValueError as error:\n  pass\nelse:\n  pass\nfinally:\n  pass");
    const withBlock = { type: "python_with", fields: { ALIAS: "resource" }, inputs: { CONTEXT: expression("open('data.txt')"), BODY: { block: { type: "python_pass" } } } };
    expect(generatePython(state(withBlock))).toContain("with open('data.txt') as resource:\n  pass\n");
  });

  it("generates structured function parameters", () => {
    const fn = {
      type: "python_function_structured",
      fields: { NAME: "collect", PARAM_NAME0: "value", PARAM_NAME1: "count", PARAM_NAME2: "args", PARAM_NAME3: "kwargs" },
      extraState: { parameters: [{ kind: "positional", name: "value" }, { kind: "default", name: "count" }, { kind: "args", name: "args" }, { kind: "kwargs", name: "kwargs" }] },
      inputs: { PARAM1: number(1), BODY: { block: { type: "python_return", inputs: { VALUE: expression("value") } } } },
    };
    expect(generatePython(state(fn))).toBe("def collect(value, count=1, *args, **kwargs):\n  return value\n");
  });

  it("generates structured positional and keyword call arguments", () => {
    const call = {
      type: "python_call_structured",
      fields: { TARGET: "render", ARG_NAME1: "quality" },
      extraState: { arguments: [{ kind: "positional", name: "" }, { kind: "keyword", name: "quality" }] },
      inputs: { ARG0: text("scene.py"), ARG1: text("high") },
    };
    expect(generatePython(state(call))).toBe("render('scene.py', quality='high')\n");
  });

  it("generates repeatable input assignment statements", () => {
    const input = { type: "python_input_assign", fields: { VAR: "answer" }, inputs: { PROMPT: text("请输入：") } };
    expect(generatePython(state(input))).toContain("answer = input('请输入：')\n");
    const loop = { type: "python_for_in", fields: { VAR: "item" }, inputs: { ITERABLE: expression("range(3)"), DO: { block: input } } };
    expect(generatePython(state(loop))).toContain("for item in range(3):\n  answer = input('请输入：')");
  });

  it("generates Python math and logical operators", () => {
    expect(generatePython(state({ type: "python_floor_divide", inputs: { A: number(7), B: number(2) } }))).toBe("7 // 2\n");
    expect(generatePython(state({ type: "python_bitwise", fields: { OP: "<<" }, inputs: { A: number(2), B: number(3) } }))).toBe("2 << 3\n");
    expect(generatePython(state({ type: "python_bitwise_not", inputs: { VALUE: number(2) } }))).toBe("~2\n");
    expect(generatePython(state({ type: "python_membership", fields: { OP: "not in" }, inputs: { ITEM: text("x"), COLLECTION: expression("items") } }))).toBe("'x' not in items\n");
    expect(generatePython(state({ type: "python_identity", fields: { OP: "is" }, inputs: { A: expression("value"), B: { block: { type: "python_none" } } } }))).toBe("value is None\n");
    expect(generatePython(state({ type: "python_conditional", inputs: { CONDITION: expression("ready"), TRUE_VALUE: text("yes"), FALSE_VALUE: text("no") } }))).toBe("'yes' if ready else 'no'\n");
  });

  it("generates common built-in function calls with optional arguments", () => {
    expect(generatePython(state({ type: "python_builtin_sum", inputs: { ITERABLE: expression("items") } }))).toBe("sum(items)\n");
    expect(generatePython(state({ type: "python_builtin_sum", inputs: { ITERABLE: expression("items"), START: number(10) } }))).toBe("sum(items, 10)\n");
    expect(generatePython(state({ type: "python_builtin_min_max", fields: { FUNCTION: "min" }, inputs: { ITERABLE: expression("items"), DEFAULT: number(0) } }))).toBe("min(items, default=0)\n");
    expect(generatePython(state({ type: "python_builtin_sorted", inputs: { ITERABLE: expression("items"), KEY: expression("key_func"), REVERSE: { block: { type: "logic_boolean", fields: { BOOL: "TRUE" } } } } }))).toBe("sorted(items, key=key_func, reverse=True)\n");
    expect(generatePython(state({ type: "python_builtin_zip", inputs: { A: expression("names"), B: expression("scores") } }))).toBe("zip(names, scores)\n");
    expect(generatePython(state({ type: "python_builtin_any_all", fields: { FUNCTION: "any" }, inputs: { ITERABLE: expression("flags") } }))).toBe("any(flags)\n");
    expect(generatePython(state({ type: "python_builtin_map_filter", fields: { FUNCTION: "map" }, inputs: { CALLABLE: expression("transform"), ITERABLE: expression("items") } }))).toBe("map(transform, items)\n");
    expect(generatePython(state({ type: "python_builtin_enumerate", inputs: { ITERABLE: expression("items"), START: number(1) } }))).toBe("enumerate(items, start=1)\n");
    expect(generatePython(state({ type: "python_builtin_reversed", inputs: { ITERABLE: expression("items") } }))).toBe("reversed(items)\n");
    expect(generatePython(state({ type: "python_builtin_iter", inputs: { ITERABLE: expression("items") } }))).toBe("iter(items)\n");
    expect(generatePython(state({ type: "python_builtin_next", inputs: { ITERATOR: expression("iterator"), DEFAULT: text("done") } }))).toBe("next(iterator, 'done')\n");
    expect(generatePython(state({ type: "python_builtin_type", inputs: { VALUE: expression("item") } }))).toBe("type(item)\n");
    expect(generatePython(state({ type: "python_builtin_isinstance", inputs: { OBJECT: expression("item"), TYPES: expression("str") } }))).toBe("isinstance(item, str)\n");
    expect(generatePython(state({ type: "python_builtin_abs", inputs: { VALUE: number(-3) } }))).toBe("abs(-3)\n");
    expect(generatePython(state({ type: "python_builtin_pow", inputs: { BASE: number(2), EXPONENT: number(8), MODULO: number(5) } }))).toBe("pow(2, 8, 5)\n");
    expect(generatePython(state({ type: "python_builtin_divmod", inputs: { A: number(7), B: number(3) } }))).toBe("divmod(7, 3)\n");
  });

  it("generates core math, random and JSON standard library blocks", () => {
    expect(generatePython(state({ type: "python_standard_library_import", fields: { MODULE: "math" } }))).toBe("import math\n");
    expect(generatePython(state({ type: "python_math_constant", fields: { CONSTANT: "pi" } }))).toBe("math.pi\n");
    expect(generatePython(state({ type: "python_math_unary", fields: { FUNCTION: "sqrt" }, inputs: { VALUE: number(9) } }))).toBe("math.sqrt(9)\n");
    expect(generatePython(state({ type: "python_random_randint", inputs: { A: number(1), B: number(6) } }))).toBe("random.randint(1, 6)\n");
    expect(generatePython(state({ type: "python_random_uniform", inputs: { A: number(0), B: number(1) } }))).toBe("random.uniform(0, 1)\n");
    expect(generatePython(state({ type: "python_random_choice", inputs: { SEQUENCE: expression("items") } }))).toBe("random.choice(items)\n");
    expect(generatePython(state({ type: "python_random_sample", inputs: { POPULATION: expression("items"), K: number(3) } }))).toBe("random.sample(items, 3)\n");
    expect(generatePython(state({ type: "python_random_shuffle", inputs: { SEQUENCE: expression("items") } }))).toBe("random.shuffle(items)\n");
    expect(generatePython(state({ type: "python_json_dumps", inputs: { VALUE: expression("data"), INDENT: number(2) } }))).toBe("json.dumps(data, indent=2)\n");
    expect(generatePython(state({ type: "python_json_loads", inputs: { TEXT: expression("payload") } }))).toBe("json.loads(payload)\n");
  });

  it("generates datetime, pathlib and os standard library blocks", () => {
    expect(generatePython(state({ type: "python_standard_library_import", fields: { MODULE: "datetime" } }))).toBe("import datetime\n");
    expect(generatePython(state({ type: "python_datetime_now", fields: { MODE: "now" } }))).toBe("datetime.datetime.now()\n");
    expect(generatePython(state({ type: "python_datetime_now", fields: { MODE: "utc" } }))).toBe("datetime.datetime.now(datetime.timezone.utc)\n");
    expect(generatePython(state({ type: "python_datetime_parse", inputs: { TEXT: text("2026-07-16"), FORMAT: text("%Y-%m-%d") } }))).toBe("datetime.datetime.strptime('2026-07-16', '%Y-%m-%d')\n");
    expect(generatePython(state({ type: "python_datetime_format", inputs: { VALUE: expression("created_at"), FORMAT: text("%H:%M") } }))).toBe("created_at.strftime('%H:%M')\n");
    expect(generatePython(state({ type: "python_datetime_timedelta", inputs: { DAYS: number(2), HOURS: number(3) } }))).toBe("datetime.timedelta(days=2, hours=3)\n");
    expect(generatePython(state({ type: "python_path_create", inputs: { VALUE: text("output") } }))).toBe("pathlib.Path('output')\n");
    expect(generatePython(state({ type: "python_path_join", inputs: { BASE: expression("base_path"), CHILD: text("scene.py") } }))).toBe("base_path / 'scene.py'\n");
    expect(generatePython(state({ type: "python_path_check", fields: { METHOD: "is_file" }, inputs: { PATH: expression("path") } }))).toBe("path.is_file()\n");
    expect(generatePython(state({ type: "python_path_read_text", inputs: { PATH: expression("path"), ENCODING: text("utf-8") } }))).toBe("path.read_text(encoding='utf-8')\n");
    expect(generatePython(state({ type: "python_path_write_text", inputs: { PATH: expression("path"), TEXT: text("hello") } }))).toBe("path.write_text('hello')\n");
    expect(generatePython(state({ type: "python_os_getcwd" }))).toBe("os.getcwd()\n");
    expect(generatePython(state({ type: "python_os_listdir" }))).toBe("os.listdir()\n");
    expect(generatePython(state({ type: "python_os_makedirs", fields: { EXIST_OK: "True" }, inputs: { PATH: text("output") } }))).toBe("os.makedirs('output', exist_ok=True)\n");
    expect(generatePython(state({ type: "python_os_getenv", inputs: { NAME: text("HOME"), DEFAULT: text("") } }))).toBe("os.getenv('HOME', '')\n");
  });

  it("generates regular expression and collections standard library blocks", () => {
    expect(generatePython(state({ type: "python_standard_library_import", fields: { MODULE: "re" } }))).toBe("import re\n");
    expect(generatePython(state({ type: "python_re_search", fields: { FUNCTION: "search" }, inputs: { PATTERN: text("[a-z]+"), TEXT: expression("content"), FLAGS: { block: { type: "python_re_flag", fields: { FLAG: "IGNORECASE" } } } } }))).toBe("re.search('[a-z]+', content, flags=re.IGNORECASE)\n");
    expect(generatePython(state({ type: "python_re_sub", inputs: { PATTERN: text("\\s+"), REPLACEMENT: text(" "), TEXT: expression("content"), COUNT: number(2) } }))).toBe("re.sub('\\\\s+', ' ', content, count=2)\n");
    expect(generatePython(state({ type: "python_re_split", inputs: { PATTERN: text(","), TEXT: expression("content") } }))).toBe("re.split(',', content)\n");
    expect(generatePython(state({ type: "python_re_compile", inputs: { PATTERN: text("^item") } }))).toBe("re.compile('^item')\n");
    expect(generatePython(state({ type: "python_re_group", inputs: { MATCH: expression("match"), GROUP: number(1) } }))).toBe("match.group(1)\n");
    expect(generatePython(state({ type: "python_collections_counter" }))).toBe("collections.Counter()\n");
    expect(generatePython(state({ type: "python_collections_defaultdict", inputs: { FACTORY: expression("list") } }))).toBe("collections.defaultdict(list)\n");
    expect(generatePython(state({ type: "python_collections_deque", inputs: { MAXLEN: number(5) } }))).toBe("collections.deque([], maxlen=5)\n");
    expect(generatePython(state({ type: "python_collections_namedtuple", inputs: { NAME: text("Point"), FIELDS: expression("['x', 'y']") } }))).toBe("collections.namedtuple('Point', ['x', 'y'])\n");
    expect(generatePython(state({ type: "python_deque_add", fields: { METHOD: "appendleft" }, inputs: { DEQUE: expression("queue"), VALUE: number(1) } }))).toBe("queue.appendleft(1)\n");
    expect(generatePython(state({ type: "python_deque_pop", fields: { METHOD: "popleft" }, inputs: { DEQUE: expression("queue") } }))).toBe("queue.popleft()\n");
    expect(generatePython(state({ type: "python_counter_most_common", inputs: { COUNTER: expression("counts") } }))).toBe("counts.most_common()\n");
  });

  it("diagnoses missing standard library imports and respects import aliases", () => {
    const workspace = new Blockly.Workspace();
    const mathCall = workspace.newBlock("python_math_unary");
    mathCall.setFieldValue("sqrt", "FUNCTION");
    const argument = workspace.newBlock("math_number");
    argument.setFieldValue(9, "NUM");
    mathCall.getInput("VALUE")!.connection!.connect(argument.outputConnection!);

    expect(getPythonImportWarning(mathCall)).toBe("缺少标准库导入：请添加“导入标准库 math”积木。");
    expect(validatePythonBlockContexts(workspace)).toContainEqual({
      blockId: mathCall.id,
      message: "缺少标准库导入：请添加“导入标准库 math”积木。",
    });

    const aliasedImport = workspace.newBlock("python_import_as");
    aliasedImport.setFieldValue("math", "MODULE");
    aliasedImport.setFieldValue("m", "ALIAS");
    expect(getPythonImportWarning(mathCall)).toBeNull();
    expect(generateWorkspacePython(workspace)).toContain("m.sqrt(9)");

    const randomCall = workspace.newBlock("python_random_choice");
    const standardImport = workspace.newBlock("python_standard_library_import");
    standardImport.setFieldValue("random", "MODULE");
    expect(getPythonImportWarning(randomCall)).toBeNull();

    const jsonCall = workspace.newBlock("python_json_loads");
    const multipleImport = workspace.newBlock("python_import_multiple");
    multipleImport.setFieldValue("json", "MODULE1");
    multipleImport.setFieldValue("os", "MODULE2");
    expect(getPythonImportWarning(jsonCall)).toBeNull();

    const pathCall = workspace.newBlock("python_path_create");
    expect(getPythonImportWarning(pathCall)).toBe("缺少标准库导入：请添加“导入标准库 pathlib”积木。");
    const pathlibImport = workspace.newBlock("python_import_as");
    pathlibImport.setFieldValue("pathlib", "MODULE");
    pathlibImport.setFieldValue("p", "ALIAS");
    expect(getPythonImportWarning(pathCall)).toBeNull();
    expect(generateWorkspacePython(workspace)).toContain("p.Path(");

    const osCall = workspace.newBlock("python_os_getcwd");
    expect(getPythonImportWarning(osCall)).toBeNull();

    const regexCall = workspace.newBlock("python_re_compile");
    expect(getPythonImportWarning(regexCall)).toBe("缺少标准库导入：请添加“导入标准库 re”积木。");
    const regexImport = workspace.newBlock("python_import_as");
    regexImport.setFieldValue("re", "MODULE");
    regexImport.setFieldValue("regex", "ALIAS");
    expect(getPythonImportWarning(regexCall)).toBeNull();
    expect(generateWorkspacePython(workspace)).toContain("regex.compile(");

    const counterCall = workspace.newBlock("python_collections_counter");
    expect(getPythonImportWarning(counterCall)).toBe("缺少标准库导入：请添加“导入标准库 collections”积木。");
    const collectionsImport = workspace.newBlock("python_standard_library_import");
    collectionsImport.setFieldValue("collections", "MODULE");
    expect(getPythonImportWarning(counterCall)).toBeNull();
    workspace.dispose();
  });

  it("keeps function parameters inside the signature and removes empty separators", () => {
    const workspace = new Blockly.Workspace();
    const block = workspace.newBlock("python_function_structured") as Blockly.Block & { loadExtraState(state: object): void };
    const signatureText = () => block.inputList.filter((input) => input.name !== "BODY").flatMap((input) => input.fieldRow.map((field) => field.getText())).join(" ").replace(/\s+/g, " ");
    expect(signatureText()).toContain("my_function ( value )");
    block.loadExtraState({ parameters: [] });
    const emptySignature = signatureText();
    expect(emptySignature).toContain("my_function ( )");
    expect(emptySignature).not.toContain(",");
    workspace.dispose();
  });

  it("does not duplicate default parameter inputs when rebuilding a function", () => {
    const workspace = new Blockly.Workspace();
    const block = workspace.newBlock("python_function_structured") as Blockly.Block & { loadExtraState(state: object): void };
    const parameters = [
      { kind: "positional", name: "value" },
      { kind: "default", name: "count" },
      { kind: "args", name: "args" },
      { kind: "kwargs", name: "kwargs" },
    ];
    block.loadExtraState({ parameters });
    block.loadExtraState({ parameters });
    block.loadExtraState({ parameters });
    expect(block.inputList.filter((input) => input.name === "PARAM1")).toHaveLength(1);
    expect(block.inputList.filter((input) => /^PARAM\d+$/.test(input.name))).toHaveLength(1);
    expect(block.inputList.map((input) => input.name)).toEqual(["HEAD", "PARAM1", "PARAM_FIELDS2", "BODY"]);
    workspace.dispose();
  });

  it("keeps the default typed function signature in one visible input", () => {
    const workspace = new Blockly.Workspace();
    const block = workspace.newBlock("python_typed_function_structured");
    expect(block.inputList.map((input) => input.name)).toEqual(["HEAD", "BODY"]);
    const signature = block.getInput("HEAD")!.fieldRow.map((field) => field.getText()).join(" ").replace(/\s+/g, " ");
    expect(signature).toContain("定义带类型函数");
    expect(signature).toContain("my_function ( value : object ) -> None");
    workspace.dispose();
  });

  it("creates toolbox call blocks for functions defined in the workspace", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
      type: "python_function_structured",
      fields: { NAME: "collect", PARAM_NAME0: "value", PARAM_NAME1: "count", PARAM_NAME2: "args", PARAM_NAME3: "kwargs" },
      extraState: { parameters: [{ kind: "positional", name: "value" }, { kind: "default", name: "count" }, { kind: "args", name: "args" }, { kind: "kwargs", name: "kwargs" }] },
      inputs: { PARAM1: number(1), BODY: { block: { type: "python_return", inputs: { VALUE: expression("value") } } } },
    }] } }, workspace);
    const toolbox = buildDefinedFunctionCallToolbox(workspace) as Array<Record<string, any>>;
    expect(toolbox[0]).toMatchObject({ kind: "block", type: "python_call_structured" });
    expect(toolbox[1]).toMatchObject({ kind: "block", type: "python_call_statement_structured" });
    expect(toolbox.find((item) => item.fields?.TARGET === "collect")).toMatchObject({
      kind: "block",
      type: "python_call_structured",
      fields: { TARGET: "collect", ARG_NAME1: "count" },
      extraState: { arguments: [{ kind: "positional", name: "" }, { kind: "keyword", name: "count" }] },
    });
    workspace.dispose();
  });

  it("preserves top-level block coordinates through project serialization", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [
      { type: "python_pass", id: "first", x: 120, y: 80 },
      { type: "python_pass", id: "second", x: 420, y: 260 },
    ] } }, workspace);
    const saved = Blockly.serialization.workspaces.save(workspace) as any;
    expect(saved.blocks.blocks.map((block: any) => [block.id, block.x, block.y])).toEqual([
      ["first", 120, 80], ["second", 420, 260],
    ]);
    workspace.dispose();
  });

  it("generates loop else clauses and comprehensions", () => {
    const whileElse = { type: "python_while_else", inputs: { CONDITION: expression("ready"), DO: { block: { type: "python_pass" } }, ELSE: { block: { type: "python_print", inputs: { VALUE: text("done") } } } } };
    expect(generatePython(state(whileElse))).toBe("while ready:\n  pass\nelse:\n  print('done')\n");
    const listComp = { type: "python_list_comprehension", fields: { VAR: "item" }, inputs: { EXPRESSION: expression("item * 2"), ITERABLE: expression("items"), CONDITION: expression("item > 0") } };
    expect(generatePython(state(listComp))).toBe("[item * 2 for item in items if item > 0]\n");
    const dictComp = { type: "python_dict_comprehension", fields: { VAR: "item" }, inputs: { KEY: expression("item"), VALUE: expression("item * 2"), ITERABLE: expression("items") } };
    expect(generatePython(state(dictComp))).toBe("{item: item * 2 for item in items}\n");
  });

  it("generates lambda expressions and decorated definitions", () => {
    expect(generatePython(state({ type: "python_lambda", fields: { PARAMS: "value" }, inputs: { EXPRESSION: expression("value * 2") } }))).toBe("lambda value: value * 2\n");
    const decorated = { type: "python_decorated_definition", inputs: { DECORATOR: expression("staticmethod"), DEFINITION: { block: { type: "python_function_structured", fields: { NAME: "build" }, extraState: { parameters: [] }, inputs: { BODY: { block: { type: "python_pass" } } } } } } };
    expect(generatePython(state(decorated))).toBe("@staticmethod\ndef build():\n  pass\n");
  });

  it("normalizes function parameters and supports empty structured calls", () => {
    const functionWorkspace = new Blockly.Workspace();
    const functionBlock = functionWorkspace.newBlock("python_function_structured") as Blockly.Block & { loadExtraState(state: object): void };
    functionBlock.loadExtraState({ parameters: [
      { kind: "kwargs", name: "kwargs" }, { kind: "default", name: "count" }, { kind: "positional", name: "value" }, { kind: "args", name: "args" }, { kind: "args", name: "extra" },
    ] });
    expect((functionBlock as any).parameters_).toEqual([
      { kind: "positional", name: "value" }, { kind: "positional", name: "extra" }, { kind: "default", name: "count" }, { kind: "args", name: "args" }, { kind: "kwargs", name: "kwargs" },
    ]);
    functionWorkspace.dispose();

    expect(generatePython(state({ type: "python_call_structured", fields: { TARGET: "refresh" }, extraState: { arguments: [] } }))).toBe("refresh()\n");
  });

  it("keeps structured call parentheses in the call signature", () => {
    const workspace = new Blockly.Workspace();
    const call = workspace.newBlock("python_call_structured") as Blockly.Block & { loadExtraState(state: object): void };
    const signatureText = () => call.inputList.flatMap((input) => input.fieldRow.map((field) => field.getText())).join(" ").replace(/\s+/g, " ");
    expect(signatureText()).toContain("function ( )");
    expect(call.inputList.map((input) => input.name)).toEqual(["HEAD", "TAIL"]);
    call.loadExtraState({ arguments: [{ kind: "positional", name: "" }] });
    expect(call.getInput("ARG0")?.fieldRow.map((field) => field.getText()).join(" ")).not.toContain(")");
    expect(call.getInput("TAIL")?.fieldRow.map((field) => field.getText()).join(" ")).toContain(")");
    expect(call.inputList.map((input) => input.name)).toEqual(["HEAD", "ARG0", "TAIL"]);
    workspace.dispose();
  });

  it("does not rebuild a structured call when its mutator has not changed", () => {
    const workspace = new Blockly.Workspace();
    const call = workspace.newBlock("python_call_structured") as Blockly.Block & { compose(container: Blockly.Block): void };
    const container = workspace.newBlock("python_argument_container");
    const headBefore = call.getInput("HEAD");
    call.compose(container);
    expect(call.getInput("HEAD")).toBe(headBefore);
    workspace.dispose();
  });

  it("does not emit Blockly's synthetic variable declarations", () => {
    const loop = { type: "python_for_in", fields: { VAR: "item" }, inputs: { ITERABLE: expression("items"), DO: { block: { type: "python_print", inputs: { VALUE: expression("item") } } } } };
    expect(generatePython(state(loop))).toBe("for item in items:\n  print(item)\n");
    const explicitNone = { type: "variables_set", fields: { VAR: "result" }, inputs: { VALUE: { block: { type: "python_none" } } } };
    expect(generatePython(state(explicitNone))).toBe("result = None\n");
  });

  it("generates common Python utility, collection, and file operations", () => {
    expect(generatePython(state({ type: "python_range", inputs: { START: number(1), STOP: number(8), STEP: number(2) } }))).toBe("range(1, 8, 2)\n");
    expect(generatePython(state({ type: "python_length", inputs: { VALUE: expression("items") } }))).toBe("len(items)\n");
    expect(generatePython(state({ type: "python_convert", fields: { TYPE: "int" }, inputs: { VALUE: text("42") } }))).toBe("int('42')\n");
    expect(generatePython(state({ type: "python_string_method", fields: { METHOD: "upper" }, inputs: { TEXT: text("python") } }))).toBe("'python'.upper()\n");
    expect(generatePython(state({ type: "python_list_method", fields: { METHOD: "append" }, inputs: { LIST: expression("items"), ARG: number(3) } }))).toBe("items.append(3)\n");
    expect(generatePython(state({ type: "python_dict_get", inputs: { DICT: expression("data"), KEY: text("name") } }))).toBe("data.get('name')\n");
    expect(generatePython(state({ type: "python_dict_view", fields: { METHOD: "keys" }, inputs: { DICT: expression("data") } }))).toBe("data.keys()\n");
    expect(generatePython(state({ type: "python_open_file", fields: { MODE: "w", ENCODING: "utf-8" }, inputs: { PATH: text("out.txt") } }))).toBe("open('out.txt', \"w\", encoding=\"utf-8\")\n");
    expect(generatePython(state({ type: "python_file_read", inputs: { FILE: expression("handle") } }))).toBe("handle.read()\n");
    expect(generatePython(state({ type: "python_file_write", inputs: { FILE: expression("handle"), VALUE: text("done") } }))).toBe("handle.write('done')\n");
  });

  it("generates scope declarations and multiple exception branches", () => {
    expect(generatePython(state({ type: "python_scope_declaration", fields: { SCOPE: "global", NAMES: "counter, total, invalid name" } }))).toBe("global counter, total\n");
    expect(generatePython(state({ type: "python_scope_declaration", fields: { SCOPE: "nonlocal", NAMES: "state" } }))).toBe("nonlocal state\n");
    const guarded = {
      type: "python_try_two_except",
      fields: { ERROR1: "ValueError", ALIAS1: "value_error", ERROR2: "TypeError", ALIAS2: "type_error" },
      inputs: {
        TRY: { block: { type: "python_pass" } }, EXCEPT1: { block: { type: "python_print", inputs: { VALUE: text("value") } } },
        EXCEPT2: { block: { type: "python_print", inputs: { VALUE: text("type") } } }, FINALLY: { block: { type: "python_pass" } },
      },
    };
    expect(generatePython(state(guarded))).toBe("try:\n  pass\nexcept ValueError as value_error:\n  print('value')\nexcept TypeError as type_error:\n  print('type')\nfinally:\n  pass\n");
  });

  it("generates render-only line markers that map back to statement blocks", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(state({ id: "print-block", type: "python_print", inputs: { VALUE: text("hello") } }), workspace);
    const generated = generateWorkspacePythonWithBlockMap(workspace);
    expect(generated.code).toContain("# __visual_python_block_'print-block'__");
    const printLine = generated.code.split("\n").findIndex((line) => line.includes("print('hello')")) + 1;
    expect(generated.blockIdByLine.get(printLine)).toBe("print-block");
    workspace.dispose();
  });

  it("finds visible code ranges for statements, containers, and expression children", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
      id: "loop", type: "controls_repeat_ext",
      inputs: {
        TIMES: { shadow: { type: "math_number", fields: { NUM: 2 } } },
        DO: { block: { id: "print", type: "python_print", inputs: { VALUE: { block: { id: "text-value", type: "text", fields: { TEXT: "hello" } } } }, next: { block: { id: "second-print", type: "python_print", inputs: { VALUE: { block: { type: "text", fields: { TEXT: "world" } } } } } } } },
      },
    }] } }, workspace);
    expect(findWorkspaceBlockCodeRange(workspace, "loop")).toEqual({ startLineNumber: 1, endLineNumber: 3 });
    expect(findWorkspaceBlockCodeRange(workspace, "print")).toEqual({ startLineNumber: 2, endLineNumber: 2 });
    expect(findWorkspaceBlockCodeRange(workspace, "second-print")).toEqual({ startLineNumber: 3, endLineNumber: 3 });
    expect(findWorkspaceBlockCodeRange(workspace, "text-value")).toEqual({ startLineNumber: 2, endLineNumber: 2 });
    expect(findWorkspaceBlockCodeRange(workspace, "missing")).toBeNull();
    workspace.dispose();
  });

  it("keeps decorators adjacent to definitions in mapped execution code", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
      type: "python_decorated_definition", id: "decorator",
      inputs: {
        DECORATOR: expression("staticmethod"),
        DEFINITION: { block: { type: "python_function_structured", id: "definition", fields: { NAME: "build" }, extraState: { parameters: [] }, inputs: { BODY: { block: { type: "python_pass" } } } } },
      },
    }] } }, workspace);
    const generated = generateWorkspacePythonWithBlockMap(workspace);
    expect(generated.code).toContain("@staticmethod\ndef build():");
    expect(generated.code).not.toMatch(/@staticmethod\n# __visual_python_block_/);
    expect(generated.blockIdByLine.get(generated.code.split("\n").findIndex((line) => line === "def build():") + 1)).toBe("decorator");
    workspace.dispose();
  });

  it("generates assignable targets, augmented assignments, annotations and deletion", () => {
    const indexTarget = { type: "python_index_target", inputs: { OBJECT: expression("items"), INDEX: number(0) } };
    expect(generatePython(state({ type: "python_assign_target", inputs: { TARGET: { block: indexTarget }, VALUE: number(7) } }))).toBe("items[0] = 7\n");
    expect(generatePython(state({ type: "python_augmented_assign", fields: { OP: "+=" }, inputs: { TARGET: { block: { type: "python_variable_target", fields: { VAR: "total" } } }, VALUE: number(2) } }))).toBe("total += 2\n");
    const unpack = {
      type: "python_unpack_target", fields: { KIND: "tuple" },
      inputs: {
        A: { block: { type: "python_variable_target", fields: { VAR: "head" } } },
        B: { block: { type: "python_starred_target", inputs: { TARGET: { block: { type: "python_variable_target", fields: { VAR: "tail" } } } } } },
      },
    };
    expect(generatePython(state({ type: "python_assign_target", inputs: { TARGET: { block: unpack }, VALUE: expression("items") } }))).toBe("(head, *tail) = items\n");
    expect(generatePython(state({ type: "python_annotated_assign", fields: { VAR: "name", TYPE: "str" } }))).toBe("name: str\n");
    expect(generatePython(state({ type: "python_delete", inputs: { TARGET: { block: { type: "python_attribute_target", fields: { ATTRIBUTE: "cache" }, inputs: { OBJECT: expression("service") } } } } }))).toBe("del service.cache\n");
    expect(generatePython(state({ type: "python_walrus", fields: { VAR: "size" }, inputs: { VALUE: number(3) } }))).toBe("(size := 3)\n");
  });

  it("generates formatted and multiline strings plus chained comparisons", () => {
    expect(generatePython(state({ type: "python_f_string", fields: { PREFIX: "value=", FORMAT: ".2f", SUFFIX: "!" }, inputs: { VALUE: expression("total") } }))).toBe('f"value={total:.2f}!"\n');
    expect(generatePython(state({ type: "python_multiline_string", fields: { TEXT: "first\nsecond" } }))).toBe('"""first\nsecond"""\n');
    expect(generatePython(state({ type: "python_chained_compare", fields: { OP1: "<", OP2: "<=" }, inputs: { A: number(0), B: expression("score"), C: number(100) } }))).toBe("0 < score <= 100\n");
    expect(generatePython(state({ type: "python_bytes", fields: { TEXT: "data", ENCODING: "utf-8" } }))).toBe('"data".encode("utf-8")\n');
    expect(generatePython(state({ type: "python_matrix_multiply", inputs: { A: expression("left"), B: expression("right") } }))).toBe("left @ right\n");
  });

  it("generates starred structured call arguments", () => {
    const call = {
      type: "python_call_structured", fields: { TARGET: "render", ARG_NAME1: "quality" },
      extraState: { arguments: [{ kind: "star", name: "" }, { kind: "keyword", name: "quality" }, { kind: "kwargs", name: "" }] },
      inputs: { ARG0: expression("scenes"), ARG1: text("high"), ARG2: expression("options") },
    };
    expect(generatePython(state(call))).toBe("render(*scenes, quality='high', **options)\n");
  });

  it("generates import aliases, extended with statements and exception chaining", () => {
    expect(generatePython(state({ type: "python_import_as", fields: { MODULE: "numpy", ALIAS: "np" } }))).toBe("import numpy as np\n");
    expect(generatePython(state({ type: "python_import_multiple", fields: { MODULE1: "os", MODULE2: "sys" } }))).toBe("import os, sys\n");
    expect(generatePython(state({ type: "python_from_import_as", fields: { MODULE: "pathlib", NAME: "Path", ALIAS: "FilePath" } }))).toBe("from pathlib import Path as FilePath\n");
    expect(generatePython(state({ type: "python_from_import_multiple", fields: { MODULE: "collections", NAME1: "Counter", NAME2: "defaultdict" } }))).toBe("from collections import Counter, defaultdict\n");
    expect(generatePython(state({ type: "python_from_import_star", fields: { MODULE: "package.tools" } }))).toBe("from package.tools import *\n");
    const withTwo = { type: "python_with_two", fields: { ALIAS1: "source", ALIAS2: "target" }, inputs: { CONTEXT1: expression("open('in.txt')"), CONTEXT2: expression("open('out.txt', 'w')"), BODY: { block: { type: "python_pass" } } } };
    expect(generatePython(state(withTwo))).toBe("with open('in.txt') as source, open('out.txt', 'w') as target:\n  pass\n");
    expect(generatePython(state({ type: "python_raise_from", inputs: { ERROR: expression("ValueError('bad')"), CAUSE: expression("error") } }))).toBe("raise ValueError('bad') from error\n");
  });

  it("generates generators and structural pattern matching", () => {
    expect(generatePython(state({ type: "python_generator_expression", fields: { VAR: "item" }, inputs: { EXPRESSION: expression("item * 2"), ITERABLE: expression("items"), CONDITION: expression("item > 0") } }))).toBe("(item * 2 for item in items if item > 0)\n");
    const matchBlock = {
      type: "python_match", inputs: { SUBJECT: expression("status"), CASES: { block: {
        type: "python_case", inputs: { PATTERN: text("ready"), BODY: { block: { type: "python_print", inputs: { VALUE: text("go") } } } },
        next: { block: { type: "python_case_wildcard", inputs: { BODY: { block: { type: "python_pass" } } } } },
      } } },
    };
    expect(generatePython(state(matchBlock))).toBe("match status:\n  case 'ready':\n    print('go')\n  case _:\n    pass\n");
  });

  it("generates async functions, await, async for and async with", () => {
    const asyncFunction = {
      type: "python_async_function_structured", fields: { NAME: "consume", PARAM_NAME0: "stream" },
      extraState: { parameters: [{ kind: "positional", name: "stream" }] },
      inputs: { BODY: { block: { type: "python_async_for", fields: { VAR: "item" }, inputs: { ITERABLE: expression("stream"), DO: { block: { type: "python_print", inputs: { VALUE: { block: { type: "python_await", inputs: { VALUE: expression("process(item)") } } } } } } } } } },
    };
    expect(generatePython(state(asyncFunction))).toBe("async def consume(stream):\n  async for item in stream:\n    print(await process(item))\n");
    const asyncWith = { type: "python_async_with", fields: { ALIAS: "session" }, inputs: { CONTEXT: expression("ClientSession()"), BODY: { block: { type: "python_pass" } } } };
    expect(generatePython(state(asyncWith))).toBe("async with ClientSession() as session:\n  pass\n");
  });

  it("generates typed functions with positional-only and keyword-only parameters", () => {
    const typedFunction = {
      type: "python_typed_function_structured",
      fields: {
        NAME: "convert", RETURN_TYPE: "list[str]",
        PARAM_NAME0: "value", PARAM_TYPE0: "str",
        PARAM_NAME1: "limit", PARAM_TYPE1: "int",
        PARAM_NAME2: "flag", PARAM_TYPE2: "bool",
        PARAM_NAME3: "kwargs", PARAM_TYPE3: "object",
      },
      extraState: { parameters: [
        { kind: "positional_only", name: "value", annotation: "str" },
        { kind: "keyword_only", name: "limit", annotation: "int" },
        { kind: "keyword_only_default", name: "flag", annotation: "bool" },
        { kind: "kwargs", name: "kwargs", annotation: "object" },
      ] },
      inputs: { PARAM2: expression("True"), BODY: { block: { type: "python_return", inputs: { VALUE: expression("[value]") } } } },
    };
    expect(generatePython(state(typedFunction))).toBe("def convert(value: str, /, *, limit: int, flag: bool=True, **kwargs: object) -> list[str]:\n  return [value]\n");
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(state(typedFunction), workspace);
    expect((buildDefinedFunctionCallToolbox(workspace) as Array<Record<string, any>>).find((item) => item.fields?.TARGET === "convert")).toMatchObject({
      fields: { TARGET: "convert", ARG_NAME1: "limit", ARG_NAME2: "flag" },
    });
    workspace.dispose();
  });

  it("instantiates every statically exposed toolbox block", () => {
    const blockTypes: string[] = [];
    const visit = (items: any[]) => items.forEach((item) => {
      if (item.kind === "block") blockTypes.push(item.type);
      if (Array.isArray(item.contents)) visit(item.contents);
    });
    visit((toolbox as any).contents);
    const workspace = new Blockly.Workspace();
    for (const type of new Set(blockTypes)) {
      expect(() => workspace.newBlock(type), `failed to create ${type}`).not.toThrow();
    }
    workspace.dispose();
  });

  it("groups standard library blocks with labels inside one toolbox category", () => {
    const standardLibrary = (toolbox as any).contents.find((item: any) => item.name === "标准库");
    expect(standardLibrary).toBeTruthy();
    expect(standardLibrary.contents.some((item: any) => item.kind === "category")).toBe(false);
    expect(standardLibrary.contents.filter((item: any) => item.kind === "label").map((item: any) => item.text)).toEqual([
      "导入", "数学", "随机", "JSON", "日期与时间", "文件路径", "系统", "正则表达式", "集合工具",
    ]);
    expect(JSON.stringify(toolbox)).toContain("你好，世界");
    expect(JSON.stringify(toolbox)).not.toContain("hello python");
    expect(JSON.stringify(starterState)).toContain("你好，Python！");
    expect(JSON.stringify(starterState)).toContain("图形化编程");
  });

  it("uses one colour for every block in the async toolbox", () => {
    const workspace = new Blockly.Workspace();
    const asyncTypes = [
      "python_async_function_structured",
      "python_async_typed_function_structured",
      "python_await",
      "python_async_for",
      "python_async_with",
    ];
    const colours = asyncTypes.map((type) => workspace.newBlock(type).getColour());
    expect(new Set(colours)).toEqual(new Set(["#8762b8"]));
    workspace.dispose();
  });

  it("validates Python block placement contexts", () => {
    const load = (block: Record<string, any>, id: string) => {
      const workspace = new Blockly.Workspace();
      Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [block] } }, workspace);
      const target = workspace.getBlockById(id)!;
      return { workspace, warning: getPythonContextWarning(target) };
    };

    let result = load({ type: "python_return_none", id: "return" }, "return");
    expect(result.warning).toContain("return");
    result.workspace.dispose();

    result = load({ type: "python_function_structured", extraState: { parameters: [] }, inputs: { BODY: { block: { type: "python_return_none", id: "return" } } } }, "return");
    expect(result.warning).toBeNull();
    result.workspace.dispose();

    result = load({
      type: "python_function_structured", extraState: { parameters: [] },
      next: { block: { type: "python_return", id: "return-after-function", inputs: { VALUE: number(0) } } },
    }, "return-after-function");
    expect(result.warning).toBe("return 只能放在函数或方法内部。");
    result.workspace.dispose();

    result = load({ type: "python_function_structured", extraState: { parameters: [] }, inputs: { BODY: { block: { type: "python_print", inputs: { VALUE: { block: { type: "python_await", id: "await", inputs: { VALUE: expression("work()") } } } } } } } }, "await");
    expect(result.warning).toContain("异步函数");
    result.workspace.dispose();

    result = load({ type: "python_async_function_structured", extraState: { parameters: [] }, inputs: { BODY: { block: { type: "python_print", inputs: { VALUE: { block: { type: "python_await", id: "await", inputs: { VALUE: expression("work()") } } } } } } } }, "await");
    expect(result.warning).toBeNull();
    result.workspace.dispose();

    result = load({ type: "python_async_function_structured", extraState: { parameters: [] }, inputs: { BODY: { block: { type: "python_yield_from", id: "yield-from", inputs: { VALUE: expression("items") } } } } }, "yield-from");
    expect(result.warning).toContain("不能使用 yield from");
    result.workspace.dispose();

    result = load({ type: "python_case_wildcard", id: "case", inputs: { BODY: { block: { type: "python_pass" } } } }, "case");
    expect(result.warning).toContain("match");
    result.workspace.dispose();

    result = load({ type: "python_match", inputs: { SUBJECT: expression("status"), CASES: { block: { type: "python_case_wildcard", id: "case", inputs: { BODY: { block: { type: "python_pass" } } } } } } }, "case");
    expect(result.warning).toBeNull();
    result.workspace.dispose();

    result = load({ type: "python_match", inputs: { SUBJECT: expression("status"), CASES: { block: { type: "python_case_wildcard", inputs: { BODY: { block: { type: "python_case_wildcard", id: "nested-case", inputs: { BODY: { block: { type: "python_pass" } } } } } } } } } }, "nested-case");
    expect(result.warning).toContain("match");
    result.workspace.dispose();

    result = load({ type: "python_function_structured", extraState: { parameters: [] }, inputs: { BODY: { block: { type: "python_scope_declaration", id: "nonlocal", fields: { SCOPE: "nonlocal", NAMES: "value" } } } } }, "nonlocal");
    expect(result.warning).toContain("嵌套函数");
    result.workspace.dispose();

    result = load({ type: "python_function_structured", extraState: { parameters: [] }, inputs: { BODY: { block: { type: "python_function_structured", extraState: { parameters: [] }, inputs: { BODY: { block: { type: "python_scope_declaration", id: "nonlocal", fields: { SCOPE: "nonlocal", NAMES: "value" } } } } } } } }, "nonlocal");
    expect(result.warning).toBeNull();
    result.workspace.dispose();

    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
      type: "variables_set", fields: { VAR: { name: "message" } }, inputs: { VALUE: text("Hello, Python!") },
      next: { block: { type: "python_print", inputs: { VALUE: expression("message") }, next: { block: {
        type: "controls_repeat_ext", inputs: { TIMES: number(3), DO: { block: { type: "python_print", inputs: { VALUE: text("Visual coding") } } } },
        next: { block: { type: "python_return", id: "top-level-return", inputs: { VALUE: number(0) } } },
      } } } },
    }] } }, workspace);
    expect(validatePythonBlockContexts(workspace)).toEqual([{
      blockId: "top-level-return",
      message: "return 只能放在函数或方法内部。",
    }]);
    workspace.dispose();
  });

  it("validates required inputs without flagging optional sockets", () => {
    const workspace = new Blockly.Workspace();
    const assignment = workspace.newBlock("python_assign_target");
    expect(getPythonRequiredInputWarning(assignment)).toBe("缺少必填输入：赋值目标、赋值内容。");

    const target = workspace.newBlock("python_variable_target");
    const assignedValue = workspace.newBlock("math_number");
    assignment.getInput("TARGET")!.connection!.connect(target.outputConnection!);
    assignment.getInput("VALUE")!.connection!.connect(assignedValue.outputConnection!);
    expect(getPythonRequiredInputWarning(assignment)).toBeNull();

    const yieldBlock = workspace.newBlock("python_yield");
    expect(getPythonRequiredInputWarning(yieldBlock)).toBeNull();
    const slice = workspace.newBlock("python_slice");
    const slicedObject = workspace.newBlock("python_raw_expression");
    slice.getInput("OBJECT")!.connection!.connect(slicedObject.outputConnection!);
    expect(getPythonRequiredInputWarning(slice)).toBeNull();

    const call = workspace.newBlock("python_call_structured") as Blockly.Block & { loadExtraState(state: object): void };
    call.loadExtraState({ arguments: [{ kind: "positional", name: "" }] });
    expect(getPythonRequiredInputWarning(call)).toBe("缺少必填输入：第 1 个调用参数。");

    const functionBlock = workspace.newBlock("python_function_structured") as Blockly.Block & { loadExtraState(state: object): void };
    functionBlock.loadExtraState({ parameters: [{ kind: "default", name: "count" }] });
    expect(getPythonRequiredInputWarning(functionBlock)).toBe("缺少必填输入：参数 count 的默认值。");

    const matchBlock = workspace.newBlock("python_match");
    expect(getPythonRequiredInputWarning(matchBlock)).toBe("缺少必填输入：匹配对象、至少一个 case。");

    const sortedBlock = workspace.newBlock("python_builtin_sorted");
    expect(getPythonRequiredInputWarning(sortedBlock)).toBe("缺少必填输入：可迭代对象。");
    const sortedItems = workspace.newBlock("python_raw_expression");
    sortedBlock.getInput("ITERABLE")!.connection!.connect(sortedItems.outputConnection!);
    expect(getPythonRequiredInputWarning(sortedBlock)).toBeNull();

    const mapBlock = workspace.newBlock("python_builtin_map_filter");
    expect(getPythonRequiredInputWarning(mapBlock)).toBe("缺少必填输入：函数、可迭代对象。");

    const nextBlock = workspace.newBlock("python_builtin_next");
    expect(getPythonRequiredInputWarning(nextBlock)).toBe("缺少必填输入：迭代器。");
    const iterator = workspace.newBlock("python_raw_expression");
    nextBlock.getInput("ITERATOR")!.connection!.connect(iterator.outputConnection!);
    expect(getPythonRequiredInputWarning(nextBlock)).toBeNull();

    const jsonDumps = workspace.newBlock("python_json_dumps");
    expect(getPythonRequiredInputWarning(jsonDumps)).toBe("缺少必填输入：待转换值。");
    const jsonValue = workspace.newBlock("python_raw_expression");
    jsonDumps.getInput("VALUE")!.connection!.connect(jsonValue.outputConnection!);
    expect(getPythonRequiredInputWarning(jsonDumps)).toBeNull();

    const timeDelta = workspace.newBlock("python_datetime_timedelta");
    expect(getPythonRequiredInputWarning(timeDelta)).toBeNull();
    const listDirectory = workspace.newBlock("python_os_listdir");
    expect(getPythonRequiredInputWarning(listDirectory)).toBeNull();
    const readPath = workspace.newBlock("python_path_read_text");
    expect(getPythonRequiredInputWarning(readPath)).toBe("缺少必填输入：路径。");
    const pathValue = workspace.newBlock("python_raw_expression");
    readPath.getInput("PATH")!.connection!.connect(pathValue.outputConnection!);
    expect(getPythonRequiredInputWarning(readPath)).toBeNull();

    const counter = workspace.newBlock("python_collections_counter");
    expect(getPythonRequiredInputWarning(counter)).toBeNull();
    const regexSearch = workspace.newBlock("python_re_search");
    expect(getPythonRequiredInputWarning(regexSearch)).toBe("缺少必填输入：正则模式、待匹配文本。");
    const pattern = workspace.newBlock("text");
    const matchedText = workspace.newBlock("text");
    regexSearch.getInput("PATTERN")!.connection!.connect(pattern.outputConnection!);
    regexSearch.getInput("TEXT")!.connection!.connect(matchedText.outputConnection!);
    expect(getPythonRequiredInputWarning(regexSearch)).toBeNull();
    workspace.dispose();
  });

  it("validates identifiers, duplicate parameters and call argument order", () => {
    const workspace = new Blockly.Workspace();
    const functionBlock = workspace.newBlock("python_typed_function_structured") as Blockly.Block & { loadExtraState(state: object): void };
    functionBlock.loadExtraState({ parameters: [
      { kind: "positional", name: "first", annotation: "int" },
      { kind: "positional", name: "second", annotation: "str" },
    ] });
    functionBlock.setFieldValue("bad name", "NAME");
    functionBlock.setFieldValue("class", "PARAM_NAME0");
    functionBlock.setFieldValue("class", "PARAM_NAME1");
    functionBlock.setFieldValue("list[", "RETURN_TYPE");
    const functionWarning = getPythonIdentifierWarning(functionBlock)!;
    expect(functionWarning).toContain("函数名称“bad name”");
    expect(functionWarning).toContain("参数名称“class”无效");
    expect(functionWarning).toContain("函数参数名称重复：class");
    expect(functionWarning).toContain("返回类型“list[”无效");

    const orderedCall = workspace.newBlock("python_call_structured") as Blockly.Block & { loadExtraState(state: object): void };
    orderedCall.setFieldValue("service.render", "TARGET");
    orderedCall.loadExtraState({ arguments: [{ kind: "keyword", name: "quality" }, { kind: "positional", name: "" }] });
    expect(getPythonIdentifierWarning(orderedCall)).toBe("位置参数不能放在关键字参数之后。");

    const duplicateKeywords = workspace.newBlock("python_call_structured") as Blockly.Block & { loadExtraState(state: object): void };
    duplicateKeywords.setFieldValue("render", "TARGET");
    duplicateKeywords.loadExtraState({ arguments: [{ kind: "keyword", name: "first" }, { kind: "keyword", name: "second" }] });
    duplicateKeywords.setFieldValue("quality", "ARG_NAME0");
    duplicateKeywords.setFieldValue("quality", "ARG_NAME1");
    expect(getPythonIdentifierWarning(duplicateKeywords)).toBe("关键字参数名称重复：quality。");

    const validCall = workspace.newBlock("python_call_structured");
    validCall.setFieldValue("asyncio.run", "TARGET");
    expect(getPythonIdentifierWarning(validCall)).toBeNull();

    const invalidImport = workspace.newBlock("python_import_as");
    invalidImport.setFieldValue("bad module", "MODULE");
    invalidImport.setFieldValue("for", "ALIAS");
    expect(getPythonIdentifierWarning(invalidImport)).toContain("模块别名“for”");
    expect(getPythonIdentifierWarning(invalidImport)).toContain("模块名称“bad module”无效");
    workspace.dispose();
  });

});
