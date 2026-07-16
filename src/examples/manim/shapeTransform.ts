import type { ExampleProject } from "../types";

type Block = Record<string, any> & { next?: { block: Block } };
const input = (block: object) => ({ block });
const number = (value: number) => input({ type: "math_number", fields: { NUM: value } });
const reference = (name: string): Block => ({ type: "visual_python_manim_object_ref", fields: { VAR: name } });
const play = (animation: object): Block => ({ type: "visual_python_manim_play", inputs: { ANIMATION: input(animation) } });
const wait = (seconds: number): Block => ({ type: "visual_python_manim_wait", inputs: { SECONDS: number(seconds) } });
const chain = (blocks: Block[]) => { blocks.slice(0, -1).forEach((block, index) => { block.next = { block: blocks[index + 1] }; }); return blocks[0]; };

export const shapeTransformExample: ExampleProject = {
  id: "manim-transform",
  title: "图形变换",
  projectName: "manim-shape-transform.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: {
    blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_scene", x: 96, y: 72,
      fields: { NAME: "ShapeTransform", SCENE_TYPE: "Scene" },
      inputs: { BODY: { block: chain([
        {
          type: "visual_python_manim_assign", fields: { VAR: "circle" },
          inputs: { MOBJECT: input({ type: "visual_python_manim_circle_object", fields: { COLOR: "BLUE" }, inputs: { RADIUS: number(1.5) } }) },
        },
        {
          type: "visual_python_manim_assign", fields: { VAR: "square" },
          inputs: { MOBJECT: input({ type: "visual_python_manim_square_object", fields: { COLOR: "GREEN" }, inputs: { SIDE_LENGTH: number(2.5) } }) },
        },
        {
          type: "visual_python_manim_assign", fields: { VAR: "triangle" },
          inputs: { MOBJECT: input({ type: "visual_python_manim_triangle_object", fields: { COLOR: "YELLOW" } }) },
        },
        play({ type: "visual_python_manim_create_object_animation", inputs: { MOBJECT: input(reference("circle")), RUN_TIME: number(1) } }),
        play({ type: "visual_python_manim_transform_to_animation", inputs: { SOURCE: input(reference("circle")), TARGET: input(reference("square")), RUN_TIME: number(1.5) } }),
        wait(0.5),
        play({ type: "visual_python_manim_replacement_transform_animation", inputs: { SOURCE: input(reference("circle")), TARGET: input(reference("triangle")), RUN_TIME: number(1.5) } }),
        wait(1),
      ]) } },
    }] },
  },
};
