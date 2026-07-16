import { describe, expect, it } from "vitest";
import { normalizeEditorFontSize, normalizeEditorIndentSize } from "./editorPreferences";

describe("editor preferences", () => {
  it("accepts supported persisted values", () => {
    expect(normalizeEditorFontSize("16")).toBe(16);
    expect(normalizeEditorFontSize("15")).toBe(15);
    expect(normalizeEditorIndentSize("2")).toBe(2);
  });

  it("normalizes custom font sizes into the supported range", () => {
    expect(normalizeEditorFontSize("9")).toBe(10);
    expect(normalizeEditorFontSize("41")).toBe(40);
    expect(normalizeEditorFontSize("15.6")).toBe(16);
    expect(normalizeEditorFontSize("not-a-number")).toBe(13);
    expect(normalizeEditorIndentSize(null)).toBe(4);
  });
});
