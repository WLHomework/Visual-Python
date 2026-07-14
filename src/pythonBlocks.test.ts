import { describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { generatePython } from "./pythonBlocks";

const variableFields: Record<string, string[]> = {
  variables_set: ["VAR"], variables_get: ["VAR"],
  python_input_assign: ["VAR"], python_for_in: ["VAR"], python_for_enumerate: ["INDEX", "VALUE"], python_for_else: ["VAR"],
  python_try_except: ["ALIAS"], python_try_full: ["ALIAS"], python_with: ["ALIAS"],
};
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

  it("keeps function parameters inside the signature and removes empty separators", () => {
    const workspace = new Blockly.Workspace();
    const block = workspace.newBlock("python_function_structured") as Blockly.Block & { loadExtraState(state: object): void };
    expect(block.getInput("HEAD")?.fieldRow.map((field) => field.getText()).join(" ")).toContain("my_function ( value )");
    block.loadExtraState({ parameters: [] });
    const emptySignature = block.getInput("HEAD")?.fieldRow.map((field) => field.getText()).join(" ") ?? "";
    expect(emptySignature).toContain("my_function ( )");
    expect(emptySignature).not.toContain(",");
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
    expect(call.getInput("HEAD")?.fieldRow.map((field) => field.getText()).join(" ")).toContain("function ( )");
    expect(call.getInput("TAIL")).toBeNull();
    call.loadExtraState({ arguments: [{ kind: "positional", name: "" }] });
    expect(call.getInput("ARG0")?.fieldRow.map((field) => field.getText()).join(" ")).toContain(")");
    expect(call.getInput("TAIL")).toBeNull();
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

});
