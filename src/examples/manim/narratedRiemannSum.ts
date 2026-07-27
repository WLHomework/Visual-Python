import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, list, number, play, range, raw, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const axesPoint = (x: number, y: number) => input({
  type: "visual_python_manim_axes_c2p",
  inputs: { AXES: ref("axes"), X: number(x), Y: number(y) },
});

const rectangle = (x: number, width: number, height: number, color: string) => ({
  type: "visual_python_manim_move_to",
  inputs: {
    MOBJECT: input({
      type: "visual_python_manim_set_fill",
      fields: { COLOR: color },
      inputs: {
        MOBJECT: input({
          type: "visual_python_manim_rectangle_object",
          fields: { COLOR: color },
          inputs: { WIDTH: number(width), HEIGHT: number(height) },
        }),
        OPACITY: number(0.58),
      },
    }),
    POINT: axesPoint(x, height / 2),
  },
});

const group = (...objects: object[]) => ({
  type: "visual_python_manim_group_from_list_object",
  inputs: { OBJECTS: list(...objects) },
});

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 36) => ({
  type: "visual_python_manim_move_to",
  inputs: {
    MOBJECT: input({
      type: "visual_python_manim_mathtex_object",
      fields: { COLOR: color },
      inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
    }),
    POINT: input({ type: "visual_python_manim_point", inputs: { X: number(x), Y: number(y), Z: number(0) } }),
  },
});

const write = (name: string, seconds = 0.8) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedRiemannSumExample: ExampleProject = {
  id: "manim-narrated-riemann-sum",
  title: "微积分直观：黎曼和逼近面积",
  projectName: "narrated-riemann-sum.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedRiemannSum", "Scene", chain(
    assign("axes", {
      type: "visual_python_manim_axes_object",
      inputs: { X_RANGE: range(0, 4, 1), Y_RANGE: range(0, 5, 1), X_LENGTH: number(8), Y_LENGTH: number(5) },
    }),
    assign("graph", {
      type: "visual_python_manim_axes_plot",
      fields: { COLOR: "YELLOW" },
      inputs: { AXES: ref("axes"), FUNCTION: raw("lambda x: 0.25 * x**2 + 1"), X_RANGE: range(0, 4) },
    }),
    assign("coarse_rectangles", group(
      rectangle(0.5, 2, 1.0625, "BLUE"),
      rectangle(1.5, 2, 1.5625, "BLUE"),
      rectangle(2.5, 2, 2.5625, "BLUE"),
      rectangle(3.5, 2, 4.0625, "BLUE"),
    )),
    assign("fine_rectangles", group(
      rectangle(0.25, 1, 1.015625, "GREEN"),
      rectangle(0.75, 1, 1.140625, "GREEN"),
      rectangle(1.25, 1, 1.390625, "GREEN"),
      rectangle(1.75, 1, 1.765625, "GREEN"),
      rectangle(2.25, 1, 2.265625, "GREEN"),
      rectangle(2.75, 1, 2.890625, "GREEN"),
      rectangle(3.25, 1, 3.640625, "GREEN"),
      rectangle(3.75, 1, 4.515625, "GREEN"),
    )),
    assign("area", {
      type: "visual_python_manim_axes_area",
      fields: { COLOR: "PURPLE" },
      inputs: { AXES: ref("axes"), GRAPH: ref("graph"), X_RANGE: range(0, 4) },
    }),
    assign("coarse_label", mathLabel("n=4", -4.7, 2.8, "BLUE", 38)),
    assign("fine_label", mathLabel("n=8", -4.7, 2.8, "GREEN", 38)),
    assign("sum_label", mathLabel("\\sum f(x_i)\\Delta x", -4.4, 1.8, "WHITE", 34)),
    assign("integral_label", mathLabel("\\int_0^4 f(x)\\,dx", -4.3, 0.8, "YELLOW", 38)),
    voiceoverWithAnimation("我们想求黄色曲线从零到四之间，与横轴围成的面积。曲线边界不是直线，不能直接套用长方形面积公式。", chain(play(create("axes", 0.8)), play(create("graph", 1.2))), "default", "riemann-problem"),
    voiceoverWithAnimation("先把区间平均分成四份，用四个长方形近似覆盖曲线下方。每个长方形的面积是高度乘以宽度。", chain(play(create("coarse_rectangles", 1.2)), write("coarse_label", 0.5), write("sum_label", 0.7)), "default", "riemann-four"),
    voiceover("四个矩形已经给出了面积估计，但矩形顶部和曲线之间仍有明显空隙，所以误差还比较大。", "default", "riemann-error"),
    voiceoverWithAnimation("把分割加密到八份，矩形宽度缩小了一半。绿色矩形的上边缘更贴近曲线，近似也更加精细。", chain(play({ type: "visual_python_manim_transform_to_animation", inputs: { SOURCE: ref("coarse_rectangles"), TARGET: ref("fine_rectangles"), RUN_TIME: number(1.5) } }), play({ type: "visual_python_manim_transform_to_animation", inputs: { SOURCE: ref("coarse_label"), TARGET: ref("fine_label"), RUN_TIME: number(0.8) } })), "default", "riemann-eight"),
    voiceoverWithAnimation("继续增加矩形数量，让每个矩形无限变窄，黎曼和的极限就成为定积分，也就是曲线下方的准确面积。", chain(play({ type: "visual_python_manim_fade_in_animation", inputs: { MOBJECT: ref("area"), SHIFT: raw("ORIGIN"), SCALE: number(1), RUN_TIME: number(1.2) } }), write("integral_label", 0.9)), "default", "riemann-integral"),
    voiceover("黎曼和把弯曲的面积问题，拆成许多简单矩形的面积问题。分割越细，近似越准确，这正是定积分的核心直观。", "default", "riemann-summary"),
    wait(0.8),
  )),
};
