import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, range, raw, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const c2p = (x: number, y: number) => input({ type: "visual_python_manim_axes_c2p", inputs: { AXES: ref("axes"), X: number(x), Y: number(y) } });
const dot = (x: number, y: number, color: string) => ({ type: "visual_python_manim_dot_object", fields: { COLOR: color }, inputs: { POINT: c2p(x, y), RADIUS: number(0.1) } });
const line = (x1: number, y1: number, x2: number, y2: number, color: string) => ({ type: "visual_python_manim_line_segment_object", fields: { COLOR: color }, inputs: { START: c2p(x1, y1), END: c2p(x2, y2) } });
const transform = (source: string, target: string, seconds: number) => play({ type: "visual_python_manim_transform_to_animation", inputs: { SOURCE: ref(source), TARGET: ref(target), RUN_TIME: number(seconds) } });
const write = (name: string, seconds = 1) => play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) } });

export const narratedDerivativeGeometryExample: ExampleProject = {
  id: "manim-narrated-derivative-geometry",
  title: "配音讲解：导数的几何意义",
  projectName: "narrated-derivative-geometry.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedDerivativeGeometry", "Scene", chain(
    assign("axes", { type: "visual_python_manim_axes_object", inputs: { X_RANGE: range(-2, 4, 1), Y_RANGE: range(-2, 6, 1), X_LENGTH: number(8), Y_LENGTH: number(6) } }),
    assign("curve", { type: "visual_python_manim_axes_plot", fields: { COLOR: "BLUE" }, inputs: { AXES: ref("axes"), FUNCTION: raw("lambda x: 0.5 * x**2"), X_RANGE: range(-1.8, 3.3) } }),
    assign("point_p", dot(1, 0.5, "YELLOW")),
    assign("point_q", dot(3, 4.5, "RED")),
    assign("point_q_close", dot(1.7, 1.445, "RED")),
    assign("secant", line(0.4, -0.7, 3.2, 4.9, "RED")),
    assign("secant_close", line(-0.2, -1.12, 3.1, 3.335, "YELLOW")),
    assign("tangent", line(-1, -1.5, 3, 2.5, "GREEN")),
    assign("formula", {
      type: "visual_python_manim_to_corner",
      inputs: { MOBJECT: input({ type: "visual_python_manim_mathtex_object", fields: { COLOR: "WHITE" }, inputs: { CONTENT: formula("f(x)=\\frac{1}{2}x^2"), FONT_SIZE: number(42) } }), DIRECTION: input({ type: "visual_python_manim_direction_constant", fields: { VALUE: "UR" } }), BUFF: number(0.45) },
    }),
    voiceoverWithAnimation("我们在抛物线上选择固定点 P，再选择另一个点 Q。", chain(play(create("axes", 1)), play(create("curve", 1.4)), play(create("point_p", 0.5)), play(create("point_q", 0.5)), write("formula", 0.8)), "default", "derivative-narrated-points"),
    voiceoverWithAnimation("连接 P 和 Q 得到割线，割线的斜率表示两个点之间的平均变化率。", play(create("secant", 1.2)), "default", "derivative-narrated-secant"),
    voiceoverWithAnimation("当点 Q 沿曲线逐渐靠近 P，割线也会逐渐转动。", chain(transform("point_q", "point_q_close", 1.6), transform("secant", "secant_close", 1.6)), "default", "derivative-narrated-approach"),
    voiceoverWithAnimation("当 Q 无限接近 P 时，割线趋近于点 P 处的切线。", transform("secant", "tangent", 1.8), "default", "derivative-narrated-tangent"),
    voiceover("导数的几何意义，就是函数图像在某一点处切线的斜率。", "default", "derivative-narrated-summary"),
    wait(0.8),
  )),
};
