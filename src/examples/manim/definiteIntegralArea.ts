import type { ExampleProject } from "../types";
import { assign, chain, create, direction, formula, input, number, play, point, range, raw, ref, sceneWorkspace, wait } from "./workspaceHelpers";

const mathAt = (content: string, x: number, y: number, color: string, fontSize = 42) => ({
  type: "visual_python_manim_move_to",
  inputs: {
    MOBJECT: input({ type: "visual_python_manim_mathtex_object", fields: { COLOR: color }, inputs: { CONTENT: formula(content), FONT_SIZE: number(fontSize) } }),
    POINT: input(point(x, y)),
  },
});

export const definiteIntegralAreaExample: ExampleProject = {
  id: "manim-definite-integral-area",
  title: "定积分与曲线面积",
  projectName: "manim-definite-integral-area.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("DefiniteIntegralArea", "Scene", chain(
    assign("axes", { type: "visual_python_manim_axes_object", inputs: { X_RANGE: range(-4, 4, 1), Y_RANGE: range(0, 5, 1), X_LENGTH: number(7), Y_LENGTH: number(4.8) } }),
    assign("graph", { type: "visual_python_manim_axes_plot", fields: { COLOR: "YELLOW" }, inputs: { AXES: ref("axes"), FUNCTION: raw("lambda x: 0.5 * x**2 + 1"), X_RANGE: range(-2.5, 2.5) } }),
    assign("area", { type: "visual_python_manim_axes_area", fields: { COLOR: "BLUE" }, inputs: { AXES: ref("axes"), GRAPH: ref("graph"), X_RANGE: range(-2, 2) } }),
    assign("left_bound", { type: "visual_python_manim_dashed_line_object", fields: { COLOR: "RED" }, inputs: { START: input({ type: "visual_python_manim_axes_c2p", inputs: { AXES: ref("axes"), X: number(-2), Y: number(0) } }), END: input({ type: "visual_python_manim_axes_c2p", inputs: { AXES: ref("axes"), X: number(-2), Y: number(3) } }), DASH_LENGTH: number(0.08) } }),
    assign("right_bound", { type: "visual_python_manim_dashed_line_object", fields: { COLOR: "RED" }, inputs: { START: input({ type: "visual_python_manim_axes_c2p", inputs: { AXES: ref("axes"), X: number(2), Y: number(0) } }), END: input({ type: "visual_python_manim_axes_c2p", inputs: { AXES: ref("axes"), X: number(2), Y: number(3) } }), DASH_LENGTH: number(0.08) } }),
    assign("formula", mathAt("\\int_{-2}^{2}(0.5x^2+1)\\,dx", 4.2, 1.4, "WHITE", 40)),
    assign("result", mathAt("=\\frac{20}{3}", 4.2, 0.35, "GREEN", 48)),
    play(create("axes", 1.2)),
    play(create("graph", 1.4)),
    play(create("left_bound", 0.6)),
    play(create("right_bound", 0.6)),
    play({ type: "visual_python_manim_fade_in_animation", inputs: { MOBJECT: ref("area"), SHIFT: direction("ORIGIN"), SCALE: number(1), RUN_TIME: number(1.2) } }),
    play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref("formula"), RUN_TIME: number(1.2) } }),
    play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref("result"), RUN_TIME: number(0.9) } }),
    wait(1.5),
  )),
};
