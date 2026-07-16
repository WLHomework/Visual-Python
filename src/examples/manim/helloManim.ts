import type { ExampleProject } from "../types";

const number = (value: number) => ({ block: { type: "math_number", fields: { NUM: value } } });
const text = (value: string) => ({ block: { type: "text", fields: { TEXT: value } } });
const objectReference = (name: string) => ({ block: { type: "visual_python_manim_object_ref", fields: { VAR: name } } });

export const helloManimExample: ExampleProject = {
  id: "manim-hello",
  title: "Hello Manim",
  projectName: "hello-manim.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: {
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: "visual_python_manim_scene",
        x: 96,
        y: 72,
        fields: { NAME: "HelloManim", SCENE_TYPE: "Scene" },
        inputs: {
          BODY: {
            block: {
              type: "visual_python_manim_assign",
              fields: { VAR: "title" },
              inputs: {
                MOBJECT: {
                  block: {
                    type: "visual_python_manim_plain_text_object",
                    fields: { COLOR: "BLUE" },
                    inputs: { CONTENT: text("Hello Manim"), FONT_SIZE: number(56) },
                  },
                },
              },
              next: {
                block: {
                  type: "visual_python_manim_play",
                  inputs: {
                    ANIMATION: {
                      block: {
                        type: "visual_python_manim_write_animation",
                        inputs: { MOBJECT: objectReference("title"), RUN_TIME: number(1.5) },
                      },
                    },
                  },
                  next: { block: { type: "visual_python_manim_wait", inputs: { SECONDS: number(1) } } },
                },
              },
            },
          },
        },
      }],
    },
  },
};
