import * as Blockly from "blockly/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildBlockOutline, compactBlockOutline, filterBlockOutline } from "./blockOutline";

const types = ["test_outline_scene", "test_outline_loop", "test_outline_action"];

describe("block outline", () => {
  beforeAll(() => {
    Blockly.common.defineBlocksWithJsonArray([
      { type: types[0], message0: "测试场景 %1", args0: [{ type: "input_statement", name: "BODY" }] },
      { type: types[1], message0: "重复 %1", args0: [{ type: "input_statement", name: "BODY" }], previousStatement: null, nextStatement: null },
      { type: types[2], message0: "执行动作", previousStatement: null, nextStatement: null },
    ]);
  });

  afterAll(() => {
    for (const type of types) delete Blockly.Blocks[type];
  });

  const createWorkspace = () => {
    const workspace = new Blockly.Workspace();
    const scene = workspace.newBlock(types[0]);
    const loop = workspace.newBlock(types[1]);
    const action = workspace.newBlock(types[2]);
    scene.getInput("BODY")?.connection?.connect(loop.previousConnection!);
    loop.getInput("BODY")?.connection?.connect(action.previousConnection!);
    return { workspace, scene, loop, action };
  };

  it("builds statement nesting without listing value inputs", () => {
    const { workspace, scene, action } = createWorkspace();
    const outline = buildBlockOutline(workspace, new Set([action.id]));
    expect(outline).toHaveLength(1);
    expect(outline[0]).toMatchObject({ id: scene.id, blockCount: 3, issueCount: 1 });
    expect(outline[0].children[0].children[0].id).toBe(action.id);
    workspace.dispose();
  });

  it("retains ancestors while filtering nested matches", () => {
    const { workspace, action } = createWorkspace();
    const filtered = filterBlockOutline(buildBlockOutline(workspace), "执行动作");
    expect(filtered[0].children[0].children[0].id).toBe(action.id);
    expect(filterBlockOutline(buildBlockOutline(workspace), "missing")).toEqual([]);
    workspace.dispose();
  });

  it("keeps structural nodes and issues while compacting leaf statements", () => {
    const { workspace, scene, loop, action } = createWorkspace();
    const compacted = compactBlockOutline(buildBlockOutline(workspace));
    expect(compacted[0].id).toBe(scene.id);
    expect(compacted[0].children[0].id).toBe(loop.id);
    expect(compacted[0].children[0].children).toEqual([]);

    const compactedWithIssue = compactBlockOutline(buildBlockOutline(workspace, new Set([action.id])));
    expect(compactedWithIssue[0].children[0].children[0].id).toBe(action.id);
    workspace.dispose();
  });
});
