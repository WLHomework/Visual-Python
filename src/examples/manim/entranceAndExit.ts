import type { ExampleProject } from "../types";

type Block = Record<string, any> & { next?: { block: Block } };
const input = (block: object) => ({ block });
const number = (value: number) => input({ type: "math_number", fields: { NUM: value } });
const direction = (value: string) => input({ type: "visual_python_manim_direction_constant", fields: { VALUE: value } });
const reference = (name: string): Block => ({ type: "visual_python_manim_object_ref", fields: { VAR: name } });
const shifted = (mobject: object, value: "LEFT" | "RIGHT") => ({
  type: "visual_python_manim_shift",
  inputs: { MOBJECT: input(mobject), VECTOR: input({ type: "visual_python_manim_scaled_direction", fields: { DIRECTION: value }, inputs: { SCALE: number(2) } }) },
});
const chain = (blocks: Block[]) => { blocks.slice(0, -1).forEach((block, index) => { block.next = { block: blocks[index + 1] }; }); return blocks[0]; };
const playTwo = (first: object, second: object): Block => ({
  type: "visual_python_manim_play_two",
  inputs: { FIRST: input(first), SECOND: input(second), RUN_TIME: number(1.5), LAG_RATIO: number(0) },
});

export const entranceAndExitExample: ExampleProject = {
  id: "manim-entrance-exit",
  title: "入场与出场动画",
  projectName: "manim-entrance-and-exit.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: {
    blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_scene", x: 96, y: 72,
      fields: { NAME: "EntranceAndExit", SCENE_TYPE: "Scene" },
      inputs: { BODY: { block: chain([
        {
          type: "visual_python_manim_assign", fields: { VAR: "circle" },
          inputs: { MOBJECT: input(shifted({ type: "visual_python_manim_circle_object", fields: { COLOR: "BLUE" }, inputs: { RADIUS: number(1) } }, "LEFT")) },
        },
        {
          type: "visual_python_manim_assign", fields: { VAR: "square" },
          inputs: { MOBJECT: input(shifted({ type: "visual_python_manim_square_object", fields: { COLOR: "GREEN" }, inputs: { SIDE_LENGTH: number(2) } }, "RIGHT")) },
        },
        playTwo(
          { type: "visual_python_manim_create_object_animation", inputs: { MOBJECT: input(reference("circle")), RUN_TIME: number(1) } },
          { type: "visual_python_manim_fade_in_animation", inputs: { MOBJECT: input(reference("square")), SHIFT: direction("UP"), SCALE: number(0.5), RUN_TIME: number(1) } },
        ),
        { type: "visual_python_manim_wait", inputs: { SECONDS: number(1) } },
        playTwo(
          { type: "visual_python_manim_fade_out_animation", inputs: { MOBJECT: input(reference("circle")), SHIFT: direction("DOWN"), SCALE: number(0.5), RUN_TIME: number(1) } },
          { type: "visual_python_manim_uncreate_animation", inputs: { MOBJECT: input(reference("square")), RUN_TIME: number(1) } },
        ),
      ]) } },
    }] },
  },
};
