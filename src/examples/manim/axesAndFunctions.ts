import type { ExampleProject } from "../types";
import { assign, chain, create, number, play, range, raw, ref, sceneWorkspace, text, wait } from "./workspaceHelpers";

export const axesAndFunctionsExample: ExampleProject = {
  id: "manim-axes-functions", title: "Axes and functions", projectName: "manim-axes-functions.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("AxesAndFunctions", "Scene", chain(
    assign("axes", { type: "visual_python_manim_axes_object", inputs: { X_RANGE: range(-4, 4, 1), Y_RANGE: range(-2, 4, 1), X_LENGTH: number(8), Y_LENGTH: number(5) } }),
    assign("graph", { type: "visual_python_manim_axes_plot", fields: { COLOR: "BLUE" }, inputs: { AXES: ref("axes"), FUNCTION: raw("lambda x: 0.5 * x**2"), X_RANGE: range(-3, 3) } }),
    assign("labels", { type: "visual_python_manim_axis_labels", inputs: { AXES: ref("axes"), X_LABEL: text("x"), Y_LABEL: text("y") } }),
    play(create("axes")), play(create("graph")), play(create("labels")), wait(),
  )),
};
