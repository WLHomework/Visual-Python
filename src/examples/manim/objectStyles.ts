import type { ExampleProject } from "../types";
import { assign, chain, input, number, ref, sceneWorkspace, wait } from "./workspaceHelpers";

export const objectStylesExample: ExampleProject = {
  id: "manim-object-styles", title: "颜色、填充与描边", projectName: "manim-object-styles.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("ObjectStyles", "Scene", chain(
    assign("shape", { type: "visual_python_manim_set_opacity", inputs: { MOBJECT: input({ type: "visual_python_manim_set_stroke", fields: { COLOR: "YELLOW" }, inputs: { MOBJECT: input({ type: "visual_python_manim_set_fill", fields: { COLOR: "BLUE" }, inputs: { MOBJECT: input({ type: "visual_python_manim_circle_object", fields: { COLOR: "WHITE" }, inputs: { RADIUS: number(1.8) } }), OPACITY: number(0.75) } }), WIDTH: number(8), OPACITY: number(1) } }), OPACITY: number(0.9) } }),
    { type: "visual_python_manim_add", inputs: { MOBJECT: ref("shape") } }, wait(),
  )),
};
