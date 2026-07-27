import type { ExampleProject } from "../types";
import { assign, chain, create, direction, formula, input, number, play, point, ref, sceneWorkspace, text, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const write = (name: string, seconds = 1) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedCircleAreaExample: ExampleProject = {
  id: "manim-narrated-circle-area",
  title: "配音讲解：圆的面积",
  projectName: "narrated-circle-area.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedCircleArea", "Scene", chain(
    assign("title", {
      type: "visual_python_manim_to_edge",
      inputs: {
        MOBJECT: input({ type: "visual_python_manim_plain_text_object", fields: { COLOR: "BLUE" }, inputs: { CONTENT: text("圆的面积"), FONT_SIZE: number(44) } }),
        DIRECTION: direction("UP"),
        BUFF: number(0.35),
      },
    }),
    assign("circle", moveTo({ type: "visual_python_manim_circle_object", fields: { COLOR: "BLUE" }, inputs: { RADIUS: number(2) } }, -2.5, -0.4)),
    assign("radius", {
      type: "visual_python_manim_line_segment_object",
      fields: { COLOR: "YELLOW" },
      inputs: { START: input(point(-2.5, -0.4)), END: input(point(-0.5, -0.4)) },
    }),
    assign("radius_label", moveTo({ type: "visual_python_manim_mathtex_object", fields: { COLOR: "YELLOW" }, inputs: { CONTENT: formula("r"), FONT_SIZE: number(42) } }, -1.5, -0.75)),
    assign("formula", moveTo({ type: "visual_python_manim_mathtex_object", fields: { COLOR: "WHITE" }, inputs: { CONTENT: formula("S=\\pi r^2"), FONT_SIZE: number(58) } }, 2.6, 0.2)),
    voiceoverWithAnimation("今天我们用动画认识圆的面积。", chain(write("title", 1), play(create("circle", 1.6))), "default", "circle-area-intro"),
    voiceoverWithAnimation("从圆心到圆周的距离叫作半径，我们用字母 r 表示。", chain(play(create("radius", 1)), write("radius_label", 0.7)), "default", "circle-area-radius"),
    voiceoverWithAnimation("圆的面积等于圆周率乘以半径的平方。", write("formula", 1.5), "default", "circle-area-formula"),
    voiceover("记住公式，S 等于派乘以 r 的平方。", "default", "circle-area-summary"),
    wait(0.8),
  )),
};
