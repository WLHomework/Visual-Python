import type { ExampleProject } from "../types";

const input = (block: object) => ({ block });
const number = (value: number) => input({ type: "math_number", fields: { NUM: value } });
const reference = (name: string) => ({ type: "visual_python_manim_object_ref", fields: { VAR: name } });
const shifted = (mobject: object, direction: "LEFT" | "RIGHT") => ({
  type: "visual_python_manim_shift",
  inputs: {
    MOBJECT: input(mobject),
    VECTOR: input({ type: "visual_python_manim_scaled_direction", fields: { DIRECTION: direction }, inputs: { SCALE: number(3) } }),
  },
});
const createAnimation = (name: string) => ({
  type: "visual_python_manim_create_object_animation",
  inputs: { MOBJECT: input(reference(name)), RUN_TIME: number(1) },
});

export const basicShapesExample: ExampleProject = {
  id: "manim-basic-shapes",
  title: "基础几何图形",
  projectName: "manim-basic-shapes.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: {
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: "visual_python_manim_scene",
        x: 96,
        y: 72,
        fields: { NAME: "BasicShapes", SCENE_TYPE: "Scene" },
        inputs: { BODY: { block: {
          type: "visual_python_manim_assign", fields: { VAR: "circle" },
          inputs: { MOBJECT: input(shifted({ type: "visual_python_manim_circle_object", fields: { COLOR: "BLUE" }, inputs: { RADIUS: number(1) } }, "LEFT")) },
          next: { block: {
            type: "visual_python_manim_assign", fields: { VAR: "square" },
            inputs: { MOBJECT: input({ type: "visual_python_manim_square_object", fields: { COLOR: "GREEN" }, inputs: { SIDE_LENGTH: number(2) } }) },
            next: { block: {
              type: "visual_python_manim_assign", fields: { VAR: "triangle" },
              inputs: { MOBJECT: input(shifted({ type: "visual_python_manim_triangle_object", fields: { COLOR: "YELLOW" } }, "RIGHT")) },
              next: { block: {
                type: "visual_python_manim_play_list",
                inputs: {
                  ANIMATIONS: input({
                    type: "python_list_collection", extraState: { itemCount: 3 },
                    inputs: { ITEM0: input(createAnimation("circle")), ITEM1: input(createAnimation("square")), ITEM2: input(createAnimation("triangle")) },
                  }),
                  RUN_TIME: number(1.5), LAG_RATIO: number(0.15),
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
