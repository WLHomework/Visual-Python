import type { ExampleProject } from "../types";
import { assign, chain, number, play, ref, sceneWorkspace, wait } from "./workspaceHelpers";

export const valueTrackerExample: ExampleProject = {
  id: "manim-value-tracker", title: "Value tracker", projectName: "manim-value-tracker.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("ValueTrackerDemo", "Scene", chain(
    assign("tracker", { type: "visual_python_manim_value_tracker", inputs: { VALUE: number(0) } }),
    assign("number_display", { type: "visual_python_manim_decimal_follow_tracker", inputs: { TRACKER: ref("tracker"), PLACES: number(1) } }),
    { type: "visual_python_manim_add", inputs: { MOBJECT: ref("number_display") } },
    play({ type: "visual_python_manim_tracker_set_value_animation", inputs: { TRACKER: ref("tracker"), VALUE: number(10) } }), wait(),
  )),
};
