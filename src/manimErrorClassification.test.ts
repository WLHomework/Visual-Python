import { describe, expect, it } from "vitest";
import { isManimLatexFailure } from "./manimErrorClassification";

describe("Manim error classification", () => {
  it("recognizes actual LaTeX failures", () => {
    expect(isManimLatexFailure("File manim/utils/tex_file_writing.py\nLaTeX compilation error")).toBe(true);
    expect(isManimLatexFailure("MathTex failed while running dvisvgm")).toBe(true);
  });

  it("does not mistake ordinary tracebacks for LaTeX failures", () => {
    expect(isManimLatexFailure("File contextlib.py\nValueError: Demo.wait() has a duration of 0 <= 0 seconds")).toBe(false);
  });
});
