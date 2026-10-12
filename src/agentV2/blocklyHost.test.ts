import { describe, expect, it, vi } from "vitest";
import * as Blockly from "blockly/core";
import { generateWorkspacePython } from "../pythonBlocks";
import { blocklyAgentTools, chainSerializedBlocks, createBlocklyToolExecutor, describeBlocklyBlockInputs, normalizeBlocklyWorkspaceState, visualBlockPolicyError, type BlocklyAgentServices } from "./blocklyHost";

function services(workspace: Blockly.Workspace): BlocklyAgentServices {
  return {
    workspace,
    selectedBlockId: () => null,
    searchBlocks: vi.fn(() => []),
    getBlockTemplates: vi.fn(() => []),
    generateCode: generateWorkspacePython,
    validateContexts: () => [],
    validateCode: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn((state) => Blockly.serialization.workspaces.load(state, workspace)),
  };
}

describe("Blockly Agent host", () => {
  it("exposes one compact tool set for workspace reads and transactions", () => {
    expect(blocklyAgentTools.map((tool) => tool.definition.function.name)).toEqual([
      "get_workspace",
      "search_blocks",
      "get_block_templates",
      "import_python_workspace",
      "append_workspace_blocks",
      "replace_workspace",
      "add_workspace_block",
      "apply_workspace",
    ]);
    expect(blocklyAgentTools.every((tool) => tool.workspaceModes?.includes("visual") && tool.workspaceModes?.includes("split"))).toBe(true);
  });

  it("chains a batch of statement blocks", () => {
    const chained = chainSerializedBlocks([
      { type: "python_print", inputs: { VALUE: { block: { type: "text", fields: { TEXT: "a" } } } } },
      { type: "python_print", inputs: { VALUE: { block: { type: "text", fields: { TEXT: "b" } } } } },
    ]) as { next?: { block?: { type?: string } } };
    expect(chained.next?.block?.type).toBe("python_print");
  });

  it("appends a batch of statements onto a scene body", async () => {
    if (!Blockly.Blocks.visual_python_manim_scene) {
      Blockly.common.defineBlocksWithJsonArray([{
        type: "visual_python_manim_scene",
        message0: "scene %1 %2",
        args0: [
          { type: "field_input", name: "NAME", text: "MainScene" },
          { type: "input_statement", name: "BODY" },
        ],
      }]);
    }
    const workspace = new Blockly.Workspace();
    const scene = workspace.newBlock("visual_python_manim_scene");
    scene.setFieldValue("Demo", "NAME");
    const host = services(workspace);
    host.generateCode = vi.fn(() => "print('a')\nprint('b')\n");
    const execute = createBlocklyToolExecutor(host);
    await execute("append_workspace_blocks", {
      blocks: [
        { type: "python_print", inputs: { VALUE: { block: { type: "text", fields: { TEXT: "a" } } } } },
        { type: "python_print", inputs: { VALUE: { block: { type: "text", fields: { TEXT: "b" } } } } },
      ],
    }, new AbortController().signal);
    const body = workspace.getTopBlocks(false)[0]?.getInputTargetBlock("BODY");
    expect(body?.type).toBe("python_print");
    expect(body?.getNextBlock()?.type).toBe("python_print");
    workspace.dispose();
  });

  it("reads a compact workspace summary and an optional full state", async () => {
    const workspace = new Blockly.Workspace();
    workspace.newBlock("math_number").setFieldValue(2, "NUM");
    const execute = createBlocklyToolExecutor(services(workspace));

    await expect(execute("get_workspace", {}, new AbortController().signal)).resolves.toMatchObject({ blockCount: 1 });
    const detailed = await execute("get_workspace", { includeState: true }, new AbortController().signal);
    expect(detailed.workspace).toMatchObject({ blocks: { languageVersion: 0 } });
    workspace.dispose();
  });

  it("validates a replacement in isolation before committing it", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    const execute = createBlocklyToolExecutor(host);
    const result = await execute("apply_workspace", {
      mode: "replace",
      blocks: [{ type: "python_print", inputs: { VALUE: { block: { type: "text", fields: { TEXT: "hello" } } } } }],
    }, new AbortController().signal);

    expect(result).toMatchObject({ changed: true, blockCount: 2 });
    expect(host.validateCode).toHaveBeenCalledWith(expect.stringContaining("print('hello')"));
    expect(host.commit).toHaveBeenCalledTimes(1);
    workspace.dispose();
  });

  it("replaces the whole workspace in one replace_workspace call", async () => {
    const workspace = new Blockly.Workspace();
    workspace.newBlock("math_number").setFieldValue(1, "NUM");
    const host = services(workspace);
    const execute = createBlocklyToolExecutor(host);
    const tree = {
      type: "python_print",
      inputs: { VALUE: { block: { type: "text", fields: { TEXT: "once" } } } },
      next: { block: { type: "python_print", inputs: { VALUE: { block: { type: "text", fields: { TEXT: "twice" } } } } } },
    };

    const result = await execute("replace_workspace", { workspaceJson: JSON.stringify(tree) }, new AbortController().signal);
    expect(result).toMatchObject({ ok: true, changed: true, blockCount: 4 });
    expect(host.validateCode).toHaveBeenCalledWith(expect.stringContaining("print('once')"));
    expect(host.validateCode).toHaveBeenCalledWith(expect.stringContaining("print('twice')"));
    expect(host.commit).toHaveBeenCalledTimes(1);
    workspace.dispose();
  });

  it("rejects raw Python expression blocks in a workspace replacement", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    const execute = createBlocklyToolExecutor(host);
    await expect(execute("replace_workspace", {
      blocks: [{ type: "python_raw_statement", fields: { CODE: "title = Text('Visual Python')" } }],
    }, new AbortController().signal)).rejects.toThrow("几乎全是表达式积木");
    expect(host.commit).not.toHaveBeenCalled();
    workspace.dispose();
  });

  it("flags raw expression blocks in a live workspace", () => {
    const workspace = new Blockly.Workspace();
    try {
      const block = workspace.newBlock("python_raw_expression");
      block.setFieldValue("Text('Hello')", "CODE");
      expect(visualBlockPolicyError(workspace)).toContain("几乎全是表达式积木");
    } finally {
      workspace.dispose();
    }
  });

  it("allows leftover raw statements when dedicated blocks already exist", () => {
    const workspace = new Blockly.Workspace();
    try {
      workspace.newBlock("python_print");
      workspace.newBlock("python_raw_statement").setFieldValue("helper()", "CODE");
      expect(visualBlockPolicyError(workspace)).toBeNull();
    } finally {
      workspace.dispose();
    }
  });

  it("accepts a full Blockly workspace object", () => {
    expect(normalizeBlocklyWorkspaceState({
      blocks: { languageVersion: 0, blocks: [{ type: "text", fields: { TEXT: "a" } }] },
    })).toMatchObject({ blocks: { blocks: [{ type: "text" }] } });
  });

  it("does not commit when generated code validation fails", async () => {
    const workspace = new Blockly.Workspace();
    const original = workspace.newBlock("math_number");
    const host = services(workspace);
    host.generateCode = vi.fn(() => "");
    host.validateCode = vi.fn().mockRejectedValue(new Error("invalid Python"));
    const execute = createBlocklyToolExecutor(host);

    await expect(execute("apply_workspace", { mode: "replace", blocks: [{ type: "text" }] }, new AbortController().signal)).rejects.toThrow("invalid Python");
    expect(host.commit).not.toHaveBeenCalled();
    expect(workspace.getBlockById(original.id)).toBeTruthy();
    workspace.dispose();
  });

  it("updates fields and deletes blocks transactionally", async () => {
    const workspace = new Blockly.Workspace();
    const number = workspace.newBlock("math_number");
    number.setFieldValue(1, "NUM");
    const text = workspace.newBlock("text");
    const host = services(workspace);
    const execute = createBlocklyToolExecutor(host);

    await execute("apply_workspace", {
      mode: "patch",
      fieldUpdates: [{ blockId: number.id, fields: { NUM: 8 } }],
      deleteBlockIds: [text.id],
    }, new AbortController().signal);

    expect(workspace.getBlockById(number.id)?.getFieldValue("NUM")).toBe(8);
    expect(workspace.getBlockById(text.id)).toBeNull();
    workspace.dispose();
  });

  it("exposes the real Blockly input slots to the agent", () => {
    if (!Blockly.Blocks.visual_python_turtle_program) {
      Blockly.common.defineBlocksWithJsonArray([{
        type: "visual_python_turtle_program",
        message0: "海龟绘图程序 %1",
        args0: [{ type: "input_statement", name: "BODY" }],
      }]);
    }
    expect(describeBlocklyBlockInputs("visual_python_turtle_program")).toEqual([
      { name: "BODY", kind: "statement" },
    ]);
  });

  it("turns a Turtle entry connection error into an actionable correction", async () => {
    if (!Blockly.Blocks.visual_python_turtle_program) {
      Blockly.common.defineBlocksWithJsonArray([{
        type: "visual_python_turtle_program",
        message0: "海龟绘图程序 %1",
        args0: [{ type: "input_statement", name: "BODY" }],
      }]);
    }
    const workspace = new Blockly.Workspace();
    const execute = createBlocklyToolExecutor(services(workspace));

    await expect(execute("apply_workspace", {
      mode: "replace",
      blocks: [{ type: "visual_python_turtle_program", inputs: { DO: { block: { type: "text", fields: { TEXT: "错误连接" } } } } }],
    }, new AbortController().signal)).rejects.toThrow("入口没有 DO 输入");
    workspace.dispose();
  });

  it("creates one top-level block and returns its real id", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    const execute = createBlocklyToolExecutor(host);

    const result = await execute("add_workspace_block", {
      block: { type: "math_number", fields: { NUM: 2 } },
    }, new AbortController().signal);

    expect(result).toMatchObject({ ok: true, changed: true, block: { type: "math_number", parentId: null } });
    expect(typeof (result.block as { id: string }).id).toBe("string");
    expect(workspace.getAllBlocks(false)).toHaveLength(1);
    expect(host.commit).toHaveBeenCalledTimes(1);
    workspace.dispose();
  });

  it("connects one new statement block to the requested input", async () => {
    if (!Blockly.Blocks.visual_python_turtle_program) {
      Blockly.common.defineBlocksWithJsonArray([{
        type: "visual_python_turtle_program",
        message0: "Turtle program %1",
        args0: [{ type: "input_statement", name: "BODY" }],
      }]);
    }
    if (!Blockly.Blocks.visual_python_turtle_forward) {
      Blockly.common.defineBlocksWithJsonArray([{
        type: "visual_python_turtle_forward",
        message0: "forward %1",
        args0: [{ type: "input_value", name: "DISTANCE", check: "Number" }],
        previousStatement: null,
        nextStatement: null,
      }]);
    }
    const workspace = new Blockly.Workspace();
    const entry = workspace.newBlock("visual_python_turtle_program");
    const host = services(workspace);
    host.generateCode = vi.fn(() => "");
    const execute = createBlocklyToolExecutor(host);

    const result = await execute("add_workspace_block", {
      block: { type: "visual_python_turtle_forward" },
      parentBlockId: entry.id,
      inputName: "BODY",
    }, new AbortController().signal);

    const inserted = result.block as { id: string; parentId: string | null };
    expect(inserted.parentId).toBe(entry.id);
    expect(workspace.getBlockById(entry.id)?.getInput("BODY")?.connection?.targetBlock()?.id).toBe(inserted.id);
    workspace.dispose();
  });

  it("connects a value block without rebuilding the surrounding workspace", async () => {
    const workspace = new Blockly.Workspace();
    const print = workspace.newBlock("python_print");
    const host = services(workspace);
    host.generateCode = vi.fn(() => "");
    const execute = createBlocklyToolExecutor(host);

    const result = await execute("add_workspace_block", {
      block: { type: "text", fields: { TEXT: "hello" } },
      parentBlockId: print.id,
      inputName: "VALUE",
    }, new AbortController().signal);

    const inserted = result.block as { id: string };
    expect(workspace.getBlockById(print.id)?.getInput("VALUE")?.connection?.targetBlock()?.id).toBe(inserted.id);
    expect(workspace.getTopBlocks(true)).toHaveLength(1);
    workspace.dispose();
  });

  it("appends one statement block after an existing statement", async () => {
    if (!Blockly.Blocks.visual_python_turtle_forward) {
      Blockly.common.defineBlocksWithJsonArray([{
        type: "visual_python_turtle_forward",
        message0: "forward",
        previousStatement: null,
        nextStatement: null,
      }]);
    }
    const workspace = new Blockly.Workspace();
    const first = workspace.newBlock("visual_python_turtle_forward");
    const host = services(workspace);
    host.generateCode = vi.fn(() => "");
    const execute = createBlocklyToolExecutor(host);

    const result = await execute("add_workspace_block", {
      block: { type: "visual_python_turtle_forward" },
      afterBlockId: first.id,
    }, new AbortController().signal);

    const inserted = result.block as { id: string; parentId: string | null };
    expect(workspace.getBlockById(first.id)?.getNextBlock()?.id).toBe(inserted.id);
    expect(inserted.parentId).toBe(first.id);
    workspace.dispose();
  });

  it("rejects an unknown input slot and an occupied input slot", async () => {
    const workspace = new Blockly.Workspace();
    const print = workspace.newBlock("python_print");
    const host = services(workspace);
    const execute = createBlocklyToolExecutor(host);

    await expect(execute("add_workspace_block", {
      block: { type: "text", fields: { TEXT: "bad" } },
      parentBlockId: print.id,
      inputName: "DO",
    }, new AbortController().signal)).rejects.toThrow("没有 DO 输入槽");

    const first = await execute("add_workspace_block", {
      block: { type: "text", fields: { TEXT: "first" } },
      parentBlockId: print.id,
      inputName: "VALUE",
    }, new AbortController().signal);
    await expect(execute("add_workspace_block", {
      block: { type: "text", fields: { TEXT: "second" } },
      parentBlockId: print.id,
      inputName: "VALUE",
    }, new AbortController().signal)).rejects.toThrow("已经连接");
    expect((first.block as { id: string }).id).toBeTruthy();
    workspace.dispose();
  });
});
