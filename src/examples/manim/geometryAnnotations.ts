import type { ExampleProject } from "../types";
import { assign, chain, create, direction, number, play, raw, ref, sceneWorkspace, text, wait } from "./workspaceHelpers";

export const geometryAnnotationsExample: ExampleProject = {
  id: "manim-annotations", title: "Geometry annotations", projectName: "manim-geometry-annotations.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("GeometryAnnotations", "Scene", chain(
    assign("base", { type: "visual_python_manim_line_segment_object", fields: { COLOR: "BLUE" }, inputs: { START: raw("ORIGIN"), END: raw("RIGHT * 3") } }),
    assign("vertical", { type: "visual_python_manim_line_segment_object", fields: { COLOR: "GREEN" }, inputs: { START: raw("ORIGIN"), END: raw("UP * 2") } }),
    assign("right_angle", { type: "visual_python_manim_right_angle", fields: { COLOR: "YELLOW" }, inputs: { LINE1: ref("base"), LINE2: ref("vertical"), LENGTH: number(0.35) } }),
    assign("brace", { type: "visual_python_manim_brace_label", inputs: { TARGET: ref("base"), LABEL: text("3 units"), DIRECTION: direction("DOWN") } }),
    { type: "visual_python_manim_add_two", inputs: { FIRST: ref("base"), SECOND: ref("vertical") } }, play(create("right_angle")), play(create("brace")), wait(),
  )),
};
