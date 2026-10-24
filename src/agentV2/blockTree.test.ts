import { describe, expect, it } from "vitest";
import { BlockTreeValidationError, blockTreeToPlan, parseBlockTree } from "./blockTree";

describe("Block tree", () => {
  it("turns nested values and statements into host-managed plan operations", () => {
    const tree = parseBlockTree({
      version: 1,
      mode: "append",
      tree: {
        type: "scene",
        statements: {
          BODY: [
            { type: "say", values: { TEXT: "hello" } },
            { type: "wait", values: { SECONDS: 2 } },
          ],
        },
      },
    });
    const plan = blockTreeToPlan(tree);
    expect(plan.mode).toBe("append");
    expect(plan.operations.filter((operation) => operation.action === "create")).toHaveLength(3);
    expect(plan.operations).toContainEqual({ action: "connect", from: { ref: "tree-2" }, to: { ref: "tree-1", inputName: "BODY" } });
    expect(plan.operations).toContainEqual({ action: "connect", from: { ref: "tree-3" }, to: { afterRef: "tree-2" } });
  });

  it("expresses next chains without manual connections", () => {
    const tree = parseBlockTree({
      tree: { type: "first", next: { type: "second", next: { type: "third" } } },
    });
    const plan = blockTreeToPlan(tree);
    expect(plan.operations.filter((operation) => operation.action === "create")).toHaveLength(3);
    expect(plan.operations.filter((operation) => operation.action === "connect")).toHaveLength(2);
  });

  it("rejects raw Blockly fields with a node path", () => {
    expect(() => parseBlockTree({ tree: { type: "scene", statements: { BODY: [{ type: "step", id: "raw" }] } } }))
      .toThrow(BlockTreeValidationError);
    try {
      parseBlockTree({ tree: { type: "scene", statements: { BODY: [{ type: "step", id: "raw" }] } } });
    } catch (error) {
      expect(error).toBeInstanceOf(BlockTreeValidationError);
      expect((error as BlockTreeValidationError).message).toContain("tree.statements.BODY[0]");
    }
  });

  it("limits excessively large trees", () => {
    let tree: Record<string, unknown> = { type: "leaf" };
    for (let index = 0; index < 121; index += 1) tree = { type: "chain", next: tree };
    expect(() => parseBlockTree({ tree })).toThrow("120");
  });
});
