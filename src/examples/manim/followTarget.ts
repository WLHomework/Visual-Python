import type { ExampleProject } from "../types";
import { assign, chain, input, number, play, ref, scaledDirection, sceneWorkspace, text, wait } from "./workspaceHelpers";

export const followTargetExample: ExampleProject = {
  id: "manim-follow-target", title: "对象跟随", projectName: "manim-follow-target.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("FollowTarget", "Scene", chain(
    assign("dot", { type: "visual_python_manim_dot_object", fields: { COLOR: "BLUE" }, inputs: { POINT: scaledDirection("LEFT", 3), RADIUS: number(0.14) } }),
    assign("label", { type: "visual_python_manim_plain_text_object", fields: { COLOR: "YELLOW" }, inputs: { CONTENT: text("following"), FONT_SIZE: number(30) } }),
    { type: "visual_python_manim_follow_target_updater", inputs: { MOBJECT: ref("label"), TARGET: ref("dot"), DIRECTION: input({ type: "visual_python_manim_direction_constant", fields: { VALUE: "UP" } }) } },
    { type: "visual_python_manim_add_two", inputs: { FIRST: ref("dot"), SECOND: ref("label") } },
    play({ type: "visual_python_manim_animate_shift", inputs: { MOBJECT: ref("dot"), VECTOR: scaledDirection("RIGHT", 6), RUN_TIME: number(3) } }), wait(),
  )),
};
