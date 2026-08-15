import { isPythonIdentifier } from "../../../pythonIdentifiers";
import type { CodeDocument } from "../../../sceneDocuments";
import { extractManimSceneNames, nextUniqueManimSceneName } from "./sceneNames";

export const manimSceneDocumentName = (code: string, fallback: string) => extractManimSceneNames(code)[0] || fallback;

export function createManimSceneDocument(usedNames: Iterable<string>, baseName = "NewScene"): CodeDocument {
  const name = nextUniqueManimSceneName(baseName, usedNames);
  return {
    id: `scene-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    code: `from manim import *\n\n\nclass ${name}(Scene):\n    def construct(self):\n        pass\n`,
  };
}

export function renameManimSceneDocument(document: CodeDocument, name: string): CodeDocument {
  if (!isPythonIdentifier(name)) throw new Error("场景名称必须是有效的 Python 类名");
  const currentName = extractManimSceneNames(document.code)[0];
  const code = currentName
    ? document.code.replace(new RegExp(`(class\\s+)${currentName}(\\s*\\(\\s*(?:Scene|MovingCameraScene|ThreeDScene|SpecialThreeDScene)\\s*\\))`), `$1${name}$2`)
    : document.code;
  return { ...document, name, code };
}
