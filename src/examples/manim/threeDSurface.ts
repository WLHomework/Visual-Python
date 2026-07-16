import type { ExampleProject } from "../types";
import { assign, chain, input, number, range, raw, ref, sceneWorkspace, wait } from "./workspaceHelpers";

export const threeDSurfaceExample: ExampleProject = {
  id: "manim-3d-surface", title: "3D surface", projectName: "manim-3d-surface.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("ThreeDSurface", "ThreeDScene", chain(
    assign("axes", { type: "visual_python_manim_three_d_axes_object", inputs: { X_RANGE: range(-4, 4, 1), Y_RANGE: range(-4, 4, 1), Z_RANGE: range(-2, 2, 1) } }),
    assign("surface", { type: "visual_python_manim_parametric_surface", fields: { COLOR: "BLUE" }, inputs: { FUNCTION: raw("lambda u, v: np.array([u, v, 0.5 * np.sin(u) * np.cos(v)])"), U_RANGE: range(-3, 3), V_RANGE: range(-3, 3), RESOLUTION: number(24) } }),
    { type: "visual_python_manim_3d_camera_orientation", inputs: { PHI: input({ type: "visual_python_manim_degrees", fields: { VALUE: 65 } }), THETA: input({ type: "visual_python_manim_degrees", fields: { VALUE: 30 } }), DISTANCE: number(9) } },
    { type: "visual_python_manim_add_two", inputs: { FIRST: ref("axes"), SECOND: ref("surface") } }, { type: "visual_python_manim_3d_ambient_rotation", fields: { ACTION: "begin" }, inputs: { RATE: number(0.1) } }, wait(4),
  )),
};
