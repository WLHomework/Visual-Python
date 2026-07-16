import type { ExampleProject } from "../types";
import { assign, chain, number, play, ref, sceneWorkspace, text, wait } from "./workspaceHelpers";

const formula = (content: string, color: string) => ({ type: "visual_python_manim_mathtex_object", fields: { COLOR: color }, inputs: { CONTENT: text(content), FONT_SIZE: number(56) } });
export const formulaTransformExample: ExampleProject = {
  id: "manim-formula-transform", title: "LaTeX 公式变换", projectName: "manim-formula-transform.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("FormulaTransform", "Scene", chain(
    assign("formula", formula("a^2 + b^2 = c^2", "BLUE")),
    assign("target", formula("c = \\sqrt{a^2 + b^2}", "YELLOW")),
    play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref("formula"), RUN_TIME: number(1.5) } }),
    play({ type: "visual_python_manim_transform_to_animation", inputs: { SOURCE: ref("formula"), TARGET: ref("target"), RUN_TIME: number(2) } }), wait(),
  )),
};
