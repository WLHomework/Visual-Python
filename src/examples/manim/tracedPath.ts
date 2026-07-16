import type { ExampleProject } from "../types";
import { assign, chain, direction, number, play, ref, sceneWorkspace, wait } from "./workspaceHelpers";

export const tracedPathExample: ExampleProject = {
  id: "manim-traced-path", title: "Traced path", projectName: "manim-traced-path.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("TracedPathDemo", "Scene", chain(
    assign("dot", { type: "visual_python_manim_dot_object", fields: { COLOR: "BLUE" }, inputs: { POINT: direction("LEFT"), RADIUS: number(0.12) } }),
    assign("trace", { type: "visual_python_manim_traced_path", fields: { COLOR: "YELLOW" }, inputs: { TARGET: ref("dot"), WIDTH: number(4) } }),
    { type: "visual_python_manim_add_two", inputs: { FIRST: ref("trace"), SECOND: ref("dot") } },
    play({ type: "visual_python_manim_animate_shift", inputs: { MOBJECT: ref("dot"), VECTOR: direction("RIGHT"), RUN_TIME: number(3) } }), wait(),
  )),
};
