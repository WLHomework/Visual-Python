import { describe, expect, it } from "vitest";
import { validateStandaloneSceneSource } from "./sceneValidation";

describe("standalone scene validation", () => {
  it("accepts a complete standalone scene", () => {
    expect(validateStandaloneSceneSource("from manim import *\nclass Demo(Scene):\n    def construct(self):\n        pass\n", "Demo", [], []).valid).toBe(true);
  });
  it("reports imports, names, duplicate scenes and resources", () => {
    const result = validateStandaloneSceneSource("class One(Scene): pass\nclass Two(Scene): pass\npath='resource://missing'", "Other", [], []);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["missing-manim-import", "multiple-scenes", "name-mismatch", "missing-resource"]));
  });
  it("allows ordinary standalone Python files", () => {
    expect(validateStandaloneSceneSource("print('hello')", "Script", [], [])).toMatchObject({ valid: true, kind: "python" });
  });
});
