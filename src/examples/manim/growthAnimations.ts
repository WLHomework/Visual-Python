import type { ExampleProject } from "../types";
import { assign, chain, degrees, direction, number, play, ref, sceneWorkspace, wait } from "./workspaceHelpers";

export const growthAnimationsExample: ExampleProject = {
  id: "manim-growth-animations", title: "生长动画", projectName: "manim-growth-animations.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("GrowthAnimations", "Scene", chain(
    assign("circle", { type: "visual_python_manim_circle_object", fields: { COLOR: "BLUE" }, inputs: { RADIUS: number(1) } }),
    assign("square", { type: "visual_python_manim_square_object", fields: { COLOR: "GREEN" }, inputs: { SIDE_LENGTH: number(2) } }),
    assign("arrow", { type: "visual_python_manim_arrow_object", fields: { COLOR: "YELLOW" }, inputs: { START: direction("LEFT"), END: direction("RIGHT"), BUFF: number(0) } }),
    play({ type: "visual_python_manim_grow_from_center_animation", inputs: { MOBJECT: ref("circle"), RUN_TIME: number(1) } }),
    play({ type: "visual_python_manim_spin_in_from_nothing_animation", inputs: { MOBJECT: ref("square"), ANGLE: degrees(180), RUN_TIME: number(1) } }),
    play({ type: "visual_python_manim_grow_arrow_animation", inputs: { ARROW: ref("arrow"), RUN_TIME: number(1.5) } }), wait(),
  )),
};
