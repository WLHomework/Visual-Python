import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, point, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const filledRectangle = (width: number, height: number, x: number, y: number, color: string) => moveTo({
  type: "visual_python_manim_set_fill",
  fields: { COLOR: color },
  inputs: {
    MOBJECT: input({
      type: "visual_python_manim_rectangle_object",
      fields: { COLOR: color },
      inputs: { WIDTH: number(width), HEIGHT: number(height) },
    }),
    OPACITY: number(0.72),
  },
}, x, y);

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 38) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const write = (name: string, seconds = 0.7) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedPerfectSquareFormulaExample: ExampleProject = {
  id: "manim-narrated-perfect-square-formula",
  title: "代数演示：完全平方公式",
  projectName: "narrated-perfect-square-formula.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedPerfectSquareFormula", "Scene", chain(
    assign("outer_square", moveTo({
      type: "visual_python_manim_square_object",
      fields: { COLOR: "WHITE" },
      inputs: { SIDE_LENGTH: number(4) },
    }, -2.4, 0)),
    assign("area_a2", filledRectangle(2.6, 2.6, -3.1, -0.7, "BLUE")),
    assign("area_ab_right", filledRectangle(1.4, 2.6, -1.1, -0.7, "GREEN")),
    assign("area_ab_top", filledRectangle(2.6, 1.4, -3.1, 1.3, "GREEN")),
    assign("area_b2", filledRectangle(1.4, 1.4, -1.1, 1.3, "YELLOW")),
    assign("label_a2", mathLabel("a^2", -3.1, -0.7, "WHITE", 42)),
    assign("label_ab_right", mathLabel("ab", -1.1, -0.7, "WHITE", 34)),
    assign("label_ab_top", mathLabel("ab", -3.1, 1.3, "WHITE", 34)),
    assign("label_b2", mathLabel("b^2", -1.1, 1.3, "WHITE", 36)),
    assign("side_bottom", mathLabel("a+b", -2.4, -2.45, "WHITE", 34)),
    assign("side_left", mathLabel("a+b", -4.85, 0, "WHITE", 34)),
    assign("whole_area", mathLabel("(a+b)^2", 2.7, 2.25, "WHITE", 48)),
    assign("sum_area", mathLabel("a^2+ab+ab+b^2", 2.7, 0.65, "GREEN", 40)),
    assign("result", mathLabel("(a+b)^2=a^2+2ab+b^2", 2.7, -1.25, "YELLOW", 38)),
    voiceoverWithAnimation("画一个边长为 a 加 b 的正方形。它的总面积，就是 a 加 b 的平方。", chain(play(create("outer_square", 1)), write("side_bottom", 0.5), write("side_left", 0.5), write("whole_area", 0.8)), "default", "perfect-square-whole"),
    voiceoverWithAnimation("先看左下角的蓝色正方形，它的边长是 a，所以面积是 a 的平方。", chain(play(create("area_a2", 0.8)), write("label_a2", 0.5)), "default", "perfect-square-a2"),
    voiceoverWithAnimation("右边和上方各有一个绿色长方形。它们的边长分别是 a 和 b，所以每一块的面积都是 ab。", chain(play(create("area_ab_right", 0.7)), write("label_ab_right", 0.4), play(create("area_ab_top", 0.7)), write("label_ab_top", 0.4)), "default", "perfect-square-ab"),
    voiceoverWithAnimation("右上角黄色小正方形的边长是 b，面积就是 b 的平方。四块区域恰好填满整个大正方形。", chain(play(create("area_b2", 0.7)), write("label_b2", 0.4), write("sum_area", 0.9)), "default", "perfect-square-b2"),
    voiceoverWithAnimation("把四块面积相加，两个 ab 可以合并成二 ab，因此得到完全平方公式。", write("result", 1), "default", "perfect-square-result"),
    voiceover("这个公式不是需要死记的符号规则，它就是一个大正方形被分成四块以后，面积保持不变。", "default", "perfect-square-summary"),
    wait(0.8),
  )),
};
