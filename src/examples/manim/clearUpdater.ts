import type { ExampleProject } from "../types";
import { assign, chain, direction, number, play, ref, scaledDirection, sceneWorkspace, text, wait } from "./workspaceHelpers";

export const clearUpdaterExample: ExampleProject = {
  id: "manim-clear-updater", title: "清除更新器", projectName: "manim-clear-updater.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("ClearUpdater", "Scene", chain(
    assign("dot", { type: "visual_python_manim_dot_object", fields: { COLOR: "BLUE" }, inputs: { POINT: scaledDirection("LEFT", 3), RADIUS: number(0.14) } }),
    assign("label", { type: "visual_python_manim_plain_text_object", fields: { COLOR: "YELLOW" }, inputs: { CONTENT: text("attached"), FONT_SIZE: number(30) } }),
    { type: "visual_python_manim_follow_target_updater", inputs: { MOBJECT: ref("label"), TARGET: ref("dot"), DIRECTION: direction("UP") } },
    { type: "visual_python_manim_add_two", inputs: { FIRST: ref("dot"), SECOND: ref("label") } },
    play({ type: "visual_python_manim_animate_shift", inputs: { MOBJECT: ref("dot"), VECTOR: scaledDirection("RIGHT", 3), RUN_TIME: number(1.5) } }),
    { type: "visual_python_manim_clear_updaters", inputs: { MOBJECT: ref("label") } },
    play({ type: "visual_python_manim_animate_shift", inputs: { MOBJECT: ref("dot"), VECTOR: scaledDirection("RIGHT", 3), RUN_TIME: number(1.5) } }), wait(),
  )),
};
