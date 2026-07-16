import type { ExampleProject } from "../types";
import { assign, chain, input, number, point, ref, scaledDirection, sceneWorkspace, wait } from "./workspaceHelpers";

export const torusAndArrow3DExample: ExampleProject = {
  id: "manim-torus-arrow3d", title: "圆环面与 3D 箭头", projectName: "manim-torus-arrow3d.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("TorusAndArrow3D", "ThreeDScene", chain(
    assign("torus", { type: "visual_python_manim_shift", inputs: { MOBJECT: input({ type: "visual_python_manim_torus_object", fields: { COLOR: "BLUE" }, inputs: { MAJOR_RADIUS: number(1.6), MINOR_RADIUS: number(0.45), FILL_OPACITY: number(0.75) } }), VECTOR: scaledDirection("LEFT", 2) } }),
    assign("arrow", { type: "visual_python_manim_arrow3d_object", fields: { COLOR: "YELLOW" }, inputs: { START: input(point(0, 0, 0)), END: input(point(2.5, 1.5, 2)), THICKNESS: number(0.04), HEIGHT: number(0.35), BASE_RADIUS: number(0.1) } }),
    { type: "visual_python_manim_3d_camera_orientation", inputs: { PHI: input({ type: "visual_python_manim_degrees", fields: { VALUE: 65 } }), THETA: input({ type: "visual_python_manim_degrees", fields: { VALUE: 30 } }), DISTANCE: number(9) } },
    { type: "visual_python_manim_add_two", inputs: { FIRST: ref("torus"), SECOND: ref("arrow") } },
    { type: "visual_python_manim_3d_ambient_rotation", fields: { ACTION: "begin" }, inputs: { RATE: number(0.1) } }, wait(4),
  )),
};
