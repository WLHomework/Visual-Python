import type { ExampleProject } from "../types";
import { assign, chain, input, list, number, ref, scaledDirection, sceneWorkspace, wait } from "./workspaceHelpers";

export const animationOrchestrationExample: ExampleProject = {
  id: "manim-animation-orchestration", title: "多动画编排", projectName: "manim-animation-orchestration.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("AnimationOrchestration", "Scene", chain(
    assign("circle", { type: "visual_python_manim_shift", inputs: { MOBJECT: input({ type: "visual_python_manim_circle_object", fields: { COLOR: "BLUE" }, inputs: { RADIUS: number(0.8) } }), VECTOR: scaledDirection("LEFT", 2.5) } }),
    assign("square", { type: "visual_python_manim_square_object", fields: { COLOR: "GREEN" }, inputs: { SIDE_LENGTH: number(1.6) } }),
    assign("triangle", { type: "visual_python_manim_shift", inputs: { MOBJECT: input({ type: "visual_python_manim_triangle_object", fields: { COLOR: "YELLOW" }, inputs: { SIDE_LENGTH: number(2) } }), VECTOR: scaledDirection("RIGHT", 2.5) } }),
    { type: "visual_python_manim_play_list", inputs: { ANIMATIONS: list(
      { type: "visual_python_manim_grow_from_center_animation", inputs: { MOBJECT: ref("circle"), RUN_TIME: number(1) } },
      { type: "visual_python_manim_spin_in_from_nothing_animation", inputs: { MOBJECT: ref("square"), ANGLE: input({ type: "visual_python_manim_degrees", fields: { VALUE: 180 } }), RUN_TIME: number(1) } },
      { type: "visual_python_manim_fade_in_animation", inputs: { MOBJECT: ref("triangle"), SHIFT: scaledDirection("UP", 1), SCALE: number(0.5), RUN_TIME: number(1) } },
    ), RUN_TIME: number(3), LAG_RATIO: number(0.4) } }, wait(),
  )),
};
