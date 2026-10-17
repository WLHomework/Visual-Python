import { describe, expect, it } from "vitest";
import {
  applyPluginOperations,
  parsePluginIr,
  parsePluginPlanOperations,
  pluginIrFromJsonFile,
  pluginIrFromPlan,
  pluginIrSummary,
  PluginIrError,
  serializePluginIrFile,
} from "./pluginIr";

describe("plugin IR parsing", () => {
  it("normalizes a minimal standalone plugin", () => {
    const ir = parsePluginIr({
      version: 1,
      manifest: { id: "com.example.hello", name: "Hello", description: "Hello plugin" },
      blocks: [{
        ref: "greet",
        type: "com_example_hello_greet",
        inputs: ["NAME"],
        agent: { purpose: "问候" },
        generator: { template: 'print("hi", {INPUT:NAME})' },
      }],
    });

    expect(ir.manifest).toMatchObject({ id: "com.example.hello", version: "1.0.0", kind: "standalone" });
    expect(ir.blocks[0]).toMatchObject({
      ref: "greet",
      inputs: [{ name: "NAME", kind: "value" }],
      agent: { purpose: "问候" },
    });
  });

  it("reports located issues instead of throwing raw errors", () => {
    const expectIssue = (value: unknown, patch: Record<string, unknown>) => {
      try {
        parsePluginIr(value);
        throw new Error("expected PluginIrError");
      } catch (error) {
        expect(error).toBeInstanceOf(PluginIrError);
        expect((error as PluginIrError).issue).toMatchObject(patch);
      }
    };
    const base = {
      version: 1,
      manifest: { id: "com.example.hello", name: "Hello", description: "Hello plugin" },
      blocks: [{
        ref: "greet",
        type: "com_example_hello_greet",
        inputs: ["NAME"],
        agent: { purpose: "问候" },
        generator: { template: 'print("{INPUT:NAME}")' },
      }],
    };

    expectIssue({ ...base, manifest: { ...base.manifest, kind: "extension" } }, { code: "INVALID_MANIFEST" });
    expectIssue({ ...base, blocks: [...base.blocks, { ...base.blocks[0] }] }, { code: "DUPLICATE_REF", ref: "greet" });
    expectIssue({ ...base, blocks: [{ ...base.blocks[0], type: "greet" }] }, { code: "INVALID_BLOCK" });
    expectIssue({ ...base, blocks: [{ ...base.blocks[0], generator: { template: "print({INPUT:MISSING})" } }] }, { code: "INVALID_GENERATOR", inputName: "MISSING" });
    expectIssue({ ...base, blocks: [{ ...base.blocks[0], fields: [{ name: "MODE", kind: "dropdown", options: [["A", "a"]], default: "b" }] }] }, { code: "INVALID_FIELD", fieldName: "MODE" });
    expectIssue({ ...base, blocks: [{ ...base.blocks[0], message: [{ field: "MISSING" }] }] }, { code: "INVALID_IR", fieldName: "MISSING" });
    expectIssue({ ...base, blocks: [{ ...base.blocks[0], output: "Number", generator: { template: "x\n{STMTS:NAME}" } }] }, { code: "INVALID_GENERATOR" });
    expectIssue({
      ...base,
      blocks: [{ ...base.blocks[0], generator: { template: "print(1)", imports: ["import turtle"] } }],
    }, { code: "INVALID_GENERATOR", ref: "greet" });
    expectIssue({
      ...base,
      toolbox: [{ name: "主", contents: [{ ref: "missing" }] }],
    }, { code: "INVALID_TOOLBOX", ref: "missing" });
  });
});

describe("plugin IR plan conversion", () => {
  it("converts legacy plan blocks with defaults", () => {
    const ir = pluginIrFromPlan({
      id: "com.example.shapes",
      name: "Shapes",
      description: "Basic shapes",
      blocks: [
        { type: "com_example_shapes_circle", purpose: "画圆", inputs: ["RADIUS"], output: "Number" },
        { type: "com_example_shapes_repeat", purpose: "重复", inputs: [], statementInput: "BODY" },
      ],
    });

    expect(ir.blocks[0]).toMatchObject({
      ref: "block_1",
      output: "Number",
      generator: { template: "com_example_shapes_circle({INPUT:RADIUS})" },
    });
    expect(ir.blocks[1]).toMatchObject({
      ref: "block_2",
      generator: { template: "{STMTS:BODY}" },
    });
    expect(validatePlanIr(ir)).toBeUndefined();
  });

  it("synthesizes a printable default block for an empty plan", () => {
    const ir = pluginIrFromPlan({ id: "com.example.empty", name: "Empty", description: "Empty" });

    expect(ir.blocks).toHaveLength(1);
    expect(ir.blocks[0].agent.purpose).toBe("Output text");
    expect(ir.blocks[0].generator?.template).toBe("print({INPUT:TEXT})");
  });

  it("keeps explicit generator templates and imports", () => {
    const ir = pluginIrFromPlan({
      id: "com.example.turtle",
      name: "Turtle",
      description: "Drawing",
      blocks: [{
        type: "com_example_turtle_program",
        purpose: "入口",
        inputs: [{ name: "BODY", kind: "statement" }],
        generator: { template: "{IMPORTS}\n{STMTS:BODY}", imports: ["import turtle"] },
      }],
    });

    expect(ir.blocks[0].generator).toEqual({ template: "{IMPORTS}\n{STMTS:BODY}", imports: ["import turtle"] });
    expect(validatePlanIr(ir)).toBeUndefined();
  });

  it("rejects malformed plan blocks with located issues", () => {
    expect(() => pluginIrFromPlan({
      id: "com.example.bad",
      name: "Bad",
      description: "Bad",
      blocks: [{ type: "com_example_bad_x", purpose: "x", inputs: [""] }],
    })).toThrow(PluginIrError);
  });
});

const validatePlanIr = (ir: ReturnType<typeof pluginIrFromPlan>) => {
  try {
    parsePluginIr(ir);
    return undefined;
  } catch (error) {
    return error;
  }
};

describe("plugin IR operations", () => {
  const baseIr = () => pluginIrFromPlan({
    id: "com.example.shapes",
    name: "Shapes",
    description: "Basic shapes",
    blocks: [{ type: "com_example_shapes_circle", purpose: "画圆", inputs: ["RADIUS"] }],
  });

  it("applies structural operations and keeps agent/generator merges shallow", () => {
    const ir = baseIr();
    const next = applyPluginOperations(ir, [
      {
        action: "add_block",
        block: {
          ref: "star",
          type: "com_example_shapes_star",
          inputs: [{ name: "SIZE", kind: "value" }],
          agent: { purpose: "画星" },
          generator: { template: "star({INPUT:SIZE})" },
        },
      },
      { action: "update_block", ref: "block_1", set: { colour: "#112233", agent: { keywords: ["圆", "circle"] } } },
      { action: "update_block", ref: "block_1", set: { generator: { template: "circle({INPUT:RADIUS})" } } },
      { action: "set_manifest", set: { description: "Updated" } },
      { action: "add_hook", hook: { ref: "hook-1", slot: "activate", code: "context.registerCommand({ id: \"com.example.shapes.run\", title: \"Run\", run() {} });" } },
      { action: "update_hook", ref: "hook-1", set: { code: "context.registerCommand({ id: \"com.example.shapes.stop\", title: \"Stop\", run() {} });" } },
    ]);

    expect(next.blocks).toHaveLength(2);
    expect(next.blocks[0]).toMatchObject({
      ref: "block_1",
      colour: "#112233",
      agent: { purpose: "画圆", keywords: ["圆", "circle"] },
      generator: { template: "circle({INPUT:RADIUS})" },
    });
    expect(next.manifest.description).toBe("Updated");
    expect(next.hooks?.[0].code).toContain("com.example.shapes.stop");
  });

  it("deletes blocks and hooks, and can reset the toolbox", () => {
    const withToolbox = applyPluginOperations(baseIr(), [
      { action: "set_toolbox", toolbox: [{ name: "主", contents: [{ ref: "block_1" }] }] },
      { action: "add_hook", hook: { ref: "hook-1", slot: "module", code: "const X = 1;" } },
    ]);
    expect(withToolbox.toolbox).toHaveLength(1);

    const next = applyPluginOperations(withToolbox, [
      { action: "set_toolbox", toolbox: null },
      { action: "delete_hook", ref: "hook-1" },
    ]);
    expect(next.toolbox).toBeUndefined();
    expect(next.hooks).toBeUndefined();
  });

  it("leaves the IR unchanged when an operation fails and localizes the failure", () => {
    const ir = baseIr();
    const snapshot = structuredClone(ir);

    try {
      applyPluginOperations(ir, [{ action: "update_block", ref: "missing", set: { colour: "#000000" } }]);
      throw new Error("expected PluginIrError");
    } catch (error) {
      expect(error).toBeInstanceOf(PluginIrError);
      expect((error as PluginIrError).issue).toMatchObject({ code: "UNKNOWN_REF", ref: "missing", operationIndex: 0 });
    }
    expect(ir).toEqual(snapshot);
  });

  it("parses raw operation payloads with operation indexes", () => {
    const operations = parsePluginPlanOperations({
      version: 1,
      operations: [
        { action: "update_block", ref: "block_1", set: { colour: "#123456" } },
      ],
    });
    expect(operations).toHaveLength(1);

    try {
      parsePluginPlanOperations({ version: 1, operations: [{ action: "explode" }] });
      throw new Error("expected PluginIrError");
    } catch (error) {
      expect((error as PluginIrError).issue).toMatchObject({ code: "INVALID_OPERATION", operationIndex: 0 });
    }
    expect(() => parsePluginPlanOperations({ operations: [] })).toThrow(PluginIrError);
  });
});

describe("plugin IR serialization and summaries", () => {
  it("round-trips through the .ai-ir.json payload", () => {
    const ir = pluginIrFromPlan({
      id: "com.example.round",
      name: "Round",
      description: "Round trip",
      blocks: [{ type: "com_example_round_print", purpose: "输出", inputs: ["TEXT"] }],
    });
    const restored = pluginIrFromJsonFile(serializePluginIrFile(ir));

    expect(restored).toEqual(ir);
  });

  it("truncates long block lists in summaries", () => {
    const ir = pluginIrFromPlan({
      id: "com.example.many",
      name: "Many",
      description: "Many blocks",
      blocks: [1, 2, 3].map((index) => ({ type: `com_example_many_block_${index}`, purpose: `块 ${index}`, inputs: ["A"] })),
    });

    const summary = pluginIrSummary(ir, { maxBlocks: 2 });
    expect(summary.blocks).toHaveLength(2);
    expect(summary.blocksTruncated).toBe(true);
    expect(summary.toolbox.length).toBe(0);
  });
});
