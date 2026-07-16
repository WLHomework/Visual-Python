export const editorFontSizeMin = 10;
export const editorFontSizeMax = 40;
export const defaultEditorFontSize = 13;
export const editorIndentSizes = [2, 4, 8] as const;

export type EditorFontSize = number;
export type EditorIndentSize = (typeof editorIndentSizes)[number];

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
