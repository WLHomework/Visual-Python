import type { ExampleProject } from "../types";
import { assign, chain, degrees, input, list, number, ref, scaledDirection, sceneWorkspace, wait } from "./workspaceHelpers";

export const arcsSectorsAnnulusExample: ExampleProject = {
  id: "manim-arcs-sectors-annulus", title: "圆弧、扇形与圆环", projectName: "manim-arcs-sectors-annulus.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("ArcsSectorsAnnulus", "Scene", chain(
    assign("arc", { type: "visual_python_manim_shift", inputs: { MOBJECT: input({ type: "visual_python_manim_arc_object", fields: { COLOR: "BLUE" }, inputs: { RADIUS: number(1.2), ANGLE: degrees(240) } }), VECTOR: scaledDirection("LEFT", 3) } }),
    assign("sector", { type: "visual_python_manim_sector_object", fields: { COLOR: "GREEN" }, inputs: { OUTER_RADIUS: number(1.2), ANGLE: degrees(120) } }),
    assign("annulus", { type: "visual_python_manim_shift", inputs: { MOBJECT: input({ type: "visual_python_manim_annulus_object", fields: { COLOR: "YELLOW" }, inputs: { INNER_RADIUS: number(0.55), OUTER_RADIUS: number(1.2) } }), VECTOR: scaledDirection("RIGHT", 3) } }),
    { type: "visual_python_manim_play_list", inputs: { ANIMATIONS: list(
      { type: "visual_python_manim_create_object_animation", inputs: { MOBJECT: ref("arc"), RUN_TIME: number(1) } },
      { type: "visual_python_manim_create_object_animation", inputs: { MOBJECT: ref("sector"), RUN_TIME: number(1) } },
      { type: "visual_python_manim_create_object_animation", inputs: { MOBJECT: ref("annulus"), RUN_TIME: number(1) } },
    ), RUN_TIME: number(2), LAG_RATIO: number(0.25) } }, wait(),
  )),
};
