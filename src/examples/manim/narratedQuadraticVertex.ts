import type { ExampleProject } from "../types";
import { assign, chain, create, formula as formulaValue, input, number, play, range, raw, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const graph = (expression: string, color: string, start: number, end: number) => ({
  type: "visual_python_manim_axes_plot",
  fields: { COLOR: color },
  inputs: { AXES: ref("axes"), FUNCTION: raw(expression), X_RANGE: range(start, end) },
});

const formula = (content: string, color: string) => ({
  type: "visual_python_manim_move_to",
  inputs: {
    MOBJECT: input({ type: "visual_python_manim_mathtex_object", fields: { COLOR: color }, inputs: { CONTENT: formulaValue(content), FONT_SIZE: number(44) } }),
    POINT: input({ type: "visual_python_manim_point", inputs: { X: number(3.8), Y: number(2.7), Z: number(0) } }),
  },
});

const transform = (source: string, target: string, seconds: number) => play({
  type: "visual_python_manim_transform_to_animation",
  inputs: { SOURCE: ref(source), TARGET: ref(target), RUN_TIME: number(seconds) },
});

const write = (name: string, seconds = 1) => play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) } });

export const narratedQuadraticVertexExample: ExampleProject = {
  id: "manim-narrated-quadratic-vertex",
  title: "配音讲解：二次函数顶点移动",
  projectName: "narrated-quadratic-vertex.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedQuadraticVertex", "Scene", chain(
    assign("axes", { type: "visual_python_manim_axes_object", inputs: { X_RANGE: range(-4, 5, 1), Y_RANGE: range(-2, 7, 1), X_LENGTH: number(8.5), Y_LENGTH: number(5.8) } }),
    assign("base_graph", graph("lambda x: x**2", "BLUE", -2.3, 2.3)),
    assign("right_graph", graph("lambda x: (x - 1)**2", "YELLOW", -1.3, 3.3)),
    assign("up_graph", graph("lambda x: (x - 1)**2 + 2", "GREEN", -1.2, 3.2)),
    assign("base_formula", formula("y=x^2", "BLUE")),
    assign("right_formula", formula("y=(x-1)^2", "YELLOW")),
    assign("up_formula", formula("y=(x-1)^2+2", "GREEN")),
    voiceoverWithAnimation("我们从最基本的二次函数，y 等于 x 的平方开始。", chain(play(create("axes", 1.2)), play(create("base_graph", 1.5)), write("base_formula", 0.8)), "default", "quadratic-vertex-base"),
    voiceover("它的顶点位于坐标原点，开口向上。", "default", "quadratic-vertex-origin"),
    voiceoverWithAnimation("当公式变成 y 等于 x 减一的平方，顶点向右移动一个单位。", chain(transform("base_graph", "right_graph", 1.8), transform("base_formula", "right_formula", 1.1)), "default", "quadratic-vertex-right"),
    voiceoverWithAnimation("再在公式末尾加二，整条抛物线连同顶点一起向上移动两个单位。", chain(transform("base_graph", "up_graph", 1.8), transform("base_formula", "up_formula", 1.1)), "default", "quadratic-vertex-up"),
    voiceover("在顶点式 y 等于 a 乘以 x 减 h 的平方加 k 中，h 控制水平位置，k 控制竖直位置。", "default", "quadratic-vertex-summary"),
    wait(0.8),
  )),
};
