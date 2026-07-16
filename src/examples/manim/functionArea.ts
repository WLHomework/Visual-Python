import type { ExampleProject } from "../types";
import { assign, chain, create, number, play, range, raw, ref, sceneWorkspace, wait } from "./workspaceHelpers";

export const functionAreaExample: ExampleProject = {
  id: "manim-graph-area", title: "Function area", projectName: "manim-function-area.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("FunctionArea", "Scene", chain(
    assign("axes", { type: "visual_python_manim_axes_object", inputs: { X_RANGE: range(-4, 4, 1), Y_RANGE: range(0, 5, 1), X_LENGTH: number(8), Y_LENGTH: number(5) } }),
    assign("graph", { type: "visual_python_manim_axes_plot", fields: { COLOR: "YELLOW" }, inputs: { AXES: ref("axes"), FUNCTION: raw("lambda x: x**2"), X_RANGE: range(-2, 2) } }),
    assign("area", { type: "visual_python_manim_axes_area", fields: { COLOR: "BLUE" }, inputs: { AXES: ref("axes"), GRAPH: ref("graph"), X_RANGE: range(-2, 2) } }),
    { type: "visual_python_manim_add", inputs: { MOBJECT: ref("axes") } }, play(create("graph")), play({ type: "visual_python_manim_fade_in_animation", inputs: { MOBJECT: ref("area"), SHIFT: raw("ORIGIN"), SCALE: number(1), RUN_TIME: number(1) } }), wait(),
  )),
};
