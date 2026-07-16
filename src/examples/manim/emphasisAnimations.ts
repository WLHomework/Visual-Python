import type { ExampleProject } from "../types";

type Block = Record<string, any> & { next?: { block: Block } };
const input = (block: object) => ({ block });
const number = (value: number) => input({ type: "math_number", fields: { NUM: value } });
const text = (value: string) => input({ type: "text", fields: { TEXT: value } });
const reference = (name: string): Block => ({ type: "visual_python_manim_object_ref", fields: { VAR: name } });
const play = (animation: object): Block => ({ type: "visual_python_manim_play", inputs: { ANIMATION: input(animation) } });
const wait = (): Block => ({ type: "visual_python_manim_wait", inputs: { SECONDS: number(0.35) } });
const chain = (blocks: Block[]) => { blocks.slice(0, -1).forEach((block, index) => { block.next = { block: blocks[index + 1] }; }); return blocks[0]; };

export const emphasisAnimationsExample: ExampleProject = {
  id: "manim-emphasis",
  title: "强调动画",
  projectName: "manim-emphasis-animations.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: {
    blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_scene", x: 96, y: 72,
      fields: { NAME: "EmphasisAnimations", SCENE_TYPE: "Scene" },
      inputs: { BODY: { block: chain([
        {
          type: "visual_python_manim_assign_add", fields: { VAR: "label" },
          inputs: { MOBJECT: input({
            type: "visual_python_manim_plain_text_object", fields: { COLOR: "WHITE" },
            inputs: { CONTENT: text("Important"), FONT_SIZE: number(56) },
          }) },
        },
        play({
          type: "visual_python_manim_indicate_animation", fields: { COLOR: "YELLOW" },
          inputs: { MOBJECT: input(reference("label")), SCALE_FACTOR: number(1.25), RUN_TIME: number(1) },
        }),
        wait(),
        play({
          type: "visual_python_manim_circumscribe_animation", fields: { SHAPE: "Rectangle", COLOR: "BLUE" },
          inputs: { MOBJECT: input(reference("label")), BUFF: number(0.15), RUN_TIME: number(1) },
        }),
        wait(),
        play({
          type: "visual_python_manim_wiggle_animation",
          inputs: {
            MOBJECT: input(reference("label")), SCALE_VALUE: number(1.1),
            ROTATION_ANGLE: input({ type: "visual_python_manim_degrees", fields: { VALUE: 8 } }),
            N_WIGGLES: number(6), RUN_TIME: number(1.5),
          },
        }),
        { type: "visual_python_manim_wait", inputs: { SECONDS: number(1) } },
      ]) } },
    }] },
  },
};
