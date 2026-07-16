import type { ExampleProject } from "../types";
import { assign, chain, create, direction, formula, input, list, number, play, point, ref, sceneWorkspace, text, wait } from "./workspaceHelpers";

const mathTex = (content: string, color: string, fontSize = 48) => ({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(fontSize) },
});

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const write = (name: string, seconds = 1) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const pythagoreanTheoremExample: ExampleProject = {
  id: "manim-pythagorean-theorem",
  title: "勾股定理动态证明",
  projectName: "manim-pythagorean-theorem.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("PythagoreanTheorem", "Scene", chain(
    assign("title", {
      type: "visual_python_manim_to_edge",
      inputs: {
        MOBJECT: input({ type: "visual_python_manim_plain_text_object", fields: { COLOR: "BLUE" }, inputs: { CONTENT: text("Pythagorean theorem"), FONT_SIZE: number(42) } }),
        DIRECTION: direction("UP"),
        BUFF: number(0.35),
      },
    }),
    assign("triangle", {
      type: "visual_python_manim_polygon_from_list_object",
      fields: { COLOR: "YELLOW" },
      inputs: { POINTS: list(point(-5, -2), point(-1, -2), point(-5, 1)) },
    }),
    assign("side_a", moveTo(mathTex("a=3", "GREEN", 36), -5.55, -0.5)),
    assign("side_b", moveTo(mathTex("b=4", "BLUE", 36), -3, -2.45)),
    assign("side_c", moveTo(mathTex("c=5", "YELLOW", 36), -2.65, -0.25)),
    assign("formula", moveTo(mathTex("a^2+b^2=c^2", "WHITE", 52), 3, 0.8)),
    assign("numbers", moveTo(mathTex("3^2+4^2=5^2", "BLUE", 52), 3, 0.8)),
    assign("result", moveTo(mathTex("9+16=25", "GREEN", 56), 3, 0.8)),
    write("title"),
    play(create("triangle", 1.5)),
    write("side_a", 0.6),
    write("side_b", 0.6),
    write("side_c", 0.6),
    write("formula", 1.2),
    play({ type: "visual_python_manim_transform_to_animation", inputs: { SOURCE: ref("formula"), TARGET: ref("numbers"), RUN_TIME: number(1.5) } }),
    play({ type: "visual_python_manim_transform_to_animation", inputs: { SOURCE: ref("formula"), TARGET: ref("result"), RUN_TIME: number(1.5) } }),
    wait(1.5),
  )),
};
