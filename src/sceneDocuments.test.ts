import { describe, expect, it } from "vitest";
import sceneDocumentsSource from "./sceneDocuments.ts?raw";
import { createCodeDocument, createCodeDocumentFromSource, renameCodeDocument, validateCodeDocuments } from "./sceneDocuments";

describe("scene documents", () => {
  it("does not depend on a plugin implementation", () => {
    expect(sceneDocumentsSource).not.toMatch(/plugins\/builtin|Manim|Scene/);
  });

  it("creates a generic empty Python document without a Manim template", () => {
    const document = createCodeDocument(["main"]);
    expect(document.name).toBe("main2");
    expect(document.code).toBe("");
  });

  it("renames a generic Python document without rewriting its code", () => {
    const document = { id: "document-1", name: "main", code: "print('hello')\n" };
    expect(renameCodeDocument(document, "工具")).toEqual({ ...document, name: "工具" });
    expect(() => renameCodeDocument(document, "not valid")).toThrow("Python 标识符");
  });

  it("wraps legacy source without interpreting plugin-specific code", () => {
    const code = "class Lesson(CustomPluginBase):\n    pass\n";
    expect(createCodeDocumentFromSource(code, "lesson", "document-main")).toEqual({ id: "document-main", name: "lesson", code });
  });

  it("validates persisted documents and rejects duplicate ids", () => {
    const documents = [{ id: "scene-one", name: "One", code: "class One(Scene): pass" }];
    expect(validateCodeDocuments(documents)).toEqual(documents);
    expect(() => validateCodeDocuments([...documents, ...documents])).toThrow("无效");
  });
});
