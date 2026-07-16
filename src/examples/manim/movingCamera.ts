import type { ExampleProject } from "../types";
import { assign, chain, create, direction, input, number, play, ref, sceneWorkspace, wait } from "./workspaceHelpers";

export const movingCameraExample: ExampleProject = {
  id: "manim-moving-camera", title: "Moving camera", projectName: "manim-moving-camera.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("MovingCameraDemo", "MovingCameraScene", chain(
    assign("square", { type: "visual_python_manim_shift", inputs: { MOBJECT: input({ type: "visual_python_manim_square_object", fields: { COLOR: "BLUE" }, inputs: { SIDE_LENGTH: number(2) } }), VECTOR: direction("RIGHT") } }),
    play(create("square")),
    play({ type: "visual_python_manim_camera_frame_animation", inputs: { TARGET: ref("square"), SCALE: number(0.6), RUN_TIME: number(2) } }), wait(),
  )),
};
