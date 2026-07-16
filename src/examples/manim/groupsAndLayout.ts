import type { ExampleProject } from "../types";

const input = (block: object) => ({ block });
const number = (value: number) => input({ type: "math_number", fields: { NUM: value } });
const text = (value: string) => input({ type: "text", fields: { TEXT: value } });
const direction = (value: string) => input({ type: "visual_python_manim_direction_constant", fields: { VALUE: value } });
const reference = (name: string) => ({ type: "visual_python_manim_object_ref", fields: { VAR: name } });

export const groupsAndLayoutExample: ExampleProject = {
  id: "manim-groups",
  title: "群组与排列",
  projectName: "manim-groups-and-layout.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: {
    blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_scene", x: 96, y: 72,
      fields: { NAME: "GroupsAndLayout", SCENE_TYPE: "Scene" },
      inputs: { BODY: { block: {
        type: "visual_python_manim_assign", fields: { VAR: "shapes" },
        inputs: { MOBJECT: input({
          type: "visual_python_manim_arrange", fields: { CENTER: "TRUE" },
          inputs: {
            MOBJECT: input({
              type: "visual_python_manim_group_from_list_object",
              inputs: { OBJECTS: input({
                type: "python_list_collection", extraState: { itemCount: 3 },
                inputs: {
                  ITEM0: input({ type: "visual_python_manim_circle_object", fields: { COLOR: "BLUE" }, inputs: { RADIUS: number(0.8) } }),
                  ITEM1: input({ type: "visual_python_manim_square_object", fields: { COLOR: "GREEN" }, inputs: { SIDE_LENGTH: number(1.6) } }),
                  ITEM2: input({ type: "visual_python_manim_triangle_object", fields: { COLOR: "YELLOW" } }),
                },
              }) },
            }),
            DIRECTION: direction("RIGHT"), BUFF: number(0.75),
          },
        }) },
        next: { block: {
          type: "visual_python_manim_assign", fields: { VAR: "title" },
          inputs: { MOBJECT: input({
            type: "visual_python_manim_next_to",
            inputs: {
              MOBJECT: input({ type: "visual_python_manim_plain_text_object", fields: { COLOR: "WHITE" }, inputs: { CONTENT: text("VGroup"), FONT_SIZE: number(42) } }),
              TARGET: input(reference("shapes")), DIRECTION: direction("UP"), BUFF: number(0.6),
            },
          }) },
          next: { block: {
            type: "visual_python_manim_play_two",
            inputs: {
              FIRST: input({ type: "visual_python_manim_create_object_animation", inputs: { MOBJECT: input(reference("shapes")), RUN_TIME: number(1.5) } }),
              SECOND: input({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: input(reference("title")), RUN_TIME: number(1) } }),
              RUN_TIME: number(2), LAG_RATIO: number(0.25),
            },
            next: { block: { type: "visual_python_manim_wait", inputs: { SECONDS: number(1) } } },
          } },
        } },
      } } },
    }] },
  },
};
