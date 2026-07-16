import type { ExampleProject } from "../types";
import { assign, chain, direction, input, number, ref, scaledDirection, sceneWorkspace, wait } from "./workspaceHelpers";

export const threeDSolidCollectionExample: ExampleProject = {
  id: "manim-3d-solid-collection", title: "3D 实体组合", projectName: "manim-3d-solid-collection.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("ThreeDSolidCollection", "ThreeDScene", chain(
    assign("cube", { type: "visual_python_manim_shift", inputs: { MOBJECT: input({ type: "visual_python_manim_cube_object", fields: { COLOR: "BLUE" }, inputs: { SIDE_LENGTH: number(1.6), FILL_OPACITY: number(0.7) } }), VECTOR: scaledDirection("LEFT", 3) } }),
    assign("sphere", { type: "visual_python_manim_sphere_object", fields: { COLOR: "GREEN" }, inputs: { RADIUS: number(1), FILL_OPACITY: number(0.7) } }),
    assign("cone", { type: "visual_python_manim_shift", inputs: { MOBJECT: input({ type: "visual_python_manim_cone_object", fields: { COLOR: "YELLOW", SHOW_BASE: "TRUE" }, inputs: { BASE_RADIUS: number(1), HEIGHT: number(2), DIRECTION: direction("OUT") } }), VECTOR: scaledDirection("RIGHT", 3) } }),
    { type: "visual_python_manim_3d_camera_orientation", inputs: { PHI: input({ type: "visual_python_manim_degrees", fields: { VALUE: 70 } }), THETA: input({ type: "visual_python_manim_degrees", fields: { VALUE: 35 } }), DISTANCE: number(10) } },
    { type: "visual_python_manim_add_two", inputs: { FIRST: ref("cube"), SECOND: ref("sphere") } }, { type: "visual_python_manim_add", inputs: { MOBJECT: ref("cone") } },
    { type: "visual_python_manim_3d_ambient_rotation", fields: { ACTION: "begin" }, inputs: { RATE: number(0.12) } }, wait(4), { type: "visual_python_manim_3d_ambient_rotation", fields: { ACTION: "stop" }, inputs: { RATE: number(0.12) } },
  )),
};
