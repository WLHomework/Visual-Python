import type { ExampleProject } from "../types";
import { assign, chain, create, formula as formulaValue, input, number, play, range, raw, ref, sceneWorkspace, wait } from "./workspaceHelpers";

const graph = (formula: string, color: string) => ({
  type: "visual_python_manim_axes_plot",
  fields: { COLOR: color },
  inputs: { AXES: ref("axes"), FUNCTION: raw(formula), X_RANGE: range(-3, 3) },
});

const formula = (content: string, color: string) => ({
  type: "visual_python_manim_move_to",
  inputs: {
    MOBJECT: input({ type: "visual_python_manim_mathtex_object", fields: { COLOR: color }, inputs: { CONTENT: formulaValue(content), FONT_SIZE: number(46) } }),
    POINT: input({ type: "visual_python_manim_point", inputs: { X: number(3.7), Y: number(2.5), Z: number(0) } }),
  },
});

export const quadraticFunctionParametersExample: ExampleProject = {
  id: "manim-quadratic-function-parameters",
  title: "二次函数参数变化",
  projectName: "manim-quadratic-function-parameters.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("QuadraticFunctionParameters", "Scene", chain(
    assign("axes", { type: "visual_python_manim_axes_object", inputs: { X_RANGE: range(-4, 4, 1), Y_RANGE: range(-2, 7, 1), X_LENGTH: number(8), Y_LENGTH: number(5.5) } }),
    assign("graph", graph("lambda x: x**2", "BLUE")),
    assign("wide_graph", graph("lambda x: 0.5 * x**2", "GREEN")),
    assign("shifted_graph", graph("lambda x: (x - 1)**2 - 1", "YELLOW")),
    assign("formula", formula("y=x^2", "BLUE")),
    assign("wide_formula", formula("y=0.5x^2", "GREEN")),
    assign("shifted_formula", formula("y=(x-1)^2-1", "YELLOW")),
    play(create("axes", 1.2)),
    play(create("graph", 1.5)),
    play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref("formula"), RUN_TIME: number(0.8) } }),
    wait(0.8),
    play({ type: "visual_python_manim_transform_to_animation", inputs: { SOURCE: ref("graph"), TARGET: ref("wide_graph"), RUN_TIME: number(1.8) } }),
    play({ type: "visual_python_manim_transform_to_animation", inputs: { SOURCE: ref("formula"), TARGET: ref("wide_formula"), RUN_TIME: number(1.2) } }),
    wait(0.8),
    play({ type: "visual_python_manim_transform_to_animation", inputs: { SOURCE: ref("graph"), TARGET: ref("shifted_graph"), RUN_TIME: number(1.8) } }),
    play({ type: "visual_python_manim_transform_to_animation", inputs: { SOURCE: ref("formula"), TARGET: ref("shifted_formula"), RUN_TIME: number(1.2) } }),
    wait(1.5),
  )),
};
