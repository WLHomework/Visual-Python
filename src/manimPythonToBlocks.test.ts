import { describe, expect, it } from "vitest";
import { manimPythonToWorkspace } from "./manimPythonToBlocks";

const sample = `from manim import *


class TextAndFormulas(Scene):
  def construct(self):
    title = Text(
        'Visual Python',
        font_size=48,
        color=BLUE,
    ).shift(UP * 2)
    tex_line = Tex(
        'Manim with LaTeX',
        font_size=42,
        color=GREEN,
    )
    formula = MathTex(
        'x^2 + y^2 = z^2',
        font_size=48,
        color=YELLOW,
    ).shift(DOWN * 2)
    self.play(
      *[Write(title, run_time=1), Write(tex_line, run_time=1), Write(formula, run_time=1)],
      run_time=3,
      lag_ratio=0.35,
    )
    self.wait(1)
`;

const json = (value: unknown) => JSON.stringify(value);

describe("manimPythonToWorkspace", () => {
  it("compiles the text-and-formulas scene into a complete block tree", () => {
    const workspace = manimPythonToWorkspace(sample);
    const serialized = json(workspace);
    expect(serialized).toContain("TextAndFormulas");
    expect(serialized).toContain("visual_python_manim_plain_text_object");
    expect(serialized).toContain("Visual Python");
    expect(serialized).toContain("visual_python_manim_tex_object");
    expect(serialized).toContain("Manim with LaTeX");
    expect(serialized).toContain("visual_python_manim_mathtex_object");
    expect(serialized).toContain("x^2 + y^2 = z^2");
    expect(serialized).toContain("visual_python_manim_play_list");
    expect(serialized).toContain("visual_python_manim_write_animation");
    expect(serialized).toContain("\"title\"");
    expect(serialized).toContain("\"tex_line\"");
    expect(serialized).toContain("\"formula\"");
    expect(serialized).toContain("visual_python_manim_wait");
    expect(serialized).not.toContain("python_raw_statement");
  });

  it("keeps unmatched construct statements as raw fallbacks instead of failing", () => {
    const workspace = manimPythonToWorkspace(`from manim import *

class Demo(Scene):
  def construct(self):
    title = Text('Hi', font_size=48, color=BLUE)
    self.custom_helper(title)
    self.wait(1)
`);
    const serialized = JSON.stringify(workspace);
    expect(serialized).toContain("visual_python_manim_plain_text_object");
    expect(serialized).toContain("python_raw_statement");
    expect(serialized).toContain("self.custom_helper(title)");
    expect(serialized).toContain("visual_python_manim_wait");
  });
});
