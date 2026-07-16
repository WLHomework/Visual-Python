import type { ExampleProject } from "../types";
import { assign, chain, input, number, range, ref, sceneWorkspace, wait } from "./workspaceHelpers";

const angle = (value: number) => input({ type: "visual_python_manim_degrees", fields: { VALUE: value } });
export const threeDCameraMotionExample: ExampleProject = {
  id: "manim-3d-camera-motion", title: "3D 相机运动", projectName: "manim-3d-camera-motion.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("ThreeDCameraMotion", "ThreeDScene", chain(
    assign("axes", { type: "visual_python_manim_three_d_axes_object", inputs: { X_RANGE: range(-4, 4, 1), Y_RANGE: range(-4, 4, 1), Z_RANGE: range(-4, 4, 1) } }),
    assign("cube", { type: "visual_python_manim_cube_object", fields: { COLOR: "BLUE" }, inputs: { SIDE_LENGTH: number(2), FILL_OPACITY: number(0.65) } }),
    { type: "visual_python_manim_3d_camera_orientation", inputs: { PHI: angle(60), THETA: angle(-45), DISTANCE: number(9) } },
    { type: "visual_python_manim_add_two", inputs: { FIRST: ref("axes"), SECOND: ref("cube") } }, wait(1),
    { type: "visual_python_manim_3d_move_camera", inputs: { PHI: angle(75), THETA: angle(45), DISTANCE: number(7), RUN_TIME: number(3) } },
    { type: "visual_python_manim_3d_ambient_rotation", fields: { ACTION: "begin" }, inputs: { RATE: number(0.15) } }, wait(3),
    { type: "visual_python_manim_3d_ambient_rotation", fields: { ACTION: "stop" }, inputs: { RATE: number(0.15) } },
  )),
};
