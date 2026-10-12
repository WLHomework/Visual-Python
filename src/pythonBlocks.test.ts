import { describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { buildDefinedClassConstructorToolbox, buildDefinedFunctionCallToolbox, defaultVisualThemeId, deferHeavyStatementInputs, findWorkspaceBlockCodeRange, generatePython, generateWorkspacePython, generateWorkspacePythonWithBlockMap, hydrateDeferredInputs, loadWorkspaceFast, markHeavyStacksCollapsed, restoreDeferredIntoState, saveWorkspaceState, starterState, toolbox, visualPythonTheme, visualPythonThemes } from "./pythonBlocks";
import { getManimVoiceoverContextWarning, getPythonCollectionTypeWarning, getPythonContextWarning, getPythonIdentifierWarning, getPythonImportWarning, getPythonRequiredInputWarning, uniqueIssueMessages, validatePythonBlockContexts } from "./pythonSyntaxBlocks";

const variableFields: Record<string, string[]> = {
  variables_set: ["VAR"], variables_get: ["VAR"],
  python_input_assign: ["VAR"], python_input_many_assign: ["VAR0", "VAR1", "VAR2"], python_csv_read: ["VAR"], python_for_in: ["VAR"], python_for_enumerate: ["INDEX", "VALUE"], python_for_else: ["VAR"],
  python_try_except: ["ALIAS"], python_try_full: ["ALIAS"], python_with: ["ALIAS"],
  python_variable_target: ["VAR"], python_annotated_assign: ["VAR"], python_walrus: ["VAR"],
  python_generator_expression: ["VAR"], python_with_two: ["ALIAS1", "ALIAS2"],
  python_async_for: ["VAR"], python_async_with: ["ALIAS"],
};

const longPrintFunctionState = () => {
  const prints = Array.from({ length: 30 }, (_, index) => ({
    type: "python_print",
    inputs: { VALUE: { block: { type: "text", fields: { TEXT: String(index) } } } },
  })) as Array<Record<string, unknown>>;
  for (let index = 0; index < prints.length - 1; index += 1) prints[index].next = { block: prints[index + 1] };
  return {
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: "python_function_structured",
        fields: { NAME: "demo", PARAM_NAME0: "value" },
        extraState: { parameters: [{ kind: "positional", name: "value" }] },
        inputs: { BODY: { block: prints[0] } },
      }],
    },
  };
};

describe("bulk workspace loading", () => {
  it("defers long statement stacks out of the live Blockly tree", () => {
    const state = longPrintFunctionState();
    deferHeavyStatementInputs(state, 16, 40);
    const top = state.blocks.blocks[0] as Record<string, unknown> & { inputs?: Record<string, unknown>; data?: string; collapsed?: boolean };
    expect(top.inputs?.BODY).toBeUndefined();
    expect(top.collapsed).toBe(true);
    expect(String(top.data || "")).toContain("vpDeferred");
    restoreDeferredIntoState(state);
    expect((state.blocks.blocks[0] as { inputs?: { BODY?: { block?: { type?: string } } } }).inputs?.BODY?.block?.type).toBe("python_print");
  });

  it("does not mutate a short starter workspace as collapsed", () => {
    const before = JSON.stringify(starterState);
    markHeavyStacksCollapsed(starterState);
    expect(JSON.stringify(starterState)).toBe(before);
  });

  it("restores Blockly events after loadWorkspaceFast", () => {
    const workspace = new Blockly.Workspace();
    const wasEnabled = Blockly.Events.isEnabled();
    try {
      loadWorkspaceFast(workspace, starterState);
      expect(Blockly.Events.isEnabled()).toBe(wasEnabled);
      expect(workspace.getAllBlocks(false).length).toBeGreaterThan(0);
    } finally {
      workspace.dispose();
    }
  });

  it("loads a long stack without creating every child block", () => {
    const workspace = new Blockly.Workspace();
    try {
      loadWorkspaceFast(workspace, longPrintFunctionState(), { collapseIfBlocks: 10 });
      expect(workspace.getAllBlocks(false).length).toBeLessThan(10);
      expect(generateWorkspacePython(workspace)).toContain("print('29')");
      const saved = saveWorkspaceState(workspace) as { blocks?: { blocks?: Array<{ inputs?: { BODY?: { block?: unknown } } }> } };
      expect(saved.blocks?.blocks?.[0]?.inputs?.BODY?.block).toBeTruthy();
    } finally {
      workspace.dispose();
    }
  });

  it("hydrates deferred inputs when a collapsed block is expanded", () => {
    const workspace = new Blockly.Workspace();
    try {
      loadWorkspaceFast(workspace, longPrintFunctionState(), { collapseIfBlocks: 10 });
      const top = workspace.getTopBlocks(false)[0];
      expect(top).toBeTruthy();
      hydrateDeferredInputs(top!, { sync: true });
      expect(workspace.getAllBlocks(false).length).toBeGreaterThan(20);
    } finally {
      workspace.dispose();
    }
  });

  it("does not freeze the workspace on the first hydration frame", async () => {
    const workspace = new Blockly.Workspace();
    try {
      loadWorkspaceFast(workspace, longPrintFunctionState(), { collapseIfBlocks: 10 });
      const top = workspace.getTopBlocks(false)[0];
      expect(top).toBeTruthy();
      hydrateDeferredInputs(top!);
      expect(workspace.getAllBlocks(false).length).toBeLessThan(10);
      await new Promise<void>((resolve) => {
        const tick = (left: number) => {
          if (left <= 0) resolve();
          else requestAnimationFrame(() => tick(left - 1));
        };
        tick(50);
      });
      expect(workspace.getAllBlocks(false).length).toBeGreaterThan(20);
    } finally {
      workspace.dispose();
    }
  });

  it("re-enables Blockly events if a bulk load fails", () => {
    const workspace = new Blockly.Workspace();
    const wasEnabled = Blockly.Events.isEnabled();
    try {
      expect(() => loadWorkspaceFast(workspace, { blocks: { languageVersion: 0, blocks: [{ type: "does_not_exist" }] } })).toThrow();
      expect(Blockly.Events.isEnabled()).toBe(wasEnabled);
    } finally {
      workspace.dispose();
    }
  });
});

describe("workspace issue messages", () => {
  it("keeps identical context errors only once", () => {
    expect(uniqueIssueMessages([
      { blockId: "a", message: "场景中没有名为“obj”的已创建对象。" },
      { blockId: "b", message: "场景中没有名为“obj”的已创建对象。" },
      { blockId: "c", message: "动画效果需要连接到“播放动画”积木中。" },
    ])).toEqual([
      "场景中没有名为“obj”的已创建对象。",
      "动画效果需要连接到“播放动画”积木中。",
    ]);
  });
});

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
const withImport = (moduleName: string, code: string) => `import ${moduleName}\n\n\n${code}`;
const configuredToolboxBlock = (categoryName: string, type: string, predicate: (entry: any) => boolean = () => true) => {
  const category = (toolbox as any).contents.find((item: any) => item.name === categoryName);
  const item = category.contents.find((entry: any) => entry.type === type && predicate(entry));
  const { kind: _kind, ...blockState } = structuredClone(item);
  return blockState;
};

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
    expect(generatePython(state({ type: "python_call", fields: { NAME: "bad code!" } }))).toContain("自定义函数()");
  });

  it("preserves Chinese Python identifiers in generated code", () => {
    const functionBlock = {
      type: "python_function_structured",
      fields: { NAME: "计算面积", PARAM_NAME0: "半径" },
      extraState: { parameters: [{ kind: "positional", name: "半径" }] },
      inputs: { BODY: { block: { type: "python_return", inputs: { VALUE: expression("半径 * 半径") } } } },
    };
    expect(generatePython(state(functionBlock))).toContain("def 计算面积(半径):\n  return 半径 * 半径");

    const variableState = state({
      type: "variables_set",
      fields: { VAR: { name: "计算结果" } },
      inputs: { VALUE: number(4) },
    });
    expect(generatePython(variableState)).toContain("计算结果 = 4");
  });

  it("uses Chinese defaults for beginner-created identifiers", () => {
    const workspace = new Blockly.Workspace();
    const fieldText = (type: string, field: string) => workspace.newBlock(type).getField(field)?.getText();

    expect(fieldText("python_input_assign", "VAR")).toBe("回答");
    expect(fieldText("python_for_in", "VAR")).toBe("项目");
    expect(fieldText("python_function_structured", "NAME")).toBe("自定义函数");
    expect(fieldText("python_function_structured", "PARAM_NAME0")).toBe("数值");
    expect(fieldText("python_class_def", "NAME")).toBe("自定义类");
    expect(fieldText("python_lambda", "PARAMS")).toBe("数值");

    workspace.dispose();
  });

  it("generates dynamic collections including empty and single item forms", () => {
    expect(generatePython(state({ type: "python_sequence_collection", fields: { KIND: "list" }, extraState: { itemCount: 0 } }))).toBe("[]\n");
    expect(generatePython(state({ type: "python_sequence_collection", fields: { KIND: "tuple" }, extraState: { itemCount: 1 }, inputs: { ITEM0: number(1) } }))).toBe("(1,)\n");
    expect(generatePython(state({ type: "python_sequence_collection", fields: { KIND: "set" }, extraState: { itemCount: 0 } }))).toBe("set()\n");
    expect(generatePython(state({ type: "python_list_collection", extraState: { itemCount: 2 }, inputs: { ITEM0: number(1), ITEM1: number(2) } }))).toBe("[1, 2]\n");
    expect(generatePython(state({ type: "python_dynamic_dict", extraState: { itemCount: 1 }, inputs: { KEY0: text("name"), VALUE0: text("Ada") } }))).toBe("{'name': 'Ada'}\n");
  });

  it("uses a list-only mutator for list examples instead of a type selector", () => {
    const standardLibrary = (toolbox as any).contents.find((item: any) => item.name === "标准库");
    const counter = standardLibrary.contents.find((item: any) => item.type === "python_collections_counter");
    expect(counter.inputs.ITERABLE.block.type).toBe("python_list_collection");
  });

  it("keeps existing list values when the mutator adds an item", () => {
    const workspace = new Blockly.Workspace();
    const listBlock = workspace.newBlock("python_list_collection") as Blockly.Block & {
      itemCount_?: number;
      loadExtraState(state: object): void;
      saveConnections(container: Blockly.Block): void;
      compose(container: Blockly.Block): void;
    };
    listBlock.loadExtraState({ itemCount: 3 });
    const values = [1, 2, 3].map((value) => {
      const block = workspace.newBlock("math_number");
      block.setFieldValue(value, "NUM");
      return block;
    });
    values.forEach((value, index) => listBlock.getInput(`ITEM${index}`)!.connection!.connect(value.outputConnection!));
    const originalIds = values.map((value) => value.id);

    const container = workspace.newBlock("python_collection_container");
    let connection = container.getInput("STACK")!.connection!;
    for (let i = 0; i < 4; i++) {
      const item = workspace.newBlock("python_collection_item");
      connection.connect(item.previousConnection!);
      connection = item.nextConnection!;
    }
    listBlock.saveConnections(container);
    listBlock.compose(container);

    expect(listBlock.itemCount_).toBe(4);
    expect([0, 1, 2].map((index) => listBlock.getInputTargetBlock(`ITEM${index}`)?.id)).toEqual(originalIds);
    expect(listBlock.getInputTargetBlock("ITEM3")).toBeNull();
    workspace.dispose();
  });

  it("keeps shadow values when the mutator adds an item", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.blocks.append({
      type: "python_list_collection",
      extraState: { itemCount: 3 },
      inputs: {
        ITEM0: { shadow: { type: "math_number", fields: { NUM: 1 } } },
        ITEM1: { shadow: { type: "math_number", fields: { NUM: 2 } } },
        ITEM2: { shadow: { type: "math_number", fields: { NUM: 3 } } },
      },
    }, workspace);
    const listBlock = workspace.getTopBlocks(false)[0] as Blockly.Block & {
      itemCount_?: number;
      saveConnections(container: Blockly.Block): void;
      compose(container: Blockly.Block): void;
    };
    const originalValues = [0, 1, 2].map((index) => listBlock.getInputTargetBlock(`ITEM${index}`)?.getFieldValue("NUM"));

    const container = workspace.newBlock("python_collection_container");
    let connection = container.getInput("STACK")!.connection!;
    for (let i = 0; i < 4; i++) {
      const item = workspace.newBlock("python_collection_item");
      connection.connect(item.previousConnection!);
      connection = item.nextConnection!;
    }
    listBlock.saveConnections(container);
    listBlock.compose(container);

    expect(listBlock.itemCount_).toBe(4);
    expect([0, 1, 2].map((index) => listBlock.getInputTargetBlock(`ITEM${index}`)?.getFieldValue("NUM"))).toEqual(originalValues);
    expect([0, 1, 2].every((index) => listBlock.getInputTargetBlock(`ITEM${index}`)?.isShadow())).toBe(true);
    workspace.dispose();
  });

  it("keeps tuple and set shadow values when their mutator adds an item", () => {
    for (const kind of ["tuple", "set"] as const) {
      const workspace = new Blockly.Workspace();
      Blockly.serialization.blocks.append({
        type: "python_sequence_collection",
        fields: { KIND: kind },
        extraState: { itemCount: 2 },
        inputs: {
          ITEM0: { shadow: { type: "math_number", fields: { NUM: 1 } } },
          ITEM1: { shadow: { type: "math_number", fields: { NUM: 2 } } },
        },
      }, workspace);
      const sequence = workspace.getTopBlocks(false)[0] as Blockly.Block & {
        saveConnections(container: Blockly.Block): void;
        compose(container: Blockly.Block): void;
      };
      const container = workspace.newBlock("python_collection_container");
      let connection = container.getInput("STACK")!.connection!;
      for (let index = 0; index < 3; index += 1) {
        const item = workspace.newBlock("python_collection_item");
        connection.connect(item.previousConnection!);
        connection = item.nextConnection!;
      }
      sequence.saveConnections(container);
      sequence.compose(container);

      expect(sequence.getInputTargetBlock("ITEM0")?.getFieldValue("NUM")).toBe(1);
      expect(sequence.getInputTargetBlock("ITEM1")?.getFieldValue("NUM")).toBe(2);
      expect(sequence.getInputTargetBlock("ITEM0")?.isShadow()).toBe(true);
      expect(sequence.getInputTargetBlock("ITEM1")?.isShadow()).toBe(true);
      workspace.dispose();
    }
  });

  it("keeps shadow keys and values when the dictionary mutator adds an item", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.blocks.append({
      type: "python_dynamic_dict",
      extraState: { itemCount: 2 },
      inputs: {
        KEY0: { shadow: { type: "text", fields: { TEXT: "a" } } },
        VALUE0: { shadow: { type: "math_number", fields: { NUM: 1 } } },
        KEY1: { shadow: { type: "text", fields: { TEXT: "b" } } },
        VALUE1: { shadow: { type: "math_number", fields: { NUM: 2 } } },
      },
    }, workspace);
    const dictionary = workspace.getTopBlocks(false)[0] as Blockly.Block & {
      itemCount_?: number;
      saveConnections(container: Blockly.Block): void;
      compose(container: Blockly.Block): void;
    };
    const container = workspace.newBlock("python_collection_container");
    let connection = container.getInput("STACK")!.connection!;
    for (let i = 0; i < 3; i++) {
      const item = workspace.newBlock("python_collection_item");
      connection.connect(item.previousConnection!);
      connection = item.nextConnection!;
    }
    dictionary.saveConnections(container);
    dictionary.compose(container);

    expect(dictionary.itemCount_).toBe(3);
    expect(dictionary.getInputTargetBlock("KEY0")?.getFieldValue("TEXT")).toBe("a");
    expect(dictionary.getInputTargetBlock("VALUE0")?.getFieldValue("NUM")).toBe(1);
    expect(dictionary.getInputTargetBlock("KEY1")?.getFieldValue("TEXT")).toBe("b");
    expect(dictionary.getInputTargetBlock("VALUE1")?.getFieldValue("NUM")).toBe(2);
    expect(dictionary.getInputTargetBlock("KEY0")?.isShadow()).toBe(true);
    expect(dictionary.getInputTargetBlock("VALUE0")?.isShadow()).toBe(true);
    expect(dictionary.getInputTargetBlock("KEY1")?.isShadow()).toBe(true);
    expect(dictionary.getInputTargetBlock("VALUE1")?.isShadow()).toBe(true);
    workspace.dispose();
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

  it("generates typed input assignments", () => {
    const input = { type: "python_input_typed_assign", fields: { VAR: { name: "age" }, TYPE: "int" }, inputs: { PROMPT: text("年龄：") } };
    expect(generatePython(state(input))).toBe("age = int(input('年龄：'))\n");
  });

  it("generates multi-value print with separator and ending text", () => {
    const printMany = {
      type: "python_print_many",
      extraState: { itemCount: 2 },
      fields: { SEP: " | ", END: "\\n" },
      inputs: { ITEM0: text("姓名"), ITEM1: expression("score") },
    };
    expect(generatePython(state(printMany))).toBe("print('姓名', score, sep=\" | \", end=\"\\\\n\")\n");
  });

  it("generates multi-value text and numeric input assignments", () => {
    const numericInput = {
      type: "python_input_many_assign",
      extraState: { itemCount: 2, variables: ["x", "y"] },
      fields: { SEP: "", TYPE: "int", VAR0: "x", VAR1: "y" },
      inputs: { PROMPT: text("请输入两个数字：") },
    };
    expect(generatePython(state(numericInput))).toBe("x, y = map(int, input('请输入两个数字：').split())\n");

    const textInput = {
      type: "python_input_many_assign",
      extraState: { itemCount: 2, variables: ["first", "second"] },
      fields: { SEP: ",", TYPE: "str", VAR0: "first", VAR1: "second" },
      inputs: { PROMPT: text("请输入姓名：") },
    };
    expect(generatePython(state(textInput))).toBe("first, second = input('请输入姓名：').split(\",\")\n");
  });

  it("groups input and output blocks with labels instead of nested categories", () => {
    const inputOutput = (toolbox as any).contents.find((item: any) => item.name === "输入输出");
    expect(inputOutput.contents.filter((item: any) => item.kind === "label").map((item: any) => item.text)).toEqual(["基础输出", "多值输出", "用户输入", "类型处理"]);
    expect(inputOutput.contents.filter((item: any) => item.kind === "block").map((item: any) => item.type)).toEqual([
      "python_print", "python_print_many", "python_input_assign", "python_input", "python_input_typed_assign", "python_input_many_assign", "python_length", "python_convert",
    ]);
    expect(inputOutput.contents.some((item: any) => item.kind === "category")).toBe(false);
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

  it("provides runnable defaults for math and built-in toolbox blocks", () => {
    expect(generatePython(state(configuredToolboxBlock("数学", "math_arithmetic")))).toBe("1 + 1\n");
    expect(generatePython(state(configuredToolboxBlock("数学", "math_on_list")))).toBe("sum([1, 2, 3])\n");
    expect(generatePython(state(configuredToolboxBlock("内置函数", "python_builtin_sum")))).toBe("sum([1, 2, 3])\n");
    expect(generatePython(state(configuredToolboxBlock("内置函数", "python_builtin_sorted")))).toBe("sorted([3, 1, 2])\n");
    expect(generatePython(state(configuredToolboxBlock("内置函数", "python_builtin_map_filter")))).toBe("map(lambda 数值: 数值 * 2, [1, 2, 3])\n");
    expect(generatePython(state(configuredToolboxBlock("内置函数", "python_builtin_next")))).toBe("next(iter([1, 2, 3]))\n");
  });

  it("provides complete modern syntax, file resource and async templates", () => {
    const matchCode = generatePython(state(configuredToolboxBlock("现代语法", "python_match")));
    expect(matchCode).toBe("match '开始':\n  case '开始':\n    print('开始处理')\n  case _:\n    pass\n");

    const withCode = generatePython(state(configuredToolboxBlock("文件", "python_with", (entry) => entry.inputs?.CONTEXT?.shadow?.fields?.MODE === "w")));
    expect(withCode).toContain("with open('output.txt', \"w\", encoding=\"utf-8\") as 文件:");
    expect(withCode).toContain("文件.write('示例内容')");

    const readWithCode = generatePython(state(configuredToolboxBlock("文件", "python_with", (entry) => entry.inputs?.CONTEXT?.shadow?.fields?.MODE === "r")));
    expect(readWithCode).toContain("with open('data.txt', \"r\", encoding=\"utf-8\") as 文件:");
    expect(readWithCode).toContain("文件内容 = 文件.read()");

    const asyncCode = generatePython(state(configuredToolboxBlock("异步", "python_async_function_structured")));
    expect(asyncCode).toContain("import asyncio");
    expect(asyncCode).toContain("async def 主函数():");
    expect(asyncCode).toContain("await asyncio.sleep(1)");
    expect(asyncCode).toContain("asyncio.run(主函数())");
  });

  it("provides complete comprehension, generator and decorator templates", () => {
    expect(generatePython(state(configuredToolboxBlock("集合", "python_list_comprehension")))).toBe("[项目 * 2 for 项目 in [1, 2, 3]]\n");
    expect(generatePython(state(configuredToolboxBlock("集合", "python_set_comprehension")))).toBe("{项目 for 项目 in [1, 2, 2, 3]}\n");
    expect(generatePython(state(configuredToolboxBlock("集合", "python_dict_comprehension")))).toBe("{项目: 项目 * 2 for 项目 in [1, 2, 3]}\n");
    expect(generatePython(state(configuredToolboxBlock("函数", "python_generator_expression")))).toBe("(项目 * 2 for 项目 in [1, 2, 3])\n");

    const decoratorCode = generatePython(state(configuredToolboxBlock("函数", "python_decorated_definition")));
    expect(decoratorCode).toContain("import functools");
    expect(decoratorCode).toContain("@functools.cache");
    expect(decoratorCode).toContain("def 计算(数值):");
    expect(decoratorCode).toContain("return 数值");

    const inputOutput = (toolbox as any).contents.find((item: any) => item.name === "输入输出");
    const textCategory = (toolbox as any).contents.find((item: any) => item.name === "文本");
    expect(inputOutput.contents.some((item: any) => item.type === "text")).toBe(false);
    expect(textCategory.contents.some((item: any) => item.type === "text")).toBe(true);
  });

  it("generates core math, random and JSON standard library blocks", () => {
    expect(generatePython(state({ type: "python_standard_library_import", fields: { MODULE: "math" } }))).toBe("import math\n");
    expect(generatePython(state({ type: "python_math_constant", fields: { CONSTANT: "pi" } }))).toBe(withImport("math", "math.pi\n"));
    expect(generatePython(state({ type: "python_math_unary", fields: { FUNCTION: "sqrt" }, inputs: { VALUE: number(9) } }))).toBe(withImport("math", "math.sqrt(9)\n"));
    expect(generatePython(state({ type: "python_random_randint", inputs: { A: number(1), B: number(6) } }))).toBe(withImport("random", "random.randint(1, 6)\n"));
    expect(generatePython(state({ type: "python_random_uniform", inputs: { A: number(0), B: number(1) } }))).toBe(withImport("random", "random.uniform(0, 1)\n"));
    expect(generatePython(state({ type: "python_random_choice", inputs: { SEQUENCE: expression("items") } }))).toBe(withImport("random", "random.choice(items)\n"));
    expect(generatePython(state({ type: "python_random_sample", inputs: { POPULATION: expression("items"), K: number(3) } }))).toBe(withImport("random", "random.sample(items, 3)\n"));
    expect(generatePython(state({ type: "python_random_shuffle", inputs: { SEQUENCE: expression("items") } }))).toBe(withImport("random", "random.shuffle(items)\n"));
    expect(generatePython(state({ type: "python_json_dumps", inputs: { VALUE: expression("data"), INDENT: number(2) } }))).toBe(withImport("json", "json.dumps(data, indent=2)\n"));
    expect(generatePython(state({ type: "python_json_loads", inputs: { TEXT: expression("payload") } }))).toBe(withImport("json", "json.loads(payload)\n"));
  });

  it("generates structured output, command-line input and CSV file blocks", () => {
    expect(generatePython(state({ type: "python_pprint", inputs: { VALUE: expression("data") } }))).toBe(withImport("pprint", "pprint.pprint(data)\n"));
    expect(generatePython(state({ type: "python_sys_argv" }))).toBe(withImport("sys", "sys.argv\n"));
    expect(generatePython(state({ type: "python_sys_exit", inputs: { CODE: number(1) } }))).toBe(withImport("sys", "sys.exit(1)\n"));

    const csvRead = { type: "python_csv_read", fields: { VAR: { name: "rows" }, DELIMITER: "," }, inputs: { PATH: text("scores.csv") } };
    expect(generatePython(state(csvRead))).toBe("import csv\n\nwith open('scores.csv', \"r\", newline=\"\", encoding=\"utf-8\") as 文件:\n  rows = list(csv.reader(文件, delimiter=\",\"))\n");
    const csvWrite = { type: "python_csv_write", fields: { DELIMITER: ";" }, inputs: { PATH: text("scores.csv"), DATA: expression("rows") } };
    expect(generatePython(state(csvWrite))).toBe(withImport("csv", "with open('scores.csv', \"w\", newline=\"\", encoding=\"utf-8\") as 文件:\n  csv.writer(文件, delimiter=\";\").writerows(rows)\n"));
  });

  it("generates datetime, pathlib and os standard library blocks", () => {
    expect(generatePython(state({ type: "python_standard_library_import", fields: { MODULE: "datetime" } }))).toBe("import datetime\n");
    expect(generatePython(state({ type: "python_datetime_now", fields: { MODE: "now" } }))).toBe(withImport("datetime", "datetime.datetime.now()\n"));
    expect(generatePython(state({ type: "python_datetime_now", fields: { MODE: "utc" } }))).toBe(withImport("datetime", "datetime.datetime.now(datetime.timezone.utc)\n"));
    expect(generatePython(state({ type: "python_datetime_parse", inputs: { TEXT: text("2026-07-16"), FORMAT: text("%Y-%m-%d") } }))).toBe(withImport("datetime", "datetime.datetime.strptime('2026-07-16', '%Y-%m-%d')\n"));
    expect(generatePython(state({ type: "python_datetime_format", inputs: { VALUE: expression("created_at"), FORMAT: text("%H:%M") } }))).toBe("created_at.strftime('%H:%M')\n");
    expect(generatePython(state({ type: "python_datetime_timedelta", inputs: { DAYS: number(2), HOURS: number(3) } }))).toBe(withImport("datetime", "datetime.timedelta(days=2, hours=3)\n"));
    expect(generatePython(state({ type: "python_time_sleep", inputs: { SECONDS: number(2) } }))).toBe(withImport("time", "time.sleep(2)\n"));
    expect(generatePython(state({ type: "python_path_create", inputs: { VALUE: text("output") } }))).toBe(withImport("pathlib", "pathlib.Path('output')\n"));
    expect(generatePython(state({ type: "python_path_join", inputs: { BASE: expression("base_path"), CHILD: text("scene.py") } }))).toBe("base_path / 'scene.py'\n");
    expect(generatePython(state({ type: "python_path_check", fields: { METHOD: "is_file" }, inputs: { PATH: expression("path") } }))).toBe("path.is_file()\n");
    expect(generatePython(state({ type: "python_path_read_text", inputs: { PATH: expression("path"), ENCODING: text("utf-8") } }))).toBe("path.read_text(encoding='utf-8')\n");
    expect(generatePython(state({ type: "python_path_write_text", inputs: { PATH: expression("path"), TEXT: text("hello") } }))).toBe("path.write_text('hello')\n");
    expect(generatePython(state({ type: "python_os_getcwd" }))).toBe(withImport("os", "os.getcwd()\n"));
    expect(generatePython(state({ type: "python_os_listdir" }))).toBe(withImport("os", "os.listdir()\n"));
    expect(generatePython(state({ type: "python_os_listdir", fields: { FILTER: "files" }, inputs: { PATH: text("data") } })))
      .toBe(withImport("os", "[名称 for 名称 in os.listdir('data') if os.path.isfile(os.path.join('data', 名称))]\n"));
    expect(generatePython(state({ type: "python_os_makedirs", fields: { EXIST_OK: "True" }, inputs: { PATH: text("output") } }))).toBe(withImport("os", "os.makedirs('output', exist_ok=True)\n"));
    expect(generatePython(state({ type: "python_os_makedirs", fields: { DIRECTORY_NAME: "图片", EXIST_OK: "True" }, inputs: { PATH: text("output") } })))
      .toBe(withImport("os", "os.makedirs(os.path.join('output', \"图片\"), exist_ok=True)\n"));
    expect(generatePython(state({ type: "python_os_getenv", inputs: { NAME: text("HOME"), DEFAULT: text("") } }))).toBe(withImport("os", "os.getenv('HOME', '')\n"));
  });

  it("generates regular expression and collections standard library blocks", () => {
    expect(generatePython(state({ type: "python_standard_library_import", fields: { MODULE: "re" } }))).toBe("import re\n");
    expect(generatePython(state({ type: "python_re_search", fields: { FUNCTION: "search" }, inputs: { PATTERN: text("[a-z]+"), TEXT: expression("content"), FLAGS: { block: { type: "python_re_flag", fields: { FLAG: "IGNORECASE" } } } } }))).toBe(withImport("re", "re.search('[a-z]+', content, flags=re.IGNORECASE)\n"));
    expect(generatePython(state({ type: "python_re_sub", inputs: { PATTERN: text("\\s+"), REPLACEMENT: text(" "), TEXT: expression("content"), COUNT: number(2) } }))).toBe(withImport("re", "re.sub('\\\\s+', ' ', content, count=2)\n"));
    expect(generatePython(state({ type: "python_re_split", inputs: { PATTERN: text(","), TEXT: expression("content") } }))).toBe(withImport("re", "re.split(',', content)\n"));
    expect(generatePython(state({ type: "python_re_compile", inputs: { PATTERN: text("^item") } }))).toBe(withImport("re", "re.compile('^item')\n"));
    expect(generatePython(state({ type: "python_re_group", inputs: { MATCH: expression("match"), GROUP: number(1) } }))).toBe("match.group(1)\n");
    expect(generatePython(state({ type: "python_collections_counter" }))).toBe(withImport("collections", "collections.Counter()\n"));
    expect(generatePython(state({ type: "python_collections_defaultdict", inputs: { FACTORY: expression("list") } }))).toBe(withImport("collections", "collections.defaultdict(list)\n"));
    expect(generatePython(state({ type: "python_collections_deque", inputs: { MAXLEN: number(5) } }))).toBe(withImport("collections", "collections.deque([], maxlen=5)\n"));
    expect(generatePython(state({ type: "python_collections_namedtuple", inputs: { NAME: text("Point"), FIELDS: expression("['x', 'y']") } }))).toBe(withImport("collections", "collections.namedtuple('Point', ['x', 'y'])\n"));
    expect(generatePython(state({ type: "python_deque_add", fields: { METHOD: "appendleft" }, inputs: { DEQUE: expression("queue"), VALUE: number(1) } }))).toBe("queue.appendleft(1)\n");
    expect(generatePython(state({ type: "python_deque_pop", fields: { METHOD: "popleft" }, inputs: { DEQUE: expression("queue") } }))).toBe("queue.popleft()\n");
    expect(generatePython(state({ type: "python_counter_most_common", inputs: { COUNTER: expression("counts") } }))).toBe("counts.most_common()\n");
  });

  it("auto-imports standard libraries and respects explicit aliases", () => {
    const workspace = new Blockly.Workspace();
    const mathCall = workspace.newBlock("python_math_unary");
    mathCall.setFieldValue("sqrt", "FUNCTION");
    const argument = workspace.newBlock("math_number");
    argument.setFieldValue(9, "NUM");
    mathCall.getInput("VALUE")!.connection!.connect(argument.outputConnection!);

    expect(getPythonImportWarning(mathCall)).toBeNull();
    expect(validatePythonBlockContexts(workspace)).toEqual([]);
    expect(generateWorkspacePython(workspace)).toContain("import math\n\n\nmath.sqrt(9)");
    workspace.dispose();

    const aliasedWorkspace = new Blockly.Workspace();
    const aliasedImport = aliasedWorkspace.newBlock("python_import_as");
    aliasedImport.setFieldValue("math", "MODULE");
    aliasedImport.setFieldValue("m", "ALIAS");
    const aliasedCall = aliasedWorkspace.newBlock("python_math_unary");
    aliasedCall.setFieldValue("sqrt", "FUNCTION");
    const aliasedArgument = aliasedWorkspace.newBlock("math_number");
    aliasedArgument.setFieldValue(16, "NUM");
    aliasedCall.getInput("VALUE")!.connection!.connect(aliasedArgument.outputConnection!);
    const aliasedCode = generateWorkspacePython(aliasedWorkspace);
    expect(aliasedCode).toContain("import math as m");
    expect(aliasedCode).toContain("m.sqrt(16)");
    expect(aliasedCode.match(/import math/g)).toHaveLength(1);
    aliasedWorkspace.dispose();

    const asyncWorkspace = new Blockly.Workspace();
    const asyncImport = asyncWorkspace.newBlock("python_import_as");
    asyncImport.setFieldValue("asyncio", "MODULE");
    asyncImport.setFieldValue("aio", "ALIAS");
    const asyncRun = asyncWorkspace.newBlock("python_asyncio_run");
    const coroutine = asyncWorkspace.newBlock("python_raw_expression");
    coroutine.setFieldValue("main()", "CODE");
    asyncRun.getInput("COROUTINE")!.connection!.connect(coroutine.outputConnection!);
    const asyncCode = generateWorkspacePython(asyncWorkspace);
    expect(asyncCode).toContain("import asyncio as aio");
    expect(asyncCode).toContain("aio.run(main())");
    expect(asyncCode.match(/import asyncio/g)).toHaveLength(1);
    asyncWorkspace.dispose();
  });

  it("keeps function parameters inside the signature and removes empty separators", () => {
    const workspace = new Blockly.Workspace();
    const block = workspace.newBlock("python_function_structured") as Blockly.Block & { loadExtraState(state: object): void };
    const signatureText = () => block.inputList.filter((input) => input.name !== "BODY").flatMap((input) => input.fieldRow.map((field) => field.getText())).join(" ").replace(/\s+/g, " ");
    expect(signatureText()).toContain("自定义函数 ( 数值 )");
    block.loadExtraState({ parameters: [] });
    const emptySignature = signatureText();
    expect(emptySignature).toContain("自定义函数 ( )");
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
    expect(signature).toContain("自定义函数 ( 数值 : object ) -> None");
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
      fields: { TARGET: "collect" },
      extraState: { arguments: [{ kind: "positional", name: "" }] },
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
    expect(signatureText()).toContain("自定义函数 ( )");
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
    const randomValue = { type: "variables_set", fields: { VAR: "result" }, inputs: { VALUE: { block: { type: "python_random_randint", inputs: { A: number(1), B: number(10) } } } } };
    const randomCode = generatePython(state(randomValue));
    expect(randomCode).toContain("import random");
    expect(randomCode).toContain("result = random.randint(1, 10)");
    expect(randomCode).not.toContain("result = None");
  });

  it("generates common Python utility, collection, and file operations", () => {
    expect(generatePython(state({ type: "python_range", inputs: { START: number(1), STOP: number(8), STEP: number(2) } }))).toBe("range(1, 8, 2)\n");
    expect(generatePython(state({ type: "python_length", inputs: { VALUE: expression("items") } }))).toBe("len(items)\n");
    expect(generatePython(state({ type: "python_convert", fields: { TYPE: "int" }, inputs: { VALUE: text("42") } }))).toBe("int('42')\n");
    expect(generatePython(state({ type: "python_string_method", fields: { METHOD: "upper" }, inputs: { TEXT: text("python") } }))).toBe("'python'.upper()\n");
    expect(generatePython(state({ type: "python_text_replace", inputs: { TEXT: text("你好，世界"), OLD: text("世界"), NEW: text("Python") } }))).toBe("'你好，世界'.replace('世界', 'Python')\n");
    expect(generatePython(state({ type: "python_list_method", fields: { METHOD: "append" }, inputs: { LIST: expression("items"), ARG: number(3) } }))).toBe("items.append(3)\n");
    expect(generatePython(state({ type: "python_list_insert", inputs: { LIST: expression("items"), INDEX: number(1), VALUE: text("new") } }))).toBe("items.insert(1, 'new')\n");
    expect(generatePython(state({ type: "python_list_set", inputs: { LIST: expression("items"), INDEX: number(0), VALUE: number(10) } }))).toBe("items[0] = 10\n");
    expect(generatePython(state({ type: "python_list_slice_set", inputs: { LIST: expression("items"), START: number(1), STOP: number(3), VALUES: expression("replacement") } }))).toBe("items[1:3:] = replacement\n");
    expect(generatePython(state({ type: "python_list_slice_delete", inputs: { LIST: expression("items"), START: number(1), STOP: number(3) } }))).toBe("del items[1:3:]\n");
    expect(generatePython(state({ type: "python_sequence_query", fields: { METHOD: "count" }, inputs: { SEQUENCE: expression("items"), VALUE: number(2) } }))).toBe("items.count(2)\n");
    expect(generatePython(state({ type: "python_sequence_query", fields: { METHOD: "index" }, inputs: { SEQUENCE: expression("items"), VALUE: number(2) } }))).toBe("items.index(2)\n");
    expect(generatePython(state({ type: "python_sequence_combine", fields: { OPERATION: "concat" }, inputs: { SEQUENCE: expression("items"), OTHER: expression("more") } }))).toBe("items + more\n");
    expect(generatePython(state({ type: "python_sequence_combine", fields: { OPERATION: "repeat" }, inputs: { SEQUENCE: expression("items"), OTHER: number(3) } }))).toBe("items * 3\n");
    expect(generatePython(state({ type: "python_list_copy", inputs: { LIST: expression("items") } }))).toBe("items.copy()\n");
    expect(generatePython(state({ type: "python_set_operation", fields: { OPERATION: "intersection" }, inputs: { LEFT: expression("left"), RIGHT: expression("right") } }))).toBe("left.intersection(right)\n");
    expect(generatePython(state({ type: "python_set_relation", fields: { RELATION: "proper_subset" }, inputs: { LEFT: expression("left"), RIGHT: expression("right") } }))).toBe("left < right\n");
    expect(generatePython(state({ type: "python_set_method", fields: { METHOD: "discard" }, inputs: { SET: expression("items"), ARG: number(2) } }))).toBe("items.discard(2)\n");
    expect(generatePython(state({ type: "python_set_method", fields: { METHOD: "clear" }, inputs: { SET: expression("items") } }))).toBe("items.clear()\n");
    expect(generatePython(state({ type: "python_set_copy", inputs: { SET: expression("items") } }))).toBe("items.copy()\n");
    expect(generatePython(state({ type: "python_dict_get", inputs: { DICT: expression("data"), KEY: text("name") } }))).toBe("data.get('name')\n");
    expect(generatePython(state({ type: "python_dict_set", inputs: { DICT: expression("data"), KEY: text("name"), VALUE: text("Ada") } }))).toBe("data['name'] = 'Ada'\n");
    expect(generatePython(state({ type: "python_dict_remove", inputs: { DICT: expression("data"), KEY: text("name") } }))).toBe("data.pop('name', None)\n");
    expect(generatePython(state({ type: "python_dict_view", fields: { METHOD: "keys" }, inputs: { DICT: expression("data") } }))).toBe("data.keys()\n");
    expect(generatePython(state({ type: "python_dict_method", fields: { METHOD: "update" }, inputs: { DICT: expression("data"), OTHER: expression("defaults") } }))).toBe("data.update(defaults)\n");
    expect(generatePython(state({ type: "python_dict_method", fields: { METHOD: "clear" }, inputs: { DICT: expression("data") } }))).toBe("data.clear()\n");
    expect(generatePython(state({ type: "python_dict_query", fields: { METHOD: "setdefault" }, inputs: { DICT: expression("data"), KEY: text("name"), DEFAULT: text("Ada") } }))).toBe("data.setdefault('name', 'Ada')\n");
    expect(generatePython(state({ type: "python_dict_query", fields: { METHOD: "popitem" }, inputs: { DICT: expression("data") } }))).toBe("data.popitem()\n");
    expect(generatePython(state({ type: "python_dict_fromkeys", inputs: { KEYS: expression("names"), VALUE: text("未填写") } }))).toBe("dict.fromkeys(names, '未填写')\n");
    expect(generatePython(state({ type: "python_open_file", fields: { MODE: "w", ENCODING: "utf-8" }, inputs: { PATH: text("out.txt") } }))).toBe("open('out.txt', \"w\", encoding=\"utf-8\")\n");
    expect(generatePython(state({ type: "python_file_read", inputs: { FILE: expression("handle") } }))).toBe("handle.read()\n");
    expect(generatePython(state({ type: "python_file_write", inputs: { FILE: expression("handle"), VALUE: text("done") } }))).toBe("handle.write('done')\n");
  });

  it("generates complete beginner-friendly file operations", () => {
    expect(generatePython(state({ type: "python_file_read_text", fields: { ENCODING: "utf-8" }, inputs: { PATH: text("data.txt") } })))
      .toBe(withImport("pathlib", "pathlib.Path('data.txt').read_text(encoding=\"utf-8\")\n"));
    expect(generatePython(state({ type: "python_file_write_text", fields: { MODE: "a", ENCODING: "utf-8" }, inputs: { PATH: text("out.txt"), VALUE: text("追加") } })))
      .toBe("with open('out.txt', \"a\", encoding=\"utf-8\") as 文件:\n  文件.write('追加')\n");
    expect(generatePython(state({ type: "python_file_read", fields: { METHOD: "readline" }, inputs: { FILE: expression("文件"), SIZE: number(20) } }))).toBe("文件.readline(20)\n");
    expect(generatePython(state({ type: "python_file_write", fields: { METHOD: "writelines" }, inputs: { FILE: expression("文件"), VALUE: expression("文本行") } }))).toBe("文件.writelines(文本行)\n");
    expect(generatePython(state({ type: "python_file_tell", inputs: { FILE: expression("文件") } }))).toBe("文件.tell()\n");
    expect(generatePython(state({ type: "python_file_seek", fields: { WHENCE: "2" }, inputs: { FILE: expression("文件"), OFFSET: number(0) } }))).toBe("文件.seek(0, 2)\n");
    expect(generatePython(state({ type: "python_file_control", fields: { ACTION: "close" }, inputs: { FILE: expression("文件") } }))).toBe("文件.close()\n");
    expect(generatePython(state({ type: "python_file_exists", inputs: { PATH: text("data.txt") } }))).toBe(withImport("pathlib", "pathlib.Path('data.txt').is_file()\n"));
    expect(generatePython(state({ type: "python_directory_exists", inputs: { PATH: text("data") } }))).toBe(withImport("pathlib", "pathlib.Path('data').is_dir()\n"));
    expect(generatePython(state({ type: "python_path_info", fields: { PATH_KIND: "file", INFO: "suffix" }, inputs: { PATH: text("data.txt") } }))).toBe(withImport("pathlib", "pathlib.Path('data.txt').suffix\n"));
    expect(generatePython(state({ type: "python_file_copy", inputs: { SOURCE: text("a.txt"), TARGET: text("b.txt") } }))).toBe(withImport("shutil", "shutil.copy2('a.txt', 'b.txt')\n"));
    expect(generatePython(state({ type: "python_file_move", fields: { PATH_KIND: "file" }, inputs: { SOURCE: text("a.txt"), TARGET: text("b.txt") } }))).toBe(withImport("shutil", "shutil.move('a.txt', 'b.txt')\n"));
    expect(generatePython(state({ type: "python_file_delete", fields: { MISSING_OK: "True" }, inputs: { PATH: text("data.txt") } }))).toBe(withImport("pathlib", "pathlib.Path('data.txt').unlink(missing_ok=True)\n"));
    expect(generatePython(state({ type: "python_directory_find", fields: { SCOPE: "recursive" }, inputs: { PATH: text("data"), PATTERN: text("*.txt") } }))).toBe(withImport("pathlib", "[str(匹配路径) for 匹配路径 in pathlib.Path('data').rglob('*.txt')]\n"));
    expect(generatePython(state({ type: "python_directory_copy", fields: { EXIST_OK: "True" }, inputs: { SOURCE: text("源目录"), TARGET: text("目标目录") } }))).toBe(withImport("shutil", "shutil.copytree('源目录', '目标目录', dirs_exist_ok=True)\n"));
    expect(generatePython(state({ type: "python_directory_copy", fields: { DIRECTORY_NAME: "副本", EXIST_OK: "True" }, inputs: { SOURCE: text("源目录"), TARGET: text("目标父目录") } }))).toBe("import os\nimport shutil\n\n\nshutil.copytree('源目录', os.path.join('目标父目录', \"副本\"), dirs_exist_ok=True)\n");
    expect(generatePython(state({ type: "python_directory_move", fields: { DIRECTORY_NAME: "新名称" }, inputs: { SOURCE: text("源目录"), TARGET: text("目标父目录") } }))).toBe("import os\nimport shutil\n\n\nshutil.move('源目录', os.path.join('目标父目录', \"新名称\"))\n");
    expect(generatePython(state({ type: "python_directory_remove", inputs: { PATH: text("空目录") } }))).toBe(withImport("pathlib", "pathlib.Path('空目录').rmdir()\n"));
    expect(generatePython(state({ type: "python_directory_remove", fields: { REMOVE_MODE: "tree" }, inputs: { PATH: text("目录") } }))).toBe(withImport("shutil", "shutil.rmtree('目录')\n"));
  });

  it("shows method parameters only when the selected operation needs them", () => {
    const workspace = new Blockly.Workspace();
    const textMethod = workspace.newBlock("python_string_method");
    expect(textMethod.getInput("ARG")!.isVisible()).toBe(false);
    textMethod.setFieldValue("split", "METHOD");
    expect(textMethod.getInput("ARG")!.isVisible()).toBe(true);

    const listMethod = workspace.newBlock("python_list_method");
    expect(listMethod.getInput("ARG")!.isVisible()).toBe(true);
    listMethod.setFieldValue("sort", "METHOD");
    expect(listMethod.getInput("ARG")!.isVisible()).toBe(false);

    const setMethod = workspace.newBlock("python_set_method");
    expect(setMethod.getInput("ARG")!.isVisible()).toBe(true);
    setMethod.setFieldValue("clear", "METHOD");
    expect(setMethod.getInput("ARG")!.isVisible()).toBe(false);

    const dictMethod = workspace.newBlock("python_dict_method");
    expect(dictMethod.getInput("OTHER")!.isVisible()).toBe(true);
    dictMethod.setFieldValue("clear", "METHOD");
    expect(dictMethod.getInput("OTHER")!.isVisible()).toBe(false);

    const dictQuery = workspace.newBlock("python_dict_query");
    expect(dictQuery.getInput("KEY")!.isVisible()).toBe(false);
    dictQuery.setFieldValue("pop", "METHOD");
    expect(dictQuery.getInput("KEY")!.isVisible()).toBe(true);
    workspace.dispose();
  });

  it("uses compatible connection types for container-specific operations", () => {
    const workspace = new Blockly.Workspace();
    expect(workspace.newBlock("python_list_collection").outputConnection?.getCheck()).toEqual(["Array", "ManimPointArguments"]);
    expect(workspace.newBlock("python_tuple").outputConnection?.getCheck()).toEqual(["PythonTuple"]);
    expect(workspace.newBlock("python_set").outputConnection?.getCheck()).toEqual(["PythonSet"]);
    expect(workspace.newBlock("python_dynamic_dict").outputConnection?.getCheck()).toEqual(["PythonDict"]);
    expect(workspace.newBlock("python_list_method").getInput("LIST")?.connection?.getCheck()).toEqual(["Array"]);
    expect(workspace.newBlock("python_set_method").getInput("SET")?.connection?.getCheck()).toEqual(["PythonSet"]);
    expect(workspace.newBlock("python_dict_get").getInput("DICT")?.connection?.getCheck()).toEqual(["PythonDict"]);
    expect(workspace.newBlock("python_list_comprehension").outputConnection?.getCheck()).toEqual(["Array"]);
    expect(workspace.newBlock("python_set_comprehension").outputConnection?.getCheck()).toEqual(["PythonSet"]);
    expect(workspace.newBlock("python_dict_comprehension").outputConnection?.getCheck()).toEqual(["PythonDict"]);
    expect(workspace.newBlock("python_sequence_combine").outputConnection?.getCheck()).toEqual(["Array", "PythonTuple"]);
    expect(workspace.newBlock("python_builtin_sorted").outputConnection?.getCheck()).toEqual(["Array"]);
    expect(workspace.newBlock("python_random_sample").outputConnection?.getCheck()).toEqual(["Array"]);
    expect(workspace.newBlock("python_os_listdir").outputConnection?.getCheck()).toEqual(["Array"]);
    const stringMethod = workspace.newBlock("python_string_method");
    expect(stringMethod.outputConnection?.getCheck()).toEqual(["String"]);
    stringMethod.setFieldValue("split", "METHOD");
    expect(stringMethod.outputConnection?.getCheck()).toEqual(["Array"]);
    workspace.dispose();
  });

  it("warns when a dynamic container has the wrong semantic type", () => {
    const workspace = new Blockly.Workspace();
    const listMethod = workspace.newBlock("python_list_method");
    listMethod.setFieldValue("clear", "METHOD");
    const dynamicSet = workspace.newBlock("python_sequence_collection");
    dynamicSet.setFieldValue("set", "KIND");
    listMethod.getInput("LIST")!.connection!.connect(dynamicSet.outputConnection!);
    expect(getPythonCollectionTypeWarning(listMethod)).toBe("列表操作需要列表，当前连接的是集合。");
    expect(validatePythonBlockContexts(workspace)).toEqual(expect.arrayContaining([{ blockId: listMethod.id, message: "列表操作需要列表，当前连接的是集合。" }]));

    dynamicSet.setFieldValue("list", "KIND");
    expect(getPythonCollectionTypeWarning(listMethod)).toBeNull();

    const combine = workspace.newBlock("python_sequence_combine");
    const list = workspace.newBlock("python_sequence_collection");
    const tuple = workspace.newBlock("python_sequence_collection");
    tuple.setFieldValue("tuple", "KIND");
    combine.getInput("SEQUENCE")!.connection!.connect(list.outputConnection!);
    combine.getInput("OTHER")!.connection!.connect(tuple.outputConnection!);
    expect(getPythonCollectionTypeWarning(combine)).toBe("拼接两侧必须是同一种序列，当前是列表和元组。");

    combine.setFieldValue("repeat", "OPERATION");
    expect(getPythonCollectionTypeWarning(combine)).toBe("重复次数需要数字，当前连接的是元组。");
    workspace.dispose();
  });

  it("infers list results through variables and assignment expressions", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [
      {
        type: "variables_set",
        fields: { VAR: { id: "parts-variable", name: "parts" } },
        inputs: { VALUE: { block: { type: "python_string_method", fields: { METHOD: "split" }, inputs: { TEXT: text("a,b"), ARG: text(",") } } } },
      },
      {
        id: "parts-list-use",
        type: "python_list_method",
        fields: { METHOD: "clear" },
        inputs: { LIST: { block: { type: "variables_get", fields: { VAR: { id: "parts-variable", name: "parts" } } } } },
      },
      {
        type: "python_walrus",
        fields: { VAR: { id: "sample-variable", name: "sample" } },
        inputs: { VALUE: { block: { type: "python_random_sample", inputs: { POPULATION: { block: { type: "python_list_collection", extraState: { itemCount: 0 } } }, K: number(0) } } } },
      },
      {
        id: "sample-set-use",
        type: "python_set_method",
        fields: { METHOD: "clear" },
        inputs: { SET: { block: { type: "variables_get", fields: { VAR: { id: "sample-variable", name: "sample" } } } } },
      },
    ] } }, workspace);

    const listUse = workspace.getBlockById("parts-list-use")!;
    const setUse = workspace.getBlockById("sample-set-use")!;
    expect(getPythonCollectionTypeWarning(listUse)).toBeNull();
    expect(getPythonCollectionTypeWarning(setUse)).not.toBeNull();
    expect(validatePythonBlockContexts(workspace)).toEqual(expect.arrayContaining([expect.objectContaining({ blockId: setUse.id })]));
    workspace.dispose();
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
    const manyUnpack = {
      type: "python_unpack_many_target", extraState: { itemCount: 4 },
      inputs: {
        TARGET0: { block: { type: "python_variable_target", fields: { VAR: "first" } } },
        TARGET1: { block: { type: "python_variable_target", fields: { VAR: "second" } } },
        TARGET2: { block: { type: "python_starred_target", inputs: { TARGET: { block: { type: "python_variable_target", fields: { VAR: "middle" } } } } } },
        TARGET3: { block: { type: "python_variable_target", fields: { VAR: "last" } } },
      },
    };
    expect(generatePython(state({ type: "python_assign_target", inputs: { TARGET: { block: manyUnpack }, VALUE: expression("items") } }))).toBe("(first, second, *middle, last) = items\n");
    const sliceTarget = { type: "python_slice_target", inputs: { OBJECT: expression("items"), START: number(1), STOP: number(4), STEP: number(2) } };
    expect(generatePython(state({ type: "python_assign_target", inputs: { TARGET: { block: sliceTarget }, VALUE: expression("replacement") } }))).toBe("items[1:4:2] = replacement\n");
    expect(generatePython(state({ type: "python_delete", inputs: { TARGET: { block: sliceTarget } } }))).toBe("del items[1:4:2]\n");
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
      fields: { TARGET: "convert", ARG_NAME1: "limit" },
      extraState: { arguments: [{ kind: "positional", name: "" }, { kind: "keyword", name: "limit" }] },
    });
    workspace.dispose();
  });

  it("creates constructor blocks from classes defined in the workspace", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [
      {
        type: "python_class_def", fields: { NAME: "Person", BASES: "object" }, inputs: { BODY: { block: {
          type: "python_method_structured", fields: { NAME: "__init__", PARAM_NAME0: "self", PARAM_NAME1: "name", PARAM_NAME2: "count" },
          extraState: { parameters: [{ kind: "positional", name: "self" }, { kind: "positional", name: "name" }, { kind: "default", name: "count" }] },
          inputs: { PARAM2: number(1), BODY: { block: { type: "python_pass" } } },
        } } },
      },
      {
        type: "python_class_def", fields: { NAME: "LegacyItem", BASES: "object" }, inputs: { BODY: { block: {
          type: "python_method_def", fields: { NAME: "__init__", PARAMS: "self, title, count=1" }, inputs: { BODY: { block: { type: "python_pass" } } },
        } } },
      },
    ] } }, workspace);

    const objectToolbox = buildDefinedClassConstructorToolbox(workspace) as Array<Record<string, any>>;
    expect(objectToolbox.find((item) => item.fields?.TARGET === "Person")).toMatchObject({
      type: "python_new_object_structured",
      fields: { TARGET: "Person" },
      extraState: { arguments: [{ kind: "positional", name: "" }] },
    });
    expect(objectToolbox.find((item) => item.fields?.TARGET === "LegacyItem")).toMatchObject({
      type: "python_new_object_structured",
      fields: { TARGET: "LegacyItem" },
      extraState: { arguments: [{ kind: "positional", name: "" }] },
    });
    expect(objectToolbox.some((item) => item.type === "python_class_def")).toBe(true);
    for (const item of objectToolbox.filter((entry) => entry.kind === "block")) {
      const validationWorkspace = new Blockly.Workspace();
      const { kind: _kind, ...blockState } = structuredClone(item);
      expect(() => Blockly.serialization.blocks.append(blockState as any, validationWorkspace), `failed to load dynamic object toolbox state for ${item.type}`).not.toThrow();
      validationWorkspace.dispose();
    }
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

  it("loads every configured toolbox block including its default shadows", () => {
    const blockStates: any[] = [];
    const visit = (items: any[]) => items.forEach((item) => {
      if (item.kind === "block") blockStates.push(item);
      if (Array.isArray(item.contents)) visit(item.contents);
    });
    visit((toolbox as any).contents);
    for (const item of blockStates) {
      const workspace = new Blockly.Workspace();
      const { kind: _kind, ...state } = structuredClone(item);
      expect(() => Blockly.serialization.blocks.append(state, workspace), `failed to load toolbox state for ${item.type}`).not.toThrow();
      workspace.dispose();
    }
  });

  it("provides every static toolbox entry with its required root inputs", () => {
    const blockStates: any[] = [];
    const visit = (items: any[]) => items.forEach((item) => {
      if (item.kind === "block") blockStates.push(item);
      if (Array.isArray(item.contents)) visit(item.contents);
    });
    visit((toolbox as any).contents);
    for (const item of blockStates) {
      const workspace = new Blockly.Workspace();
      const { kind: _kind, ...blockState } = structuredClone(item);
      Blockly.serialization.blocks.append(blockState, workspace);
      const root = workspace.getTopBlocks(false)[0];
      expect(getPythonRequiredInputWarning(root), `toolbox entry ${item.type} is missing a required input`).toBeNull();
      workspace.dispose();
    }
  });

  it("groups standard library blocks with labels inside one toolbox category", () => {
    const standardLibrary = (toolbox as any).contents.find((item: any) => item.name === "标准库");
    expect(standardLibrary).toBeTruthy();
    expect(standardLibrary.contents.some((item: any) => item.kind === "category")).toBe(false);
    expect(standardLibrary.contents.filter((item: any) => item.kind === "label").map((item: any) => item.text)).toEqual([
      "输入输出", "数学", "随机", "JSON", "日期与时间", "系统", "正则表达式", "集合工具",
    ]);
    expect(standardLibrary.contents.some((item: any) => item.type === "python_standard_library_import")).toBe(false);
    expect(JSON.stringify(toolbox)).toContain("你好，世界");
    expect(JSON.stringify(toolbox)).toContain('"shadow"');
    expect(JSON.stringify(toolbox)).toContain("python_text_replace");
    expect(JSON.stringify(toolbox)).toContain("python_dict_set");
    expect(JSON.stringify(toolbox)).not.toContain("hello python");
    expect(JSON.stringify(starterState)).toContain("你好，Python！");
    expect(JSON.stringify(starterState)).toContain("图形化编程");
  });

  it("keeps file operations in their own toolbox category", () => {
    const categories = (toolbox as any).contents;
    const file = categories.find((item: any) => item.name === "文件");
    const exception = categories.find((item: any) => item.name === "异常");
    const module = categories.find((item: any) => item.name === "模块");
    const fileTypes = file.contents.filter((item: any) => item.kind === "block").map((item: any) => item.type);
    const categoryNames = categories.map((item: any) => item.name);

    expect(categoryNames.indexOf("文件")).toBe(categoryNames.indexOf("调用") + 1);
    expect(fileTypes).toEqual(expect.arrayContaining([
      "python_file_read_text", "python_file_write_text", "python_with", "python_open_file",
      "python_file_read", "python_file_write", "python_file_tell", "python_file_seek",
      "python_file_control", "python_file_exists", "python_directory_exists", "python_path_info", "python_file_copy", "python_file_move", "python_file_delete",
      "python_path_create", "python_path_join", "python_path_check", "python_path_read_text", "python_path_write_text",
      "python_os_getcwd", "python_os_listdir", "python_os_makedirs", "python_directory_find", "python_directory_copy", "python_directory_move", "python_directory_remove",
    ]));
    expect(JSON.stringify(exception)).not.toContain("python_file");
    expect(JSON.stringify(exception)).not.toContain("python_open_file");
    expect(JSON.stringify(module)).not.toContain("python_file");
    expect(JSON.stringify(module)).not.toContain("python_open_file");
    expect(JSON.stringify(module)).not.toContain("python_path_");
    expect(JSON.stringify(categories.find((item: any) => item.name === "标准库"))).not.toContain("python_path_");
    expect(JSON.stringify(categories.find((item: any) => item.name === "标准库"))).not.toMatch(/python_os_(getcwd|listdir|makedirs)/);
  });

  it("uses one colour for every block in the file toolbox", () => {
    const file = (toolbox as any).contents.find((item: any) => item.name === "文件");
    const types = [...new Set<string>(file.contents.filter((item: any) => item.kind === "block").map((item: any) => item.type))];
    const workspace = new Blockly.Workspace();
    expect(new Set(types.map((type) => workspace.newBlock(type).getColour()))).toEqual(new Set(["#4f7f8e"]));
    workspace.dispose();
  });

  it("uses one colour for every block in the async toolbox", () => {
    const workspace = new Blockly.Workspace();
    const asyncTypes = [
      "python_async_function_structured",
      "python_async_typed_function_structured",
      "python_asyncio_sleep",
      "python_asyncio_run",
      "python_await_statement",
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

    result = load({ type: "python_await_statement", id: "await-statement", inputs: { VALUE: expression("work()") } }, "await-statement");
    expect(result.warning).toContain("异步函数");
    result.workspace.dispose();

    result = load({ type: "python_async_function_structured", extraState: { parameters: [] }, inputs: { BODY: { block: { type: "python_await_statement", id: "await-statement", inputs: { VALUE: expression("work()") } } } } }, "await-statement");
    expect(result.warning).toBeNull();
    result.workspace.dispose();

    result = load({ type: "python_async_function_structured", extraState: { parameters: [] }, inputs: { BODY: { block: { type: "python_asyncio_run", id: "async-run", inputs: { COROUTINE: expression("work()") } } } } }, "async-run");
    expect(result.warning).toContain("等待完成");
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

    result = load({ type: "python_method_structured", id: "method", extraState: { parameters: [{ kind: "positional", name: "self" }] } }, "method");
    expect(result.warning).toBe("方法定义只能放在类的内部。");
    result.workspace.dispose();

    result = load({ type: "python_class_def", inputs: { BODY: { block: { type: "python_method_structured", id: "method", extraState: { parameters: [{ kind: "positional", name: "self" }] }, inputs: { BODY: { block: { type: "python_super_call", id: "super" } } } } } } }, "method");
    expect(result.warning).toBeNull();
    expect(getPythonContextWarning(result.workspace.getBlockById("super")!)).toBeNull();
    result.workspace.dispose();

    result = load({ type: "python_super_call", id: "super" }, "super");
    expect(result.warning).toBe("super() 只能放在类的方法内部。");
    result.workspace.dispose();

    result = load({ type: "python_decorated_definition", id: "decorator", inputs: { DECORATOR: expression("staticmethod"), DEFINITION: { block: { type: "python_print", inputs: { VALUE: text("invalid") } } } } }, "decorator");
    expect(result.warning).toContain("函数、方法或类定义");
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
    const timeSleep = workspace.newBlock("python_time_sleep");
    expect(getPythonRequiredInputWarning(timeSleep)).toBe("缺少必填输入：等待秒数。");
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

    const chineseFunction = workspace.newBlock("python_typed_function_structured") as Blockly.Block & { loadExtraState(state: object): void };
    chineseFunction.loadExtraState({ parameters: [{ kind: "positional", name: "数值", annotation: "数字类型" }] });
    chineseFunction.setFieldValue("计算结果", "NAME");
    chineseFunction.setFieldValue("数值", "PARAM_NAME0");
    chineseFunction.setFieldValue("数字类型", "PARAM_TYPE0");
    chineseFunction.setFieldValue("数字类型", "RETURN_TYPE");
    expect(getPythonIdentifierWarning(chineseFunction)).toBeNull();

    const invalidImport = workspace.newBlock("python_import_as");
    invalidImport.setFieldValue("bad module", "MODULE");
    invalidImport.setFieldValue("for", "ALIAS");
    expect(getPythonIdentifierWarning(invalidImport)).toContain("模块别名“for”");
    expect(getPythonIdentifierWarning(invalidImport)).toContain("模块名称“bad module”无效");
    workspace.dispose();
  });

  it("does not redraw unchanged block warnings during field edits", () => {
    const workspace = new Blockly.Workspace();
    const functionBlock = workspace.newBlock("python_function_structured");
    let warningUpdates = 0;
    functionBlock.setWarningText = () => { warningUpdates += 1; };

    validatePythonBlockContexts(workspace);
    validatePythonBlockContexts(workspace);
    expect(warningUpdates).toBe(0);

    functionBlock.setFieldValue("bad name", "NAME");
    validatePythonBlockContexts(workspace);
    validatePythonBlockContexts(workspace);
    expect(warningUpdates).toBe(1);

    functionBlock.setFieldValue("自定义函数", "NAME");
    validatePythonBlockContexts(workspace);
    expect(warningUpdates).toBe(2);
    workspace.dispose();
  });

});
