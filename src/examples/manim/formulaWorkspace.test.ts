import { describe, expect, it } from "vitest";
import { upgradeMathFormulaInputs } from "./formulaWorkspace";

describe("Manim formula workspace migration", () => {
  it("upgrades dedicated and structured MathTex text inputs", () => {
    const workspace = { blocks: [{
      type: "visual_python_manim_mathtex_object",
      inputs: { CONTENT: { block: { type: "text", fields: { TEXT: "x^2" } } } },
      next: { block: {
        type: "python_new_object_structured",
        fields: { TARGET: "MathTex" },
        inputs: { ARG0: { block: { type: "text", fields: { TEXT: "\\int_0^1 x\\,dx" } } } },
      } },
    }] };
    const upgraded = upgradeMathFormulaInputs(workspace) as any;
    expect(upgraded.blocks[0].inputs.CONTENT.block).toEqual({ type: "visual_python_manim_formula_value", fields: { LATEX: "x^2" } });
    expect(upgraded.blocks[0].next.block.inputs.ARG0.block).toEqual({ type: "visual_python_manim_formula_value", fields: { LATEX: "\\int_0^1 x\\,dx" } });
    expect(workspace.blocks[0].inputs.CONTENT.block.type).toBe("text");
  });
});
