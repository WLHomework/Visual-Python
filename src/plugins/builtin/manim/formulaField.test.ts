import { describe, expect, it } from "vitest";
import { formatFormulaPreview } from "./formulaField";

describe("Manim formula field", () => {
  it("shows a readable preview without changing the stored LaTeX", () => {
    const latex = "\\int_{-2}^{2}(0.5x^2+1)\\,dx";
    expect(formatFormulaPreview(latex)).toBe("∫_-2^2(0.5x^2+1) dx");
    expect(latex).toBe("\\int_{-2}^{2}(0.5x^2+1)\\,dx");
  });

  it("converts common formula commands into compact symbols", () => {
    expect(formatFormulaPreview("\\frac{a}{b} \\leq \\sqrt{x} \\to \\infty")).toBe("(a)/(b) ≤ sqrt(x) → ∞");
  });
});
