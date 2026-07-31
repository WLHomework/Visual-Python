import { describe, expect, it } from "vitest";
import { addPythonImport, insertPythonStatements, replacePythonFunctionBody, type PythonStructure } from "./pythonStructuredEdits";

const structure: PythonStructure = {
  imports: [{ kind: "ImportFrom", startLine: 1, endLine: 1, summary: "from manim import *", isDocstring: false }],
  statements: [
    { kind: "ImportFrom", startLine: 1, endLine: 1, summary: "from manim import *", isDocstring: false },
    { kind: "ClassDef", startLine: 3, endLine: 7, summary: "class Demo(Scene):", isDocstring: false },
  ],
  functions: [],
  classes: [{
    name: "Demo", startLine: 3, endLine: 7, column: 0,
    methods: [{
      name: "construct", kind: "function", startLine: 4, endLine: 7, bodyStartLine: 5, bodyEndLine: 7, column: 4,
      statements: [
        { kind: "Expr", startLine: 5, endLine: 5, summary: '"doc"', isDocstring: true },
        { kind: "Assign", startLine: 6, endLine: 6, summary: "dot = Dot()", isDocstring: false },
        { kind: "Expr", startLine: 7, endLine: 7, summary: "self.add(dot)", isDocstring: false },
      ],
    }],
  }],
};

const source = 'from manim import *\n\nclass Demo(Scene):\n    def construct(self):\n        "doc"\n        dot = Dot()\n        self.add(dot)\n';

describe("Python structured edits", () => {
  it("inserts statements after a docstring with host-calculated indentation", () => {
    const result = insertPythonStatements(source, structure, { className: "Demo", functionName: "construct", position: "start", statements: ["circle = Circle()", "self.add(circle)"] });
    expect(result).toContain('        "doc"\n        circle = Circle()\n        self.add(circle)\n        dot = Dot()');
  });

  it("replaces only the function body", () => {
    const result = replacePythonFunctionBody(source, structure, { className: "Demo", functionName: "construct", body: "square = Square()\nself.play(Create(square))" });
    expect(result).toContain("    def construct(self):\n        square = Square()\n        self.play(Create(square))");
    expect(result).not.toContain("dot = Dot()");
  });

  it("adds imports after existing imports and avoids duplicates", () => {
    const result = addPythonImport(source, structure, "math", ["sin", "cos"]);
    expect(result.startsWith("from manim import *\nfrom math import sin, cos\n")).toBe(true);
    expect(addPythonImport(result, { ...structure, imports: [...structure.imports, { kind: "ImportFrom", startLine: 2, endLine: 2, summary: "from math import sin, cos", isDocstring: false }] }, "math", ["sin", "cos"])).toBe(result);
  });

  it("adds the first import after a module docstring", () => {
    const moduleSource = '"""Animation module."""\n\nclass Demo:\n    pass\n';
    const moduleStructure: PythonStructure = {
      classes: [],
      functions: [],
      imports: [],
      statements: [{ kind: "Expr", startLine: 1, endLine: 1, summary: '"""Animation module."""', isDocstring: true }],
    };
    expect(addPythonImport(moduleSource, moduleStructure, "math")).toBe('"""Animation module."""\nimport math\n\nclass Demo:\n    pass\n');
  });

  it("accepts valid Chinese module and imported names", () => {
    const emptyStructure: PythonStructure = { classes: [], functions: [], imports: [], statements: [] };
    expect(addPythonImport("", emptyStructure, "教学工具", ["计算面积"]))
      .toBe("from 教学工具 import 计算面积\n");
  });
});
