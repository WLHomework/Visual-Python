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
      type: "agent_plan_linked_scene",
      message0: "linked scene %1 %2",
      args0: [{ type: "field_input", name: "NAME", text: "MainScene" }, { type: "input_statement", name: "BODY" }],
      previousStatement: null,
      nextStatement: null,
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
  if (!Blockly.Blocks.agent_plan_dynamic_ref) {
    Blockly.common.defineBlocksWithJsonArray([{
      type: "agent_plan_named",
      message0: "named %1 value %2",
      args0: [{ type: "field_input", name: "NAME", text: "a" }, { type: "input_value", name: "VALUE", check: "Number" }],
      previousStatement: null,
      nextStatement: null,
    }]);
    Blockly.Blocks.agent_plan_dynamic_ref = {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField("named object")
          .appendField(new Blockly.FieldDropdown(function (this: Blockly.FieldDropdown) {
            const workspace = this.getSourceBlock()?.workspace;
            const names = (workspace?.getAllBlocks(false) ?? [])
              .filter((block) => block.type === "agent_plan_named" && Boolean(block.getInputTargetBlock("VALUE")))
              .map((block) => String(block.getFieldValue("NAME")));
            return names.length ? names.map((name): [string, string] => [name, name]) : [["none", "none"]];
          }), "VAR");
        this.setOutput(true, "Number");
      },
    };
  }
}

function templates(types: string[]): BlockTemplate[] {
  ensureFixtures();
  const states: Record<string, Record<string, unknown>> = {
    agent_plan_scene: { type: "agent_plan_scene", fields: { NAME: "MainScene" } },
    agent_plan_linked_scene: { type: "agent_plan_linked_scene", fields: { NAME: "MainScene" } },
    agent_plan_statement: { type: "agent_plan_statement", inputs: { VALUE: { shadow: { type: "math_number", fields: { NUM: 1 } } } } },
    agent_plan_value: { type: "agent_plan_value", fields: { TEXT: "0" } },
    agent_plan_named: { type: "agent_plan_named", fields: { NAME: "a" }, inputs: { VALUE: { shadow: { type: "math_number", fields: { NUM: 1 } } } } },
    agent_plan_dynamic_ref: { type: "agent_plan_dynamic_ref" },
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

  it("rejects replace on a non-empty workspace without touching it", async () => {
    const workspace = new Blockly.Workspace();
    workspace.newBlock("agent_plan_value");
    const host = services(workspace);
    const before = Blockly.serialization.workspaces.save(workspace);
    const result = await compileBlockPlan(parseBlockPlan({
      version: 1,
      mode: "replace",
      operations: [{ action: "create", ref: "value", block: "agent_plan_value" }],
    }), host, new AbortController().signal);

    expect(result).toMatchObject({ ok: false, changed: false, issues: [{ code: "REPLACE_NOT_ALLOWED" }] });
    expect(result.issues?.[0]?.message).toContain("append");
    expect(host.commit).not.toHaveBeenCalled();
    expect(Blockly.serialization.workspaces.save(workspace)).toEqual(before);
    workspace.dispose();
  });

  it("appends created statements inside the existing declared entry block", async () => {
    const workspace = new Blockly.Workspace();
    const scene = workspace.newBlock("agent_plan_linked_scene");
    const existing = workspace.newBlock("agent_plan_statement");
    scene.getInput("BODY")!.connection!.connect(existing.previousConnection!);
    const host = { ...services(workspace), entryBlockTypes: ["agent_plan_linked_scene"] };
    const result = await compileBlockPlan(parseBlockPlan({
      version: 1,
      mode: "append",
      operations: [
        { action: "create", ref: "first", block: "agent_plan_statement" },
        { action: "create", ref: "second", block: "agent_plan_statement" },
      ],
    }), host, new AbortController().signal);

    expect(result).toMatchObject({ ok: true, autoChained: 2, refIds: { first: expect.any(String), second: expect.any(String) } });
    const state = (host.commit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { blocks: { blocks: unknown[] } };
    const checkWorkspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(state, checkWorkspace);
    expect(checkWorkspace.getTopBlocks(false)).toHaveLength(1);
    const body = checkWorkspace.getBlockById(scene.id)?.getInput("BODY")?.connection?.targetBlock();
    expect(body?.id).toBe(existing.id);
    expect(body?.getNextBlock()?.id).toBe(result.refIds?.first);
    expect(body?.getNextBlock()?.getNextBlock()?.id).toBe(result.refIds?.second);
    checkWorkspace.dispose();
    workspace.dispose();
  });

  it("nests created statements into a declared entry block created in the same plan", async () => {
    const workspace = new Blockly.Workspace();
    const host = { ...services(workspace), entryBlockTypes: ["agent_plan_linked_scene"] };
    const result = await compileBlockPlan(parseBlockPlan({
      version: 1,
      mode: "replace",
      operations: [
        { action: "create", ref: "scene", block: "agent_plan_linked_scene" },
        { action: "create", ref: "first", block: "agent_plan_statement" },
      ],
    }), host, new AbortController().signal);

    expect(result).toMatchObject({ ok: true, autoChained: 1 });
    const state = (host.commit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { blocks: { blocks: unknown[] } };
    const checkWorkspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(state, checkWorkspace);
    const roots = checkWorkspace.getTopBlocks(false);
    expect(roots).toHaveLength(1);
    expect(roots[0]?.getInput("BODY")?.connection?.targetBlock()?.id).toBe(result.refIds?.first);
    checkWorkspace.dispose();
    workspace.dispose();
  });

  it("retries deferred dropdown fields after later operations connect their dependencies", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    const result = await compileBlockPlan(parseBlockPlan({
      version: 1,
      mode: "replace",
      operations: [
        { action: "create", ref: "reference", block: "agent_plan_dynamic_ref", fields: { VAR: "title" } },
        { action: "create", ref: "named", block: "agent_plan_named", fields: { NAME: "title" }, inputs: { VALUE: { ref: "one" } } },
        { action: "create", ref: "one", block: "agent_plan_value", fields: { TEXT: "1" } },
      ],
    }), host, new AbortController().signal);

    expect(result).toMatchObject({ ok: true, changed: true });
    const state = (host.commit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { blocks: { blocks: Array<Record<string, any>> } };
    const reference = state.blocks.blocks.find((block) => block.type === "agent_plan_dynamic_ref");
    expect(reference?.fields?.VAR).toBe("title");
    workspace.dispose();
  });

  it("reports rejected dropdown values with their available options", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    const result = await compileBlockPlan(parseBlockPlan({
      version: 1,
      mode: "replace",
      operations: [
        { action: "create", ref: "reference", block: "agent_plan_dynamic_ref", fields: { VAR: "title" } },
      ],
    }), host, new AbortController().signal);

    expect(result).toMatchObject({ ok: false, changed: false, issues: [{ code: "INVALID_FIELD", fieldName: "VAR", blockType: "agent_plan_dynamic_ref" }] });
    expect(result.issues?.[0]?.message).toContain("title");
    expect(result.issues?.[0]?.message).toContain("当前可选值：none");
    expect(host.commit).not.toHaveBeenCalled();
    workspace.dispose();
  });

  it("maps context validation issues back to the plan refs", async () => {
    const workspace = new Blockly.Workspace();
    const host = services(workspace);
    host.validateContexts = vi.fn((candidate: Blockly.Workspace) => {
      const block = candidate.getAllBlocks(false).find((candidateBlock) => candidateBlock.type === "agent_plan_value");
      return [{ blockId: block?.id, message: "缺少必填输入：数字。" }];
    });
    const result = await compileBlockPlan(parseBlockPlan({
      version: 1,
      mode: "replace",
      operations: [{ action: "create", ref: "amount", block: "agent_plan_value" }],
    }), host, new AbortController().signal);

    expect(result).toMatchObject({ ok: false, changed: false, issues: [{ code: "CONTEXT_VALIDATION_FAILED", ref: "amount", blockType: "agent_plan_value", message: "缺少必填输入：数字。" }] });
    expect(host.commit).not.toHaveBeenCalled();
    workspace.dispose();
  });
});
