import { describe, expect, it, vi } from "vitest";
import { validatePluginGeneratedPython } from "./pluginGeneratedCodeValidation";

describe("plugin generated Python validation", () => {
  it("checks every generated block sample", async () => {
    const validateCode = vi.fn().mockResolvedValue(undefined);

    await validatePluginGeneratedPython([
      { blockType: "demo_value", code: "1\n" },
      { blockType: "demo_loop", code: "for _ in range(2):\n    pass\n" },
    ], validateCode);

    expect(validateCode).toHaveBeenCalledTimes(2);
  });

  it("identifies the block that generated invalid indentation", async () => {
    await expect(validatePluginGeneratedPython([
      { blockType: "demo_bad_loop", code: "for _ in range(2):\n\tpass\n" },
    ], vi.fn())).rejects.toThrow("demo_bad_loop");
    await expect(validatePluginGeneratedPython([
      { blockType: "demo_bad_loop", code: "for _ in range(2):\n\tpass\n" },
    ], vi.fn())).rejects.toThrow("Tab");
  });

  it("rejects indentation that is not a multiple of four spaces", async () => {
    await expect(validatePluginGeneratedPython([
      { blockType: "demo_two_space_loop", code: "for _ in range(2):\n  pass\n" },
    ], vi.fn())).rejects.toThrow("4 个空格");
  });

  it("includes the Python validator diagnostic", async () => {
    await expect(validatePluginGeneratedPython([
      { blockType: "demo_bad_loop", code: "for _ in range(2):\npass\n" },
    ], vi.fn().mockRejectedValue(new Error("IndentationError: expected an indented block"))))
      .rejects.toThrow("IndentationError: expected an indented block");
  });
});
