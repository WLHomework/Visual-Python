import { describe, expect, it, vi } from "vitest";
import * as Blockly from "blockly/core";
import { blocklyAgentTools, createBlocklyToolExecutor, describeBlocklyBlockContract, type BlocklyAgentServices } from "./blocklyHost";

function ensurePlanFixtures() {
  if (!Blockly.Blocks.agent_host_scene) {
    Blockly.common.defineBlocksWithJsonArray([{
      type: "agent_host_scene",
      message0: "scene %1 %2",
      args0: [{ type: "field_input", name: "NAME", text: "MainScene" }, { type: "input_statement", name: "BODY" }],
    }, {
      type: "agent_host_statement",
      message0: "step %1",
      args0: [{ type: "input_value", name: "VALUE", check: "Number" }],
      previousStatement: null,
      nextStatement: null,
    }, {
      type: "agent_host_value",
      message0: "value %1",
      args0: [{ type: "field_input", name: "TEXT", text: "0" }],
      output: "Number",
    }]);
  }
}

function services(workspace: Blockly.Workspace): BlocklyAgentServices {
  ensurePlanFixtures();
  const states: Record<string, Record<string, unknown>> = {
    agent_host_scene: { type: "agent_host_scene", fields: { NAME: "MainScene" } },
    agent_host_statement: { type: "agent_host_statement", inputs: { VALUE: { shadow: { type: "math_number", fields: { NUM: 1 } } } } },
    agent_host_value: { type: "agent_host_value", fields: { TEXT: "0" } },
  };
  return {
    workspace,
    selectedBlockId: () => null,
    getTaskBlockDirectory: vi.fn(() => ({ apiVersion: 1 as const, schema: "visual-python.block-api" as const, categories: [], candidates: [] })),
    searchBlocks: vi.fn(() => []),
    getBlockTemplates: vi.fn((types: string[]) => types.flatMap((type: string) => states[type] ? [{ type, label: type, category: "Test", state: states[type]!, inputSlots: [] }] : [])),
    generateCode: vi.fn(() => "generated code"),
    validateContexts: vi.fn(() => []),
    validateCode: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn((state) => Blockly.serialization.workspaces.load(state as Parameters<typeof Blockly.serialization.workspaces.load>[0], workspace)),
  };
}

const signal = () => new AbortController().signal;

describe("Blockly Agent host", () => {
  it("exposes code-first conversion, tree creation and plan patching write operations", () => {
    expect(blocklyAgentTools.map((tool) => tool.definition.function.name)).toEqual([
      "get_workspace",
      "get_task_block_directory",
      "search_blocks",
      "get_block_templates",
      "apply_block_program",
      "apply_python_as_blocks",
    ]);
    expect(blocklyAgentTools.filter((tool) => tool.changesState).map((tool) => tool.definition.function.name)).toEqual(["apply_block_program", "apply_python_as_blocks"]);
  });

  it("describes actual Blockly fields and connection contracts", () => {
    ensurePlanFixtures();
    const contract = describeBlocklyBlockContract("agent_host_statement");
    expect(contract).toMatchObject({
      inputSlots: [{ name: "VALUE", kind: "value", check: ["Number"] }],
      hasPreviousConnection: true,
      hasNextConnection: true,
      hasOutputConnection: false,
    });
    expect(contract.optionalValueInputs).toContain("VALUE");
  });

  it("reads workspace summary and full state only on request", async () => {
    const workspace = new Blockly.Workspace();
    workspace.newBlock("math_number").setFieldValue("2", "NUM");
    const execute = createBlocklyToolExecutor(services(workspace));
    await expect(execute("get_workspace", {}, signal())).resolves.toMatchObject({ blockCount: 1 });
    const detailed = await execute("get_workspace", { includeState: true }, signal());
    expect(detailed.workspace).toMatchObject({ blocks: { languageVersion: 0 } });
    workspace.dispose();
  });

  it("retrieves task directory, search results, and batched templates", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    host.searchBlocks = vi.fn(() => [{ type: "agent_host_value", label: "数字", category: "Python" } as never]);
    const execute = createBlocklyToolExecutor(host);

    await execute("get_task_block_directory", { task: "绘制", limit: 12 }, signal());
    expect(host.getTaskBlockDirectory).toHaveBeenCalledWith("绘制", 12);
    await expect(execute("search_blocks", { query: "数字" }, signal())).resolves.toMatchObject({ matches: [{ type: "agent_host_value" }] });
    await expect(execute("get_block_templates", { types: ["agent_host_statement"] }, signal())).resolves.toMatchObject({
      templates: [{ type: "agent_host_statement", inputSlots: [{ name: "VALUE", kind: "value", check: ["Number"] }] }],
    });
    workspace.dispose();
  });

  it("returns contracts with search results and reports unknown template types", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    host.searchBlocks = vi.fn(() => [{ type: "agent_host_value", label: "数字", category: "Python", state: { type: "agent_host_value" } } as never]);
    const execute = createBlocklyToolExecutor(host);

    const search = await execute("search_blocks", { query: "数字" }, signal()) as { matches: Array<Record<string, unknown>> };
    expect(search.matches[0]).toMatchObject({ type: "agent_host_value", inputSlots: [] });
    expect(search.matches[0]).not.toHaveProperty("state");

    await expect(execute("get_block_templates", { types: ["agent_host_statement", "missing_block"] }, signal())).resolves.toMatchObject({
      templates: [{ type: "agent_host_statement" }],
      notFound: ["missing_block"],
    });
    workspace.dispose();
  });

  it("attaches block contracts for the reported types when a plan fails", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    const execute = createBlocklyToolExecutor(host);
    const result = await execute("apply_block_plan", {
      version: 1,
      mode: "replace",
      operations: [{ action: "create", ref: "value", block: "agent_host_value", fields: { MISSING: "x" } }],
    }, signal()) as { ok: boolean; contracts?: Array<Record<string, unknown>> };

    expect(result.ok).toBe(false);
    expect(result.contracts?.[0]).toMatchObject({ type: "agent_host_value", inputSlots: [] });
    expect(host.commit).not.toHaveBeenCalled();
    workspace.dispose();
  });

  it("compiles a semantic plan in isolation and commits once", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    const execute = createBlocklyToolExecutor(host);
    const result = await execute("apply_block_plan", {
      version: 1,
      mode: "replace",
      operations: [
        { action: "create", ref: "scene", block: "agent_host_scene", fields: { NAME: "Demo" }, inputs: { BODY: { refs: ["step"] } } },
        { action: "create", ref: "step", block: "agent_host_statement", inputs: { VALUE: { ref: "amount" } } },
        { action: "create", ref: "amount", block: "agent_host_value", fields: { TEXT: "2" } },
      ],
    }, signal());

    expect(result).toMatchObject({ ok: true, changed: true, blockCount: 3, refIds: { scene: expect.any(String), step: expect.any(String), amount: expect.any(String) } });
    expect(result).not.toHaveProperty("state");
    expect(result).not.toHaveProperty("code");
    expect(host.commit).toHaveBeenCalledOnce();
    expect(workspace.getAllBlocks(false)).toHaveLength(3);
    expect(workspace.getBlockById((result as { refIds: Record<string, string> }).refIds.amount!)).toBeTruthy();
    workspace.dispose();
  });

  it("converts a complete Python program into blocks through the optional converter", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    host.convertPythonToWorkspace = vi.fn(() => ({
      blocks: {
        languageVersion: 0,
        blocks: [{
          type: "agent_host_scene",
          fields: { NAME: "Converted" },
          inputs: { BODY: { block: { type: "agent_host_statement" } } },
        }],
      },
    }));
    const execute = createBlocklyToolExecutor(host);
    const result = await execute("apply_python_as_blocks", {
      version: 1,
      mode: "replace",
      code: "class Converted(Scene):\n    pass",
    }, signal());

    expect(result).toMatchObject({ ok: true, changed: true, blockCount: 2, fallbackCount: 0 });
    expect(host.convertPythonToWorkspace).toHaveBeenCalledWith("class Converted(Scene):\n    pass");
    expect(host.commit).toHaveBeenCalledOnce();
    expect(workspace.getTopBlocks(false)[0]?.getFieldValue("NAME")).toBe("Converted");

    // 与 blockTree/blockPlan 一致：模型把 version 传成字符串 "1" 时也应接受。
    const workspace2 = new Blockly.Workspace();
    const host2 = services(workspace2);
    host2.convertPythonToWorkspace = vi.fn(() => ({
      blocks: {
        languageVersion: 0,
        blocks: [{
          type: "agent_host_scene",
          fields: { NAME: "Converted" },
          inputs: { BODY: { block: { type: "agent_host_statement" } } },
        }],
      },
    }));
    const result2 = await createBlocklyToolExecutor(host2)("apply_python_as_blocks", {
      version: "1",
      mode: "replace",
      code: "class Converted(Scene):\n    pass",
    }, signal());
    expect(result2).toMatchObject({ ok: true, changed: true });
    workspace2.dispose();
    workspace.dispose();
  });

  it("reports code-to-block conversion as unavailable without a converter", async () => {
    const workspace = new Blockly.Workspace();
    const execute = createBlocklyToolExecutor(services(workspace));
    const result = await execute("apply_python_as_blocks", {
      version: 1,
      mode: "replace",
      code: "print('x')",
    }, signal()) as { ok: boolean; issues?: Array<{ message: string }> };

    expect(result.ok).toBe(false);
    expect(result.issues?.[0]?.message).toContain("没有可用的 Python→积木转换器");
    workspace.dispose();
  });

  it("compiles a nested block tree with host-managed connections", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    const execute = createBlocklyToolExecutor(host);
    const result = await execute("apply_block_tree", {
      version: 1,
      mode: "replace",
      tree: {
        type: "agent_host_scene",
        statements: {
          BODY: [{
            type: "agent_host_statement",
            values: { VALUE: { type: "agent_host_value", fields: { TEXT: "7" } } },
          }],
        },
      },
    }, signal());

    expect(result).toMatchObject({ ok: true, changed: true, blockCount: 3 });
    expect(result).not.toHaveProperty("state");
    expect(host.commit).toHaveBeenCalledOnce();
    const scene = workspace.getTopBlocks(false)[0];
    expect(scene?.type).toBe("agent_host_scene");
    expect(scene?.getFieldValue("NAME")).toBe("MainScene");
    const statement = scene?.getInput("BODY")?.connection?.targetBlock();
    expect(statement?.type).toBe("agent_host_statement");
    expect(statement?.getInput("VALUE")?.connection?.targetBlock()?.getFieldValue("TEXT")).toBe("7");
    workspace.dispose();
  });

  it("replaces a non-empty workspace through apply_block_program", async () => {
    const workspace = new Blockly.Workspace();
    workspace.newBlock("agent_host_value").setFieldValue("old", "TEXT");
    const host = services(workspace);
    const execute = createBlocklyToolExecutor(host);
    const result = await execute("apply_block_program", {
      mode: "replace",
      tree: { type: "agent_host_scene", fields: { NAME: "Only" } },
    }, signal());

    expect(result).toMatchObject({ ok: true, blockCount: 1 });
    expect(workspace.getTopBlocks(false).map((block) => block.type)).toEqual(["agent_host_scene"]);
    workspace.dispose();
  });

  it("reports a path for invalid block tree nodes", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    const execute = createBlocklyToolExecutor(host);
    const result = await execute("apply_block_tree", {
      mode: "replace",
      tree: { type: "agent_host_scene", fields: { NAME: "Demo" }, statements: { BODY: [{ type: "agent_host_statement", id: "raw" }] } },
    }, signal()) as { ok: boolean; issues?: Array<{ message: string }> };

    expect(result.ok).toBe(false);
    expect(result.issues?.[0]?.message).toContain("statements.BODY[0]");
    expect(host.commit).not.toHaveBeenCalled();
    workspace.dispose();
  });

  it("places appended statements inside the declared entry block", async () => {
    if (!Blockly.Blocks.agent_host_linked_scene) {
      Blockly.common.defineBlocksWithJsonArray([{
        type: "agent_host_linked_scene",
        message0: "linked scene %1 %2",
        args0: [{ type: "field_input", name: "NAME", text: "MainScene" }, { type: "input_statement", name: "BODY" }],
        previousStatement: null,
        nextStatement: null,
      }]);
    }
    const workspace = new Blockly.Workspace();
    const scene = workspace.newBlock("agent_host_linked_scene");
    const host = { ...services(workspace), entryBlockTypes: ["agent_host_linked_scene"] };
    const execute = createBlocklyToolExecutor(host);

    const summary = await execute("get_workspace", {}, signal()) as { statementTail: Record<string, unknown> | null };
    expect(summary.statementTail).toMatchObject({ sceneId: scene.id, inputName: "BODY", lastBlockId: null });

    const result = await execute("apply_block_plan", {
      version: 1,
      mode: "append",
      operations: [{ action: "create", ref: "step", block: "agent_host_statement" }],
    }, signal()) as { refIds: Record<string, string> };
    expect(result).toMatchObject({ ok: true, refIds: { step: expect.any(String) } });
    const nested = workspace.getBlockById(scene.id)?.getInput("BODY")?.connection?.targetBlock();
    expect(nested?.id).toBe(result.refIds.step);
    workspace.dispose();
  });

  it("reports plan contract failures without committing", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    const execute = createBlocklyToolExecutor(host);
    const result = await execute("apply_block_plan", {
      version: 1,
      mode: "replace",
      operations: [{ action: "create", ref: "value", block: "agent_host_value", fields: { MISSING: "x" } }],
    }, signal());

    expect(result).toMatchObject({ ok: false, changed: false, issues: [{ code: "INVALID_FIELD", fieldName: "MISSING", operationIndex: 0, blockType: "agent_host_value" }] });
    expect(host.commit).not.toHaveBeenCalled();
    expect(workspace.getAllBlocks(false)).toHaveLength(0);
    workspace.dispose();
  });

  it("does not commit when generated Python validation fails", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    host.validateCode = vi.fn().mockRejectedValue(new Error("invalid Python"));
    const execute = createBlocklyToolExecutor(host);
    const result = await execute("apply_block_plan", {
      version: 1,
      mode: "replace",
      operations: [{ action: "create", ref: "value", block: "agent_host_value" }],
    }, signal());

    expect(result).toMatchObject({ ok: false, changed: false, issues: [{ code: "CODE_VALIDATION_FAILED", message: "invalid Python" }] });
    expect(host.commit).not.toHaveBeenCalled();
    workspace.dispose();
  });

  it("rejects Blockly-native state in a plan", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    const execute = createBlocklyToolExecutor(host);
    const result = await execute("apply_block_plan", {
      version: 1,
      mode: "replace",
      operations: [{ action: "create", ref: "value", block: "agent_host_value", id: "raw-id" }],
    }, signal());

    expect(result).toMatchObject({ ok: false, changed: false, issues: [{ code: "RAW_BLOCKLY_STATE" }] });
    expect(host.commit).not.toHaveBeenCalled();
    workspace.dispose();
  });
});
