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
  it("exposes one semantic graphical write operation", () => {
    expect(blocklyAgentTools.map((tool) => tool.definition.function.name)).toEqual([
      "get_workspace",
      "get_task_block_directory",
      "search_blocks",
      "get_block_templates",
      "apply_block_plan",
    ]);
    expect(blocklyAgentTools.filter((tool) => tool.changesState).map((tool) => tool.definition.function.name)).toEqual(["apply_block_plan"]);
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

    expect(result).toMatchObject({ ok: true, changed: true, blockCount: 3 });
    expect(result).not.toHaveProperty("state");
    expect(result).not.toHaveProperty("code");
    expect(host.commit).toHaveBeenCalledOnce();
    expect(workspace.getAllBlocks(false)).toHaveLength(3);
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
