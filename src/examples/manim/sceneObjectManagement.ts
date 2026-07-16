import type { ExampleProject } from "../types";

type Block = Record<string, any> & { next?: { block: Block } };
const input = (block: object) => ({ block });
const number = (value: number) => input({ type: "math_number", fields: { NUM: value } });
const reference = (name: string): Block => ({ type: "visual_python_manim_object_ref", fields: { VAR: name } });
const shifted = (mobject: object, direction: "LEFT" | "RIGHT") => ({
  type: "visual_python_manim_shift",
  inputs: { MOBJECT: input(mobject), VECTOR: input({ type: "visual_python_manim_scaled_direction", fields: { DIRECTION: direction }, inputs: { SCALE: number(2) } }) },
});
const wait = (seconds: number): Block => ({ type: "visual_python_manim_wait", inputs: { SECONDS: number(seconds) } });
const chain = (blocks: Block[]) => {
  blocks.slice(0, -1).forEach((block, index) => { block.next = { block: blocks[index + 1] }; });
  return blocks[0];
};

export const sceneObjectManagementExample: ExampleProject = {
  id: "manim-scene-objects",
  title: "场景对象管理",
  projectName: "manim-scene-objects.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: {
    blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_scene", x: 96, y: 72,
      fields: { NAME: "SceneObjects", SCENE_TYPE: "Scene" },
      inputs: { BODY: { block: chain([
        {
          type: "visual_python_manim_assign", fields: { VAR: "circle" },
          inputs: { MOBJECT: input(shifted({ type: "visual_python_manim_circle_object", fields: { COLOR: "BLUE" }, inputs: { RADIUS: number(1) } }, "LEFT")) },
        },
        {
          type: "visual_python_manim_assign", fields: { VAR: "square" },
          inputs: { MOBJECT: input(shifted({ type: "visual_python_manim_square_object", fields: { COLOR: "GREEN" }, inputs: { SIDE_LENGTH: number(2) } }, "RIGHT")) },
        },
        { type: "visual_python_manim_add_two", inputs: { FIRST: input(reference("circle")), SECOND: input(reference("square")) } },
        wait(1),
        { type: "visual_python_manim_remove", inputs: { MOBJECT: input(reference("circle")) } },
        wait(1),
        { type: "visual_python_manim_add", inputs: { MOBJECT: input(reference("circle")) } },
        wait(1),
        { type: "visual_python_manim_clear" },
        wait(0.5),
      ]) } },
    }] },
  },
};
