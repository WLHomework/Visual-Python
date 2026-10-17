import { describe, expect, it } from "vitest";
import { BlockPlanValidationError, parseBlockPlan } from "./blockPlan";

describe("BlockPlan schema", () => {
  it("accepts a semantic create plan", () => {
    expect(parseBlockPlan({
      version: 1,
      mode: "append",
      operations: [{ action: "create", ref: "print1", block: "python_print", fields: { TEXT: "你好" } }],
    })).toEqual({
      version: 1,
      mode: "append",
      operations: [{ action: "create", ref: "print1", block: "python_print", fields: { TEXT: "你好" } }],
    });
  });

  it("rejects an empty operation list", () => {
    expect(() => parseBlockPlan({ version: 1, mode: "append", operations: [] })).toThrow("operations 不能为空");
  });

  it("requires version and mode and rejects unknown top-level fields", () => {
    expect(() => parseBlockPlan({ mode: "append", operations: [{ action: "create", ref: "x", block: "text" }] })).toThrow("version 必须为 1");
    expect(() => parseBlockPlan({ version: 1, operations: [{ action: "create", ref: "x", block: "text" }] })).toThrow("mode 必须为");
    expect(() => parseBlockPlan({ version: 1, mode: "append", extra: true, operations: [{ action: "create", ref: "x", block: "text" }] })).toThrow("未知字段");
  });

  it("rejects raw Blockly state", () => {
    expect(() => parseBlockPlan({ version: 1, mode: "append", operations: [{ action: "create", ref: "x", block: "text", next: {} }] })).toThrow(BlockPlanValidationError);
    try {
      parseBlockPlan({ version: 1, mode: "append", operations: [{ action: "create", ref: "x", block: "text", next: {} }] });
    } catch (error) {
      expect(error).toMatchObject({ issue: { code: "RAW_BLOCKLY_STATE", operationIndex: 0 } });
    }
  });

  it("rejects duplicate refs and reports the operation index", () => {
    expect(() => parseBlockPlan({
      version: 1,
      mode: "append",
      operations: [
        { action: "create", ref: "x", block: "text" },
        { action: "create", ref: "x", block: "text" },
      ],
    })).toThrowError(/重复的 ref/);
    try {
      parseBlockPlan({ version: 1, mode: "append", operations: [{ action: "create", ref: "x", block: "text", inputs: { VALUE: { refs: ["missing"] } } }] });
    } catch (error) {
      expect(error).toMatchObject({ issue: { code: "UNKNOWN_REF", operationIndex: 0, ref: "missing" } });
    }
  });

  it("allows references declared later in the same plan", () => {
    expect(parseBlockPlan({
      version: 1,
      mode: "append",
      operations: [
        { action: "create", ref: "statement", block: "statement", inputs: { VALUE: { ref: "value" } } },
        { action: "create", ref: "value", block: "number" },
      ],
    }).operations).toHaveLength(2);
  });

  it("reports the input name for malformed input values", () => {
    try {
      parseBlockPlan({ version: 1, mode: "append", operations: [{ action: "create", ref: "x", block: "text", inputs: { VALUE: { invalid: true } } }] });
    } catch (error) {
      expect(error).toMatchObject({ issue: { code: "INVALID_INPUT", operationIndex: 0, inputName: "VALUE" } });
    }
  });

  it("supports update, delete, and connect targets", () => {
    expect(parseBlockPlan({
      version: 1,
      mode: "patch",
      operations: [
        { action: "create", ref: "value", block: "text" },
        { action: "update", target: { ref: "value" }, fields: { TEXT: "hello" } },
        { action: "connect", from: { ref: "value" }, to: { blockId: "existing", inputName: "VALUE" } },
        { action: "delete", target: { blockId: "old" } },
      ],
    }).operations).toHaveLength(4);
  });
});
