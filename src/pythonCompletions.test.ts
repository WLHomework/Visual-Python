import { describe, expect, it } from "vitest";
import { collectPythonDocumentSymbols, findPythonCallContext, findPythonIdentifierOccurrences, getPythonCompletions, getPythonOutline, getPythonSignatures, isPythonCompletionContext, isValidPythonIdentifier, splitPythonParameters } from "./pythonCompletions";

describe("Python code completions", () => {
  it("collects functions, parameters, variables, loops and imports", () => {
    const symbols = collectPythonDocumentSymbols(`
import numpy as np
from pathlib import Path

def calculate(value: float, count=1, *, mode="fast"):
    total = value * count
    for index, item in enumerate(values):
        pass
`);
    const labels = symbols.map((item) => item.label);
    expect(labels).toEqual(expect.arrayContaining(["np", "Path", "calculate", "value", "count", "mode", "total", "index", "item"]));
    expect(symbols.find((item) => item.label === "calculate")?.insertText).toBe("calculate(${1:value}, ${2:count}, ${3:mode})");
  });

  it("prioritizes document symbols and avoids duplicate builtins", () => {
    const completions = getPythonCompletions("print = custom_printer");
    const printItems = completions.filter((item) => item.label === "print");
    expect(printItems).toHaveLength(1);
    expect(printItems[0].kind).toBe("variable");
    expect(completions.some((item) => item.label === "len" && item.kind === "builtin")).toBe(true);
    expect(completions.some((item) => item.label === "if" && item.kind === "snippet")).toBe(true);
    expect(["aiter", "ascii", "bytes", "compile", "setattr", "super", "__import__"].every((name) => completions.some((item) => item.label === name && item.kind === "builtin"))).toBe(true);
  });

  it("does not suggest inside comments, strings or after a member dot", () => {
    expect(isPythonCompletionContext("value = ")).toBe(true);
    expect(isPythonCompletionContext("# pri")).toBe(false);
    expect(isPythonCompletionContext("message = 'pri")).toBe(false);
    expect(isPythonCompletionContext("object.")).toBe(false);
  });

  it("builds signatures without splitting nested defaults", () => {
    expect(splitPythonParameters("value: tuple[int, str], options={\"a\": (1, 2)}, flag=True")).toEqual([
      "value: tuple[int, str]",
      "options={\"a\": (1, 2)}",
      "flag=True",
    ]);
    const signatures = getPythonSignatures("def render(scene, quality='high'):\n    pass");
    expect(signatures.get("render")?.[0]).toEqual({
      label: "render(scene, quality='high')",
      parameters: ["scene", "quality='high'"],
      documentation: "调用 render，参数：scene、quality",
    });
    expect(signatures.get("range")?.map((signature) => signature.parameters)).toEqual([["stop"], ["start", "stop", "step=1"]]);
  });

  it("finds the active argument in nested calls", () => {
    expect(findPythonCallContext("print(max(values), sep=", 23)).toEqual({ name: "print", activeParameter: 1 });
    expect(findPythonCallContext("print(max(values", 16)).toEqual({ name: "max", activeParameter: 0 });
    expect(findPythonCallContext("print('a,b', end=", 17)).toEqual({ name: "print", activeParameter: 1 });
    expect(findPythonCallContext("object.render(")).toBeNull();
  });

  it("records document definition locations for navigation", () => {
    const symbols = collectPythonDocumentSymbols("count = 1\n\ndef calculate(value):\n    return value + count\n");
    expect(symbols.find((item) => item.label === "count")?.definition).toEqual({ lineNumber: 1, column: 1 });
    expect(symbols.find((item) => item.label === "calculate")?.definition).toEqual({ lineNumber: 3, column: 5 });
    expect(symbols.find((item) => item.label === "value")?.definition).toEqual({ lineNumber: 3, column: 15 });
  });

  it("finds rename targets without touching strings, comments, attributes or keyword labels", () => {
    const source = "total = 1\nprint(total)\nobject.total = total\nshow(total=total)\n# total\ntext = 'total'";
    expect(findPythonIdentifierOccurrences(source, "total")).toEqual([
      { lineNumber: 1, startColumn: 1, endColumn: 6 },
      { lineNumber: 2, startColumn: 7, endColumn: 12 },
      { lineNumber: 3, startColumn: 16, endColumn: 21 },
      { lineNumber: 4, startColumn: 12, endColumn: 17 },
    ]);
    expect(isValidPythonIdentifier("final_total")).toBe(true);
    expect(isValidPythonIdentifier("最终结果")).toBe(true);
    expect(isValidPythonIdentifier("for")).toBe(false);
    expect(isValidPythonIdentifier("2total")).toBe(false);
  });

  it("recognizes Chinese functions, classes and variables", () => {
    const source = "结果 = 1\n\ndef 计算面积(半径):\n    return 半径 * 半径\n\nclass 动画场景:\n    pass\n";
    const symbols = collectPythonDocumentSymbols(source);
    expect(symbols.find((item) => item.label === "结果")?.kind).toBe("variable");
    expect(symbols.find((item) => item.label === "计算面积")?.signature).toBe("计算面积(半径)");
    expect(symbols.find((item) => item.label === "动画场景")?.kind).toBe("class");
    expect(findPythonCallContext("计算面积(")).toEqual({ name: "计算面积", activeParameter: 0 });
    expect(findPythonIdentifierOccurrences("结果 = 1\nprint(结果)", "结果")).toEqual([
      { lineNumber: 1, startColumn: 1, endColumn: 3 },
      { lineNumber: 2, startColumn: 7, endColumn: 9 },
    ]);
  });

  it("orders functions and classes by their source positions", () => {
    expect(getPythonOutline("class Scene:\n    pass\n\ndef render(value):\n    return value\n")).toEqual([
      { label: "Scene", kind: "class", lineNumber: 1, column: 7, signature: undefined },
      { label: "render", kind: "function", lineNumber: 4, column: 5, signature: "render(value)" },
    ]);
  });
});
