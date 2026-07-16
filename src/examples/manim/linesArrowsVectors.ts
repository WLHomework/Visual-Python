import type { ExampleProject } from "../types";

const input = (block: object) => ({ block });
const number = (value: number) => input({ type: "math_number", fields: { NUM: value } });
const point = (x: number, y: number, z = 0) => ({ type: "visual_python_manim_point", inputs: { X: number(x), Y: number(y), Z: number(z) } });
const reference = (name: string) => ({ type: "visual_python_manim_object_ref", fields: { VAR: name } });
const shifted = (mobject: object, direction: "UP" | "DOWN", scale: number) => ({
  type: "visual_python_manim_shift",
  inputs: { MOBJECT: input(mobject), VECTOR: input({ type: "visual_python_manim_scaled_direction", fields: { DIRECTION: direction }, inputs: { SCALE: number(scale) } }) },
});
const create = (name: string) => ({ type: "visual_python_manim_create_object_animation", inputs: { MOBJECT: input(reference(name)), RUN_TIME: number(1) } });

export const linesArrowsVectorsExample: ExampleProject = {
  id: "manim-lines-arrows",
  title: "线条箭头与向量",
  projectName: "manim-lines-arrows-vectors.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: {
    blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_scene", x: 96, y: 72,
      fields: { NAME: "LinesArrowsVectors", SCENE_TYPE: "Scene" },
      inputs: { BODY: { block: {
        type: "visual_python_manim_assign", fields: { VAR: "line" },
        inputs: { MOBJECT: input(shifted({
          type: "visual_python_manim_line_segment_object", fields: { COLOR: "BLUE" },
          inputs: { START: input(point(-2, 0)), END: input(point(2, 0)) },
        }, "UP", 2)) },
        next: { block: {
          type: "visual_python_manim_assign", fields: { VAR: "arrow" },
          inputs: { MOBJECT: input({
            type: "visual_python_manim_arrow_object", fields: { COLOR: "GREEN" },
            inputs: { START: input(point(-2, 0)), END: input(point(2, 0)), BUFF: number(0) },
          }) },
          next: { block: {
            type: "visual_python_manim_assign", fields: { VAR: "vector" },
            inputs: { MOBJECT: input(shifted({
              type: "visual_python_manim_vector_object", fields: { COLOR: "YELLOW" },
              inputs: { DIRECTION: input(point(2, 1)) },
            }, "DOWN", 2)) },
            next: { block: {
              type: "visual_python_manim_play_list",
              inputs: {
                ANIMATIONS: input({
                  type: "python_list_collection", extraState: { itemCount: 3 },
                  inputs: { ITEM0: input(create("line")), ITEM1: input(create("arrow")), ITEM2: input(create("vector")) },
                }),
                RUN_TIME: number(2), LAG_RATIO: number(0.25),
              },
              next: { block: { type: "visual_python_manim_wait", inputs: { SECONDS: number(1) } } },
            } },
          } },
        } },
      } } },
    }] },
  },
};
