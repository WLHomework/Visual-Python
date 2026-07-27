export const editorFontSizeMin = 10;
export const editorFontSizeMax = 40;
export const defaultEditorFontSize = 13;
export const editorIndentSizes = [2, 4, 8] as const;
export const editorFontOptions = [
  { id: "cascadia-code", label: "Cascadia Code", family: '"Cascadia Code", Consolas, monospace' },
  { id: "jetbrains-mono", label: "JetBrains Mono", family: '"JetBrains Mono", "Cascadia Code", Consolas, monospace' },
  { id: "fira-code", label: "Fira Code", family: '"Fira Code", "Cascadia Code", Consolas, monospace' },
  { id: "consolas", label: "Consolas", family: 'Consolas, "Cascadia Code", monospace' },
  { id: "system-monospace", label: "System Monospace", family: "monospace" },
] as const;
export const defaultEditorFontId = "cascadia-code";

export type EditorFontSize = number;
export type EditorIndentSize = (typeof editorIndentSizes)[number];
export type EditorFontId = (typeof editorFontOptions)[number]["id"];

export function normalizeEditorFontSize(value: unknown): EditorFontSize {
  if (value === null || value === undefined || value === "") return defaultEditorFontSize;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultEditorFontSize;
  return Math.min(editorFontSizeMax, Math.max(editorFontSizeMin, Math.round(parsed)));
}

export function normalizeEditorIndentSize(value: unknown): EditorIndentSize {
  const parsed = Number(value);
  return editorIndentSizes.includes(parsed as EditorIndentSize) ? parsed as EditorIndentSize : 4;
}

export function normalizeEditorFontId(value: unknown): EditorFontId {
  return editorFontOptions.some((option) => option.id === value) ? value as EditorFontId : defaultEditorFontId;
}

export function getEditorFontFamily(value: unknown): string {
  const id = normalizeEditorFontId(value);
  return editorFontOptions.find((option) => option.id === id)?.family ?? editorFontOptions[0].family;
}
