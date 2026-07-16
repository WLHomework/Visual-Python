import type { ExampleProject } from "../types";
import { assign, chain, input, number, range, ref, scaledDirection, sceneWorkspace, wait } from "./workspaceHelpers";

export const numberLineAndGridExample: ExampleProject = {
  id: "manim-number-line-grid", title: "数轴与平面网格", projectName: "manim-number-line-grid.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NumberLineAndGrid", "Scene", chain(
    assign("grid", { type: "visual_python_manim_number_plane_object", inputs: { X_RANGE: range(-6, 6, 1), Y_RANGE: range(-3, 3, 1), X_LENGTH: number(12), Y_LENGTH: number(6) } }),
    assign("number_line", { type: "visual_python_manim_shift", inputs: { MOBJECT: input({ type: "visual_python_manim_number_line_object", inputs: { X_RANGE: range(-5, 5, 1), LENGTH: number(9) } }), VECTOR: scaledDirection("DOWN", 2.3) } }),
    { type: "visual_python_manim_add_two", inputs: { FIRST: ref("grid"), SECOND: ref("number_line") } }, wait(),
  )),
};
