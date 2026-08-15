import { describe, expect, it } from "vitest";
import { createCodeDocumentFromSource } from "../../../sceneDocuments";
import { createManimSceneDocument, manimSceneDocumentName, renameManimSceneDocument } from "./sceneDocuments";

describe("Manim scene documents", () => {
  it("creates complete standalone scene files with unique names", () => {
    const document = createManimSceneDocument(["NewScene", "NewScene2"]);
    expect(document.name).toBe("NewScene3");
    expect(document.code).toContain("from manim import *");
    expect(document.code).toContain("class NewScene3(Scene):");
  });

  it("derives and renames Unicode Manim scene names", () => {
    const document = createCodeDocumentFromSource("from manim import *\nclass Old(Scene):\n    pass\n", "Old", "scene-main");
    const renamed = renameManimSceneDocument(document, "圆形动画");
    expect(manimSceneDocumentName(renamed.code, "Fallback")).toBe("圆形动画");
    expect(renamed.code).toContain("class 圆形动画(Scene):");
  });
});
