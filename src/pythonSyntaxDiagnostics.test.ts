import { describe, expect, it } from "vitest";
import { parsePythonSyntaxDiagnostic } from "./pythonSyntaxDiagnostics";

describe("Python inline syntax diagnostics", () => {
  it("locates an error and translates a missing colon", () => {
    const source = "if ready\n    print('go')";
    const traceback = `  File "<visual-python>", line 1\n    if ready\n            ^\nSyntaxError: expected ':'`;
    expect(parsePythonSyntaxDiagnostic(traceback, source)).toEqual({
      line: 1,
      startColumn: 9,
      endColumn: 10,
      message: "语句末尾缺少冒号 `:`。",
      suggestion: "在 if、for、while、def、class、try 等语句的末尾补上冒号。",
    });
  });

  it("explains indentation errors in plain Chinese", () => {
    const diagnostic = parsePythonSyntaxDiagnostic(
      `  File "<visual-python>", line 2\n    print('go')\n    ^\nIndentationError: expected an indented block after 'if' statement on line 1`,
      "if ready:\nprint('go')",
    );
    expect(diagnostic?.line).toBe(2);
    expect(diagnostic?.message).toContain("缺少缩进代码块");
    expect(diagnostic?.suggestion).toContain("4 个空格");
    expect(diagnostic?.message).not.toMatch(/抢跑|站整齐|卡了一下/);
  });

  it("ignores environment failures that are not syntax errors", () => {
    expect(parsePythonSyntaxDiagnostic("无法启动 Python", "print('ok')")).toBeNull();
  });
});
