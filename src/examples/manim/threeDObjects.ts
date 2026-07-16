import type { ExampleProject } from "../types";
import { assign, chain, direction, input, number, range, ref, sceneWorkspace, wait } from "./workspaceHelpers";

export const threeDObjectsExample: ExampleProject = {
  id: "manim-3d-objects", title: "3D objects and camera", projectName: "manim-3d-objects.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("ThreeDObjects", "ThreeDScene", chain(
    assign("axes", { type: "visual_python_manim_three_d_axes_object", inputs: { X_RANGE: range(-4, 4, 1), Y_RANGE: range(-4, 4, 1), Z_RANGE: range(-4, 4, 1) } }),
    assign("cube", { type: "visual_python_manim_cube_object", fields: { COLOR: "BLUE" }, inputs: { SIDE_LENGTH: number(2), FILL_OPACITY: number(0.65) } }),
    assign("sphere", { type: "visual_python_manim_shift", inputs: { MOBJECT: input({ type: "visual_python_manim_sphere_object", fields: { COLOR: "GREEN" }, inputs: { RADIUS: number(1), FILL_OPACITY: number(0.65) } }), VECTOR: direction("RIGHT") } }),
    { type: "visual_python_manim_3d_camera_orientation", inputs: { PHI: input({ type: "visual_python_manim_degrees", fields: { VALUE: 70 } }), THETA: input({ type: "visual_python_manim_degrees", fields: { VALUE: 35 } }), DISTANCE: number(8) } },
    { type: "visual_python_manim_add_two", inputs: { FIRST: ref("axes"), SECOND: ref("cube") } }, { type: "visual_python_manim_add", inputs: { MOBJECT: ref("sphere") } },
    { type: "visual_python_manim_3d_ambient_rotation", fields: { ACTION: "begin" }, inputs: { RATE: number(0.15) } }, wait(3), { type: "visual_python_manim_3d_ambient_rotation", fields: { ACTION: "stop" }, inputs: { RATE: number(0.15) } },
  )),
};
