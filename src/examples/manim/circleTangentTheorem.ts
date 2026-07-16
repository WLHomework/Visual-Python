import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, point, ref, sceneWorkspace, wait } from "./workspaceHelpers";

const mathAt = (content: string, x: number, y: number, color: string, fontSize = 42) => ({
  type: "visual_python_manim_move_to",
  inputs: {
    MOBJECT: input({ type: "visual_python_manim_mathtex_object", fields: { COLOR: color }, inputs: { CONTENT: formula(content), FONT_SIZE: number(fontSize) } }),
    POINT: input(point(x, y)),
  },
});

export const circleTangentTheoremExample: ExampleProject = {
  id: "manim-circle-tangent-theorem",
  title: "圆与切线关系",
  projectName: "manim-circle-tangent-theorem.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("CircleTangentTheorem", "Scene", chain(
    assign("title", mathAt("\\text{Radius and tangent}", 0, 3.1, "BLUE", 48)),
    assign("circle", { type: "visual_python_manim_move_to", inputs: { MOBJECT: input({ type: "visual_python_manim_circle_object", fields: { COLOR: "BLUE" }, inputs: { RADIUS: number(2) } }), POINT: input(point(-2, 0)) } }),
    assign("radius", { type: "visual_python_manim_line_segment_object", fields: { COLOR: "YELLOW" }, inputs: { START: input(point(-2, 2)), END: input(point(-2, 0)) } }),
    assign("tangent", { type: "visual_python_manim_line_segment_object", fields: { COLOR: "GREEN" }, inputs: { START: input(point(-5, 2)), END: input(point(1, 2)) } }),
    assign("center", { type: "visual_python_manim_dot_object", fields: { COLOR: "YELLOW" }, inputs: { POINT: input(point(-2, 0)), RADIUS: number(0.1) } }),
    assign("touch_point", { type: "visual_python_manim_dot_object", fields: { COLOR: "RED" }, inputs: { POINT: input(point(-2, 2)), RADIUS: number(0.11) } }),
    assign("right_angle", { type: "visual_python_manim_right_angle", fields: { COLOR: "WHITE" }, inputs: { LINE1: ref("radius"), LINE2: ref("tangent"), LENGTH: number(0.35) } }),
    assign("label_o", mathAt("O", -2.35, -0.35, "YELLOW", 34)),
    assign("label_t", mathAt("T", -1.55, 2.5, "RED", 34)),
    assign("formula", mathAt("OT\\perp\\text{ tangent}", 3.4, 0.7, "WHITE", 44)),
    assign("theorem", mathAt("\\text{A radius is perpendicular}\\\\\\text{to the tangent at }T", 3.4, -0.7, "GREEN", 34)),
    play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref("title"), RUN_TIME: number(0.8) } }),
    play(create("circle", 1.3)),
    play(create("radius", 0.9)),
    play(create("tangent", 1.2)),
    play(create("center", 0.4)),
    play(create("touch_point", 0.4)),
    play(create("right_angle", 0.7)),
    play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref("label_o"), RUN_TIME: number(0.4) } }),
    play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref("label_t"), RUN_TIME: number(0.4) } }),
    play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref("formula"), RUN_TIME: number(1) } }),
    play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref("theorem"), RUN_TIME: number(1.2) } }),
    wait(1.5),
  )),
};
