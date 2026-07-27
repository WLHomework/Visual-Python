import type { ExampleProject } from "../types";
import { assign, chain, create, direction, formula, input, number, play, range, raw, ref, sceneWorkspace, text, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const write = (name: string, seconds = 1) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedLinearFunctionExample: ExampleProject = {
  id: "manim-narrated-linear-function",
  title: "配音讲解：一次函数图像",
  projectName: "narrated-linear-function.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedLinearFunction", "Scene", chain(
    assign("title", {
      type: "visual_python_manim_to_edge",
      inputs: {
        MOBJECT: input({ type: "visual_python_manim_plain_text_object", fields: { COLOR: "BLUE" }, inputs: { CONTENT: text("一次函数 y = kx + b"), FONT_SIZE: number(40) } }),
        DIRECTION: direction("UP"),
        BUFF: number(0.3),
      },
    }),
    assign("axes", { type: "visual_python_manim_axes_object", inputs: { X_RANGE: range(-5, 5, 1), Y_RANGE: range(-4, 5, 1), X_LENGTH: number(9), Y_LENGTH: number(6) } }),
    assign("labels", { type: "visual_python_manim_axis_labels", inputs: { AXES: ref("axes"), X_LABEL: text("x"), Y_LABEL: text("y") } }),
    assign("graph", { type: "visual_python_manim_axes_plot", fields: { COLOR: "BLUE" }, inputs: { AXES: ref("axes"), FUNCTION: raw("lambda x: x + 1"), X_RANGE: range(-4, 3) } }),
    assign("formula", {
      type: "visual_python_manim_to_corner",
      inputs: {
        MOBJECT: input({ type: "visual_python_manim_mathtex_object", fields: { COLOR: "WHITE" }, inputs: { CONTENT: formula("y=kx+b"), FONT_SIZE: number(48) } }),
        DIRECTION: direction("UR"),
        BUFF: number(0.55),
      },
    }),
    assign("slope_note", {
      type: "visual_python_manim_move_to",
      inputs: {
        MOBJECT: input({ type: "visual_python_manim_mathtex_object", fields: { COLOR: "YELLOW" }, inputs: { CONTENT: formula("k=1"), FONT_SIZE: number(38) } }),
        POINT: input({ type: "visual_python_manim_point", inputs: { X: number(4.6), Y: number(-1.15), Z: number(0) } }),
      },
    }),
    assign("intercept_note", {
      type: "visual_python_manim_move_to",
      inputs: {
        MOBJECT: input({ type: "visual_python_manim_mathtex_object", fields: { COLOR: "GREEN" }, inputs: { CONTENT: formula("b=1"), FONT_SIZE: number(38) } }),
        POINT: input({ type: "visual_python_manim_point", inputs: { X: number(4.6), Y: number(-2.05), Z: number(0) } }),
      },
    }),
    voiceoverWithAnimation("一次函数的标准形式是，y 等于 kx 加 b。", chain(write("title", 1), write("formula", 1)), "default", "linear-narrated-intro"),
    voiceoverWithAnimation("我们先画出坐标系，再观察直线 y 等于 x 加一。", chain(play(create("axes", 1.3)), play(create("labels", 0.7)), play(create("graph", 1.6))), "default", "linear-narrated-graph"),
    voiceoverWithAnimation("k 叫作斜率。这里 k 等于一，x 每增加一，y 也增加一。", write("slope_note", 1), "default", "linear-narrated-slope"),
    voiceoverWithAnimation("b 叫作纵截距。这里 b 等于一，所以直线经过 y 轴上的一点一。", write("intercept_note", 1), "default", "linear-narrated-intercept"),
    voiceover("斜率决定直线的倾斜程度，截距决定直线与 y 轴的交点。", "default", "linear-narrated-summary"),
    wait(0.8),
  )),
};
