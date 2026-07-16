import type { ExampleProject } from "../types";

const input = (block: object) => ({ block });
const number = (value: number) => input({ type: "math_number", fields: { NUM: value } });
const text = (value: string) => input({ type: "text", fields: { TEXT: value } });
const reference = (name: string) => ({ type: "visual_python_manim_object_ref", fields: { VAR: name } });
const shifted = (mobject: object, direction: "UP" | "DOWN", scale: number) => ({
  type: "visual_python_manim_shift",
  inputs: {
    MOBJECT: input(mobject),
    VECTOR: input({ type: "visual_python_manim_scaled_direction", fields: { DIRECTION: direction }, inputs: { SCALE: number(scale) } }),
  },
});
const write = (name: string) => ({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: input(reference(name)), RUN_TIME: number(1) },
});

export const textAndFormulasExample: ExampleProject = {
  id: "manim-text-formulas",
  title: "文本与数学公式",
  projectName: "manim-text-and-formulas.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: {
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: "visual_python_manim_scene", x: 96, y: 72,
        fields: { NAME: "TextAndFormulas", SCENE_TYPE: "Scene" },
        inputs: { BODY: { block: {
          type: "visual_python_manim_assign", fields: { VAR: "title" },
          inputs: { MOBJECT: input(shifted({
            type: "visual_python_manim_plain_text_object", fields: { COLOR: "BLUE" },
            inputs: { CONTENT: text("Visual Python"), FONT_SIZE: number(48) },
          }, "UP", 2)) },
          next: { block: {
            type: "visual_python_manim_assign", fields: { VAR: "tex_line" },
            inputs: { MOBJECT: input({
              type: "visual_python_manim_tex_object", fields: { COLOR: "GREEN" },
              inputs: { CONTENT: text("Manim with LaTeX"), FONT_SIZE: number(42) },
            }) },
            next: { block: {
              type: "visual_python_manim_assign", fields: { VAR: "formula" },
              inputs: { MOBJECT: input(shifted({
                type: "visual_python_manim_mathtex_object", fields: { COLOR: "YELLOW" },
                inputs: { CONTENT: text("x^2 + y^2 = z^2"), FONT_SIZE: number(48) },
              }, "DOWN", 2)) },
              next: { block: {
                type: "visual_python_manim_play_list",
                inputs: {
                  ANIMATIONS: input({
                    type: "python_list_collection", extraState: { itemCount: 3 },
                    inputs: { ITEM0: input(write("title")), ITEM1: input(write("tex_line")), ITEM2: input(write("formula")) },
                  }),
                  RUN_TIME: number(3), LAG_RATIO: number(0.35),
                },
                next: { block: { type: "visual_python_manim_wait", inputs: { SECONDS: number(1) } } },
              } },
            } },
          } },
        } } },
      }],
    },
  },
};
