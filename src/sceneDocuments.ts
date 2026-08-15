import { isPythonIdentifier } from "./pythonIdentifiers";

export type CodeDocument = { id: string; name: string; code: string };

const validId = /^[A-Za-z0-9_-]{1,128}$/;

export const codeDocumentName = (code: string, fallback: string) => {
  const firstLine = code.split(/\r?\n/, 1)[0]?.trim() || "";
  const moduleMatch = firstLine.match(/^#\s*(?:file|module)\s*:\s*(.+)$/i);
  return moduleMatch?.[1]?.trim() || fallback;
};

export function createCodeDocument(usedNames: Iterable<string>, baseName = "main"): CodeDocument {
  const used = new Set([...usedNames].map((name) => name.toLocaleLowerCase()));
  let name = baseName.trim() || "main";
  let index = 1;
  while (used.has(name.toLocaleLowerCase())) name = `${baseName || "main"}${++index}`;
  return {
    id: `document-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    code: "",
  };
}

export const createCodeDocumentFromSource = (code: string, name = "main", id = "document-main"): CodeDocument => ({ id, name, code });

export function renameCodeDocument(document: CodeDocument, name: string): CodeDocument {
  const normalized = name.trim().replace(/\.py$/i, "");
  if (!normalized || !isPythonIdentifier(normalized)) throw new Error("文件名称必须是有效的 Python 标识符");
  return { ...document, name: normalized };
}

export function validateCodeDocuments(value: unknown): CodeDocument[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error("工程代码文档列表无效");
  const ids = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("工程包含无效的代码文档");
    const document = item as Record<string, unknown>;
    if (typeof document.id !== "string" || !validId.test(document.id)
      || typeof document.name !== "string" || !isPythonIdentifier(document.name)
      || typeof document.code !== "string" || document.code.length > 5_000_000
      || ids.has(document.id)) throw new Error("工程包含无效的代码文档");
    ids.add(document.id);
    return { id: document.id, name: document.name, code: document.code };
  });
}
