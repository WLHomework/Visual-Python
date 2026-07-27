import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, point, ref, sceneWorkspace, text, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const moveTo = (mobject: object, x: number, y: number) => ({ type: "visual_python_manim_move_to", inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) } });
const line = (x1: number, y1: number, x2: number, y2: number, color: string) => ({ type: "visual_python_manim_line_segment_object", fields: { COLOR: color }, inputs: { START: input(point(x1, y1)), END: input(point(x2, y2)) } });
const dashed = (x1: number, y1: number, x2: number, y2: number, color: string) => ({ type: "visual_python_manim_dashed_line_object", fields: { COLOR: color }, inputs: { START: input(point(x1, y1)), END: input(point(x2, y2)), DASH_LENGTH: number(0.08) } });
const mathAt = (content: string, x: number, y: number, color: string, size = 42) => moveTo({ type: "visual_python_manim_mathtex_object", fields: { COLOR: color }, inputs: { CONTENT: formula(content), FONT_SIZE: number(size) } }, x, y);
const write = (name: string, seconds = 1) => play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) } });

export const narratedUnitCircleExample: ExampleProject = {
  id: "manim-narrated-unit-circle",
  title: "配音讲解：单位圆与三角函数",
  projectName: "narrated-unit-circle.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedUnitCircle", "Scene", chain(
    assign("title", moveTo({ type: "visual_python_manim_plain_text_object", fields: { COLOR: "BLUE" }, inputs: { CONTENT: text("单位圆与三角函数"), FONT_SIZE: number(42) } }, 0, 3.1)),
    assign("circle", moveTo({ type: "visual_python_manim_circle_object", fields: { COLOR: "WHITE" }, inputs: { RADIUS: number(2) } }, -2.4, -0.25)),
    assign("x_axis", line(-4.8, -0.25, 0, -0.25, "GRAY")),
    assign("y_axis", line(-2.4, -2.65, -2.4, 2.15, "GRAY")),
    assign("radius", line(-2.4, -0.25, -1.4, 1.482, "YELLOW")),
    assign("point_p", { type: "visual_python_manim_dot_object", fields: { COLOR: "YELLOW" }, inputs: { POINT: input(point(-1.4, 1.482)), RADIUS: number(0.11) } }),
    assign("cos_projection", dashed(-1.4, 1.482, -1.4, -0.25, "GREEN")),
    assign("sin_projection", dashed(-2.4, 1.482, -1.4, 1.482, "BLUE")),
    assign("theta", mathAt("60^\\circ", -1.65, 0.1, "YELLOW", 34)),
    assign("cos_label", mathAt("\\cos60^\\circ=\\frac12", 2.8, 1.35, "GREEN", 42)),
    assign("sin_label", mathAt("\\sin60^\\circ=\\frac{\\sqrt3}{2}", 2.8, 0.15, "BLUE", 42)),
    assign("identity", mathAt("\\sin^2\\theta+\\cos^2\\theta=1", 2.8, -1.35, "WHITE", 38)),
    voiceoverWithAnimation("半径为一的圆叫作单位圆。为了看得更清楚，我们把它放大显示。", chain(write("title", 0.8), play(create("circle", 1.4)), play(create("x_axis", 0.6)), play(create("y_axis", 0.6))), "default", "unit-circle-narrated-intro"),
    voiceoverWithAnimation("取一个六十度角，半径与圆相交于点 P。", chain(play(create("radius", 1)), play(create("point_p", 0.4)), write("theta", 0.5)), "default", "unit-circle-narrated-angle"),
    voiceoverWithAnimation("点 P 的水平坐标对应余弦，六十度的余弦等于二分之一。", chain(play(create("cos_projection", 0.9)), write("cos_label", 0.9)), "default", "unit-circle-narrated-cos"),
    voiceoverWithAnimation("点 P 的竖直坐标对应正弦，六十度的正弦等于根号三除以二。", chain(play(create("sin_projection", 0.9)), write("sin_label", 0.9)), "default", "unit-circle-narrated-sin"),
    voiceoverWithAnimation("因为点 P 位于单位圆上，所以正弦平方加余弦平方恒等于一。", write("identity", 1.2), "default", "unit-circle-narrated-identity"),
    voiceover("单位圆把角度、坐标和三角函数直观地联系在了一起。", "default", "unit-circle-narrated-summary"),
    wait(0.8),
  )),
};
