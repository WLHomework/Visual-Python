import { describe, expect, it } from "vitest";
import { applyExactCodeEdits, createCodeChangePreview, restoreMissingBaseIndent } from "./codeChanges";

describe("Agent v2 code changes", () => {
  it("applies sequential exact edits and rejects ambiguous matches", () => {
    expect(applyExactCodeEdits("name = 'old'\nprint(name)\n", [
      { oldText: "'old'", newText: "'new'" },
      { oldText: "print(name)", newText: "print(name.upper())" },
    ])).toBe("name = 'new'\nprint(name.upper())\n");
    expect(() => applyExactCodeEdits("x = 1\nx = 1\n", [{ oldText: "x = 1", newText: "x = 2" }])).toThrow("匹配到 2 处");
    expect(applyExactCodeEdits("x = 1\nx = 1\n", [{ oldText: "x = 1", newText: "x = 2", replaceAll: true }])).toBe("x = 2\nx = 2\n");
  });

  it("preserves the source line ending and restores omitted indentation", () => {
    expect(applyExactCodeEdits(
      "def construct(self):\r\n    self.wait(1)\r\n",
      [{ oldText: "def construct(self):\n    self.wait(1)", newText: "def construct(self):\n    self.wait(2)" }],
    )).toBe("def construct(self):\r\n    self.wait(2)\r\n");
    expect(restoreMissingBaseIndent("        self.wait(1)", "self.play(FadeIn(dot))\nself.wait(2)"))
      .toBe("        self.play(FadeIn(dot))\n        self.wait(2)");
  });

  it("creates a compact readable diff", () => {
    expect(createCodeChangePreview("x = 1\nprint(x)", "x = 2\nprint(x)")).toContain("- x = 1\n+ x = 2");
  });
});
