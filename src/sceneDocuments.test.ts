import { describe, expect, it } from "vitest";
import { createSceneDocument, legacySceneDocument, renameSceneDocument, sceneDocumentName, validateSceneDocuments } from "./sceneDocuments";

describe("scene documents", () => {
  it("creates complete standalone scene files with unique names", () => {
    const document = createSceneDocument(["NewScene", "NewScene2"]);
    expect(document.name).toBe("NewScene3");
    expect(document.code).toContain("from manim import *");
    expect(document.code).toContain("class NewScene3(Scene):");
  });

  it("migrates legacy source without changing its contents", () => {
    const code = "from manim import *\nclass Lesson(Scene):\n    pass\n";
    expect(legacySceneDocument(code)).toEqual({ id: "scene-main", name: "Lesson", code });
    expect(sceneDocumentName("print('hello')", "Fallback")).toBe("Fallback");
  });

  it("validates persisted documents and rejects duplicate ids", () => {
    const documents = [{ id: "scene-one", name: "One", code: "class One(Scene): pass" }];
    expect(validateSceneDocuments(documents)).toEqual(documents);
    expect(() => validateSceneDocuments([...documents, ...documents])).toThrow("无效");
  });

  it("renames the document and its primary scene class", () => {
    const renamed = renameSceneDocument(legacySceneDocument("from manim import *\nclass Old(Scene):\n    pass\n"), "Lesson");
    expect(renamed.name).toBe("Lesson");
    expect(renamed.code).toContain("class Lesson(Scene):");
    expect(() => renameSceneDocument(renamed, "not valid")).toThrow("Python 类名");
  });

  it("supports Chinese scene names", () => {
    const renamed = renameSceneDocument(legacySceneDocument("from manim import *\nclass Old(Scene):\n    pass\n"), "圆形动画");
    expect(renamed.name).toBe("圆形动画");
    expect(renamed.code).toContain("class 圆形动画(Scene):");
    expect(validateSceneDocuments([renamed])).toEqual([renamed]);
  });
});
