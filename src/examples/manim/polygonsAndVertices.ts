import type { ExampleProject } from "../types";
import { assign, chain, direction, input, list, number, point, ref, sceneWorkspace, wait } from "./workspaceHelpers";

export const polygonsAndVerticesExample: ExampleProject = {
  id: "manim-polygons-vertices", title: "多边形与顶点", projectName: "manim-polygons-vertices.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("PolygonsAndVertices", "Scene", chain(
    assign("hexagon", { type: "visual_python_manim_shift", inputs: { MOBJECT: input({ type: "visual_python_manim_regular_polygon_object", fields: { COLOR: "BLUE" }, inputs: { N: number(6), RADIUS: number(1.4) } }), VECTOR: direction("LEFT") } }),
    assign("polygon", { type: "visual_python_manim_polygon_from_list_object", fields: { COLOR: "YELLOW" }, inputs: { POINTS: list(point(-1, -1), point(0, 1.4), point(1.4, 0.5), point(1, -1)) } }),
    assign("polygon", { type: "visual_python_manim_shift", inputs: { MOBJECT: ref("polygon"), VECTOR: direction("RIGHT") } }),
    { type: "visual_python_manim_add_two", inputs: { FIRST: ref("hexagon"), SECOND: ref("polygon") } }, wait(),
  )),
};
