import type { ExampleProject } from "../types";
import { assign, chain, number, play, raw, ref, sceneWorkspace, wait } from "./workspaceHelpers";

export const dynamicRedrawExample: ExampleProject = {
  id: "manim-always-redraw", title: "Dynamic redraw", projectName: "manim-dynamic-redraw.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("DynamicRedraw", "Scene", chain(
    assign("tracker", { type: "visual_python_manim_value_tracker", inputs: { VALUE: number(-3) } }),
    assign("dot", { type: "visual_python_manim_always_redraw", inputs: { MOBJECT: raw("Dot(RIGHT * tracker.get_value(), color=YELLOW)") } }),
    { type: "visual_python_manim_add", inputs: { MOBJECT: ref("dot") } },
    play({ type: "visual_python_manim_tracker_set_value_animation", inputs: { TRACKER: ref("tracker"), VALUE: number(3) } }), wait(),
  )),
};
