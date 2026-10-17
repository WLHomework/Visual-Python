import { describe, expect, it, vi } from "vitest";
import * as Blockly from "blockly/core";
import "blockly/blocks";
import { parseBlockPlan } from "./blockPlan";
import { compileBlockPlan, type BlockPlanCompilerServices } from "./blockPlanCompiler";
import type { BlockTemplate } from "./blocklyHost";

function ensureFixtures() {
  if (!Blockly.Blocks.agent_plan_scene) {
    Blockly.common.defineBlocksWithJsonArray([{
      type: "agent_plan_scene",
      message0: "scene %1 %2",
      args0: [{ type: "field_input", name: "NAME", text: "MainScene" }, { type: "input_statement", name: "BODY" }],
    }, {
      type: "agent_plan_statement",
      message0: "step %1",
      args0: [{ type: "input_value", name: "VALUE", check: "Number" }],
      previousStatement: null,
      nextStatement: null,
    }, {
      type: "agent_plan_value",
      message0: "value %1",
      args0: [{ type: "field_input", name: "TEXT", text: "0" }],
      output: "Number",
    }]);
  }
}

function templates(types: string[]): BlockTemplate[] {
  ensureFixtures();
  const states: Record<string, Record<string, unknown>> = {
    agent_plan_scene: { type: "agent_plan_scene", fields: { NAME: "MainScene" } },
    agent_plan_statement: { type: "agent_plan_statement", inputs: { VALUE: { shadow: { type: "math_number", fields: { NUM: 1 } } } } },
    agent_plan_value: { type: "agent_plan_value", fields: { TEXT: "0" } },
  };
  return types.map((type) => ({ type, label: type, category: "Test", state: states[type]!, inputSlots: [] }));
}

function services(workspace: Blockly.Workspace): BlockPlanCompilerServices {
  return {
    workspace,
    getBlockTemplates: vi.fn((types) => templates(types)),
    generateCode: vi.fn(() => "generated code"),
    validateContexts: vi.fn(() => []),
    validateCode: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn(),
  };
}

describe("BlockPlan compiler", () => {
  it("automatically chains newly created statement blocks in operation order", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    const result = await compileBlockPlan(parseBlockPlan({
      version: 1,
      mode: "replace",
      operations: [
        { action: "create", ref: "first", block: "agent_plan_statement" },
        { action: "create", ref: "second", block: "agent_plan_statement" },
        { action: "create", ref: "third", block: "agent_plan_statement" },
      ],
    }), host, new AbortController().signal);

    expect(result).toMatchObject({ ok: true, autoChained: 2 });
    const state = (host.commit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { blocks: { blocks: unknown[] } };
    const checkWorkspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(state, checkWorkspace);
    const roots = checkWorkspace.getTopBlocks(false);
    expect(roots).toHaveLength(1);
    expect(roots[0]?.type).toBe("agent_plan_statement");
    expect(roots[0]?.getNextBlock()?.getNextBlock()).not.toBeNull();
    expect(roots[0]?.getNextBlock()?.getNextBlock()?.getNextBlock()).toBeNull();
    checkWorkspace.dispose();
    workspace.dispose();
  });

  it("appends a generated statement chain to the only existing statement chain", async () => {
    const workspace = new Blockly.Workspace();
    const existing = workspace.newBlock("agent_plan_statement");
    const host = services(workspace);
    const result = await compileBlockPlan(parseBlockPlan({
      version: 1,
      mode: "append",
      operations: [
        { action: "create", ref: "first", block: "agent_plan_statement" },
        { action: "create", ref: "second", block: "agent_plan_statement" },
      ],
    }), host, new AbortController().signal);

    expect(result).toMatchObject({ ok: true, autoChained: 2 });
    const state = (host.commit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { blocks: { blocks: unknown[] } };
    const checkWorkspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(state, checkWorkspace);
    const roots = checkWorkspace.getTopBlocks(false);
    expect(roots).toHaveLength(1);
    expect(roots[0]?.id).toBe(existing.id);
    expect(roots[0]?.getNextBlock()?.getNextBlock()).not.toBeNull();
    checkWorkspace.dispose();
    workspace.dispose();
  });

  it("attaches a new statement chain to the only newly created entry block", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    const result = await compileBlockPlan(parseBlockPlan({
      version: 1,
      mode: "replace",
      operations: [
        { action: "create", ref: "scene", block: "agent_plan_scene" },
        { action: "create", ref: "first", block: "agent_plan_statement" },
        { action: "create", ref: "second", block: "agent_plan_statement" },
        { action: "create", ref: "third", block: "agent_plan_statement" },
      ],
    }), host, new AbortController().signal);

    expect(result).toMatchObject({ ok: true, autoChained: 3 });
    const state = (host.commit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { blocks: { blocks: unknown[] } };
    const checkWorkspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(state, checkWorkspace);
    const roots = checkWorkspace.getTopBlocks(false);
    const body = roots[0]?.getInput("BODY")?.connection?.targetBlock();
    expect(roots).toHaveLength(1);
    expect(roots[0]?.type).toBe("agent_plan_scene");
    expect(body?.type).toBe("agent_plan_statement");
    expect(body?.getNextBlock()?.getNextBlock()?.getNextBlock()).toBeNull();
    checkWorkspace.dispose();
    workspace.dispose();
  });

  it("builds and commits a valid plan exactly once", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    const plan = parseBlockPlan({
      version: 1,
      mode: "replace",
      operations: [
        { action: "create", ref: "scene", block: "agent_plan_scene", fields: { NAME: "Demo" }, inputs: { BODY: { refs: ["step"] } } },
        { action: "create", ref: "step", block: "agent_plan_statement", inputs: { VALUE: { ref: "amount" } } },
        { action: "create", ref: "amount", block: "agent_plan_value", fields: { TEXT: "2" } },
      ],
    });

    const result = await compileBlockPlan(plan, host, new AbortController().signal);

    expect(result).toMatchObject({ ok: true, changed: true, blockCount: 3, code: "generated code" });
    expect(host.commit).toHaveBeenCalledOnce();
    expect(host.validateCode).toHaveBeenCalledWith("generated code");
    const state = (host.commit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { blocks: { blocks: unknown[] } };
    expect(state.blocks.blocks).toHaveLength(1);
    workspace.dispose();
  });

  it("does not commit when a field is invalid", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    const before = Blockly.serialization.workspaces.save(workspace);
    const result = await compileBlockPlan(parseBlockPlan({
      version: 1,
      mode: "replace",
      operations: [{ action: "create", ref: "value", block: "agent_plan_value", fields: { MISSING: "x" } }],
    }), host, new AbortController().signal);

    expect(result).toMatchObject({ ok: false, issues: [{ code: "INVALID_FIELD", operationIndex: 0, fieldName: "MISSING", blockType: "agent_plan_value" }] });
    expect(host.commit).not.toHaveBeenCalled();
    expect(Blockly.serialization.workspaces.save(workspace)).toEqual(before);
    workspace.dispose();
  });

  it("does not commit incompatible connections", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    const result = await compileBlockPlan(parseBlockPlan({
      version: 1,
      mode: "replace",
      operations: [
        { action: "create", ref: "step", block: "agent_plan_statement", inputs: { VALUE: { ref: "scene" } } },
        { action: "create", ref: "scene", block: "agent_plan_scene" },
      ],
    }), host, new AbortController().signal);

    expect(result.ok).toBe(false);
    expect(result.issues?.[0]?.operationIndex).toBe(0);
    expect(result.issues?.[0]?.inputName).toBe("VALUE");
    expect(result.issues?.[0]?.blockType).toBe("agent_plan_statement");
    expect(host.commit).not.toHaveBeenCalled();
    workspace.dispose();
  });

  it("supports update, connect, and delete without partial commit", async () => {
    const workspace = new Blockly.Workspace();
    const existing = workspace.newBlock("agent_plan_value");
    const host = services(workspace);
    const result = await compileBlockPlan(parseBlockPlan({
      version: 1,
      mode: "patch",
      operations: [
        { action: "create", ref: "value", block: "agent_plan_value", fields: { TEXT: "2" } },
        { action: "update", target: { blockId: existing.id }, fields: { TEXT: "1" } },
        { action: "delete", target: { blockId: existing.id } },
      ],
    }), host, new AbortController().signal);

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(host.commit).toHaveBeenCalledOnce();
    workspace.dispose();
  });

  it("connects a created statement after an existing statement block", async () => {
    const workspace = new Blockly.Workspace();
    const existing = workspace.newBlock("agent_plan_statement");
    const host = services(workspace);
    const result = await compileBlockPlan(parseBlockPlan({
      version: 1,
      mode: "patch",
      operations: [
        { action: "create", ref: "next", block: "agent_plan_statement" },
        { action: "connect", from: { ref: "next" }, to: { afterBlockId: existing.id } },
      ],
    }), host, new AbortController().signal);

    expect(result.ok).toBe(true);
    expect(host.commit).toHaveBeenCalledOnce();
    workspace.dispose();
  });
});
