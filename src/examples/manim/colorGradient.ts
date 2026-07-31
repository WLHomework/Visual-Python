import type { ExampleProject } from "../types";
import { assign, chain, create, input, list, number, play, ref, scaledDirection, sceneWorkspace, text, wait } from "./workspaceHelpers";

const customBlue = 'ManimColor("#3A86FF")';
const customPink = 'ManimColor("#FF006E")';
const customOrange = 'ManimColor("#FB5607")';
const customPurple = 'ManimColor("#8338EC")';
const customYellow = 'ManimColor("#FFBE0B")';

export const colorGradientExample: ExampleProject = {
  id: "manim-color-gradient",
  title: "自定义颜色与渐变",
  projectName: "manim-color-gradient.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("ColorGradientDemo", "Scene", chain(
    assign("title", {
      type: "visual_python_manim_shift",
      inputs: {
        MOBJECT: input({
          type: "visual_python_manim_plain_text_object",
          fields: { COLOR: 'ManimColor("#F2F2F2")' },
          inputs: { CONTENT: text("颜色与渐变"), FONT_SIZE: number(48) },
        }),
        VECTOR: scaledDirection("UP", 2.5),
      },
    }),
    assign("gradient_circle", {
      type: "visual_python_manim_set_color_gradient",
      fields: { START_COLOR: customBlue, END_COLOR: customPink },
      inputs: {
        MOBJECT: input({
          type: "visual_python_manim_shift",
          inputs: {
            MOBJECT: input({
              type: "visual_python_manim_circle_object",
              fields: { COLOR: "WHITE" },
              inputs: { RADIUS: number(1.35) },
            }),
            VECTOR: scaledDirection("LEFT", 2.2),
          },
        }),
      },
    }),
    assign("mixed_square", {
      type: "visual_python_manim_set_color_blend",
      fields: { START_COLOR: customOrange, END_COLOR: customPurple },
      inputs: {
        MOBJECT: input({
          type: "visual_python_manim_shift",
          inputs: {
            MOBJECT: input({
              type: "visual_python_manim_square_object",
              fields: { COLOR: "WHITE" },
              inputs: { SIDE_LENGTH: number(2.4) },
            }),
            VECTOR: scaledDirection("RIGHT", 2.2),
          },
        }),
        RATIO: number(0.5),
      },
    }),
    {
      type: "visual_python_manim_play_list",
      inputs: {
        ANIMATIONS: list(
          { type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref("title"), RUN_TIME: number(1) } },
          create("gradient_circle", 1.2),
          create("mixed_square", 1.2),
        ),
        RUN_TIME: number(2.4),
        LAG_RATIO: number(0.2),
      },
    },
    play({
      type: "visual_python_manim_animate_set_color_gradient",
      fields: { START_COLOR: "GREEN", END_COLOR: "PURPLE" },
      inputs: { MOBJECT: ref("gradient_circle"), RUN_TIME: number(2) },
    }),
    play({
      type: "visual_python_manim_animate_set_color",
      fields: { COLOR: customYellow },
      inputs: { MOBJECT: ref("mixed_square"), RUN_TIME: number(2) },
    }),
    wait(1),
  )),
};
