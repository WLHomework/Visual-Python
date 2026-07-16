import type { ExampleProject } from "../types";

type Block = Record<string, any> & { next?: { block: Block } };
const input = (block: object) => ({ block });
const number = (value: number) => input({ type: "math_number", fields: { NUM: value } });
const reference = (name: string): Block => ({ type: "visual_python_manim_object_ref", fields: { VAR: name } });
const scaledDirection = (direction: "LEFT" | "RIGHT", scale: number) => ({
  type: "visual_python_manim_scaled_direction", fields: { DIRECTION: direction }, inputs: { SCALE: number(scale) },
});
const play = (animation: object): Block => ({ type: "visual_python_manim_play", inputs: { ANIMATION: input(animation) } });
const chain = (blocks: Block[]) => { blocks.slice(0, -1).forEach((block, index) => { block.next = { block: blocks[index + 1] }; }); return blocks[0]; };

export const motionRotateScaleExample: ExampleProject = {
  id: "manim-motion",
  title: "移动旋转缩放",
  projectName: "manim-motion-rotate-scale.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: {
    blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_scene", x: 96, y: 72,
      fields: { NAME: "MotionRotateScale", SCENE_TYPE: "Scene" },
      inputs: { BODY: { block: chain([
        {
          type: "visual_python_manim_assign_add", fields: { VAR: "square" },
          inputs: { MOBJECT: input({
            type: "visual_python_manim_shift",
            inputs: {
              MOBJECT: input({ type: "visual_python_manim_square_object", fields: { COLOR: "BLUE" }, inputs: { SIDE_LENGTH: number(2) } }),
              VECTOR: input(scaledDirection("LEFT", 3)),
            },
          }) },
        },
        { type: "visual_python_manim_wait", inputs: { SECONDS: number(0.5) } },
        play({
          type: "visual_python_manim_animate_shift",
          inputs: { MOBJECT: input(reference("square")), VECTOR: input(scaledDirection("RIGHT", 6)), RUN_TIME: number(1.5) },
        }),
        play({
          type: "visual_python_manim_animate_rotate",
          inputs: { MOBJECT: input(reference("square")), ANGLE: input({ type: "visual_python_manim_degrees", fields: { VALUE: 90 } }), RUN_TIME: number(1) },
        }),
        play({
          type: "visual_python_manim_animate_scale",
          inputs: { MOBJECT: input(reference("square")), FACTOR: number(0.5), RUN_TIME: number(1) },
        }),
        { type: "visual_python_manim_wait", inputs: { SECONDS: number(1) } },
      ]) } },
    }] },
  },
};
