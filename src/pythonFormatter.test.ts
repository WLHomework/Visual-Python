import { format } from "@wasm-fmt/ruff_fmt/node";
import { describe, expect, it } from "vitest";
import { formatPythonWith } from "./pythonFormatter";

describe("Python formatter", () => {
  it("formats Python with Ruff while preserving comments and quote style", () => {
    const source = "# keep this comment\ndef add (a,b):\n  return a+b\n\nmessage = 'hello'\n";
    expect(formatPythonWith(source, "main.py", format)).toBe("# keep this comment\ndef add(a, b):\n    return a + b\n\n\nmessage = 'hello'\n");
  });

  it("leaves an empty document untouched", () => {
    expect(formatPythonWith("\n", "main.py", format)).toBe("\n");
  });

  it("uses the configured indentation width", () => {
    expect(formatPythonWith("if True:\n    print('yes')\n", "main.py", format, 2)).toBe("if True:\n  print('yes')\n");
  });
});
