import { extractManimSceneNames, nextUniqueManimSceneName } from "./plugins/builtin/manim/sceneNames";
import { isPythonIdentifier } from "./pythonIdentifiers";

export type SceneDocument = { id: string; name: string; code: string };

const validId = /^[A-Za-z0-9_-]{1,128}$/;

export const sceneDocumentName = (code: string, fallback: string) => extractManimSceneNames(code)[0] || fallback;

export function createSceneDocument(usedNames: Iterable<string>, baseName = "NewScene"): SceneDocument {
  const name = nextUniqueManimSceneName(baseName, usedNames);
  return {
    id: `scene-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    code: `from manim import *\n\n\nclass ${name}(Scene):\n    def construct(self):\n        pass\n`,
  };
}

export function legacySceneDocument(code: string): SceneDocument {
  const name = sceneDocumentName(code, "MainScene");
  return { id: "scene-main", name, code };
}

export function renameSceneDocument(document: SceneDocument, name: string): SceneDocument {
  if (!isPythonIdentifier(name)) throw new Error("场景名称必须是有效的 Python 类名");
  const currentName = extractManimSceneNames(document.code)[0];
  const code = currentName
    ? document.code.replace(new RegExp(`(class\\s+)${currentName}(\\s*\\(\\s*(?:Scene|MovingCameraScene|ThreeDScene|SpecialThreeDScene)\\s*\\))`), `$1${name}$2`)
    : document.code;
  return { ...document, name, code };
}

export function validateSceneDocuments(value: unknown): SceneDocument[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error("工程场景文档列表无效");
  const ids = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("工程包含无效的场景文档");
    const document = item as Record<string, unknown>;
    if (typeof document.id !== "string" || !validId.test(document.id)
      || typeof document.name !== "string" || !isPythonIdentifier(document.name)
      || typeof document.code !== "string" || document.code.length > 5_000_000
      || ids.has(document.id)) throw new Error("工程包含无效的场景文档");
    ids.add(document.id);
    return { id: document.id, name: document.name, code: document.code };
  });
}
