import { describe, expect, it } from "vitest";
import { parsePythonRuntimeDiagnostic } from "./pythonRuntimeDiagnostics";

describe("Python inline runtime diagnostics", () => {
  it("uses the innermost project line and explains undefined names", () => {
    const traceback = `Traceback (most recent call last):\n  File "<string>", line 5, in <module>\n  File "<string>", line 2, in calculate\nNameError: name 'total' is not defined`;
    const diagnostic = parsePythonRuntimeDiagnostic(traceback, "def calculate():\n    return total\n\n\ncalculate()");
    expect(diagnostic?.line).toBe(2);
    expect(diagnostic?.startColumn).toBe(5);
    expect(diagnostic?.message).toContain("total");
    expect(diagnostic?.suggestion).toContain("赋值");
  });

  it("turns arithmetic and collection errors into friendly Chinese", () => {
    const division = parsePythonRuntimeDiagnostic(
      `Traceback (most recent call last):\n  File "<string>", line 1, in <module>\nZeroDivisionError: division by zero`,
      "result = 10 / 0",
    );
    const index = parsePythonRuntimeDiagnostic(
      `Traceback (most recent call last):\n  File "<string>", line 1, in <module>\nIndexError: list index out of range`,
      "print(items[9])",
    );
    expect(division?.message).toContain("除数变成 0");
    expect(index?.message).toContain("边界");
  });

  it("explains common file system errors", () => {
    const diagnostic = parsePythonRuntimeDiagnostic(
      `Traceback (most recent call last):\n  File "<string>", line 1, in <module>\nOSError: [Errno 39] Directory not empty: 'data'`,
      "Path('data').rmdir()",
    );
    expect(diagnostic?.message).toContain("不是空目录");
    expect(diagnostic?.suggestion).toContain("连同全部内容");
  });

  it("ignores syntax errors and library-only tracebacks", () => {
    expect(parsePythonRuntimeDiagnostic(`  File "<visual-python>", line 1\nSyntaxError: invalid syntax`, "x =")).toBeNull();
    expect(parsePythonRuntimeDiagnostic(`ValueError: bad value`, "run()")).toBeNull();
  });
});
