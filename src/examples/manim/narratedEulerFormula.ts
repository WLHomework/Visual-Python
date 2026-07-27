import type { ExampleProject } from "../types";
import { assign, chain, create, degrees, formula, input, number, play, point, range, ref, scaledDirection, sceneWorkspace, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const centerX = -2.7;
const radius = 2;

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const complexPlane = () => ({
  type: "visual_python_manim_shift",
  inputs: {
    MOBJECT: input({
      type: "visual_python_manim_scale",
      inputs: {
        MOBJECT: input({
          type: "visual_python_manim_complex_plane_object",
          inputs: { X_RANGE: range(-4, 4, 1), Y_RANGE: range(-3, 3, 1) },
        }),
        FACTOR: number(0.72),
      },
    }),
    VECTOR: scaledDirection("LEFT", 2.7),
  },
});

const vector = (x: number, y: number, color: string) => ({
  type: "visual_python_manim_arrow_object",
  fields: { COLOR: color },
  inputs: { START: input(point(centerX, 0)), END: input(point(x, y)), BUFF: number(0) },
});

const dot = (x: number, y: number, color: string) => ({
  type: "visual_python_manim_dot_object",
  fields: { COLOR: color },
  inputs: { POINT: input(point(x, y)), RADIUS: number(0.11) },
});

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 38) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const transform = (source: string, target: string, seconds = 1.2) => play({
  type: "visual_python_manim_transform_to_animation",
  inputs: { SOURCE: ref(source), TARGET: ref(target), RUN_TIME: number(seconds) },
});

const write = (name: string, seconds = 0.8) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedEulerFormulaExample: ExampleProject = {
  id: "manim-narrated-euler-formula",
  title: "复数直观：欧拉公式与单位圆",
  projectName: "narrated-euler-formula.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedEulerFormula", "Scene", chain(
    assign("plane", complexPlane()),
    assign("unit_circle", moveTo({
      type: "visual_python_manim_circle_object",
      fields: { COLOR: "BLUE" },
      inputs: { RADIUS: number(radius) },
    }, centerX, 0)),
    assign("vector_0", vector(-0.7, 0, "YELLOW")),
    assign("vector_60", vector(-1.7, 1.732, "YELLOW")),
    assign("vector_120", vector(-3.7, 1.732, "YELLOW")),
    assign("vector_180", vector(-4.7, 0, "YELLOW")),
    assign("point_0", dot(-0.7, 0, "RED")),
    assign("point_60", dot(-1.7, 1.732, "RED")),
    assign("point_120", dot(-3.7, 1.732, "RED")),
    assign("point_180", dot(-4.7, 0, "RED")),
    assign("angle_arc", moveTo({
      type: "visual_python_manim_arc_object",
      fields: { COLOR: "GREEN" },
      inputs: { RADIUS: number(0.65), ANGLE: degrees(60) },
    }, centerX, 0)),
    assign("euler_formula", mathLabel("e^{i\\theta}=\\cos\\theta+i\\sin\\theta", 3.1, 2.55, "YELLOW", 42)),
    assign("coordinate_0", mathLabel("e^{i0}=1", 3.1, 1.15, "WHITE", 38)),
    assign("coordinate_60", mathLabel("e^{i\\pi/3}=\\frac{1}{2}+i\\frac{\\sqrt3}{2}", 3.1, 1.15, "GREEN", 34)),
    assign("coordinate_120", mathLabel("e^{i2\\pi/3}=-\\frac{1}{2}+i\\frac{\\sqrt3}{2}", 3.1, 1.15, "BLUE", 32)),
    assign("coordinate_180", mathLabel("e^{i\\pi}=-1", 3.1, 1.15, "RED", 38)),
    assign("real_label", mathLabel("\\operatorname{Re}=\\cos\\theta", 3.1, -0.55, "BLUE", 34)),
    assign("imag_label", mathLabel("\\operatorname{Im}=\\sin\\theta", 3.1, -1.55, "GREEN", 34)),
    voiceoverWithAnimation("在复平面上，横轴表示实部，纵轴表示虚部。单位圆上的黄色向量长度始终等于一。", chain(play(create("plane", 0.8)), play(create("unit_circle", 1)), play(create("vector_0", 0.7)), play(create("point_0", 0.3))), "default", "euler-plane"),
    voiceoverWithAnimation("当角度等于零时，向量终点位于一逗号零，对应的复数就是一。", chain(write("euler_formula", 0.9), write("coordinate_0", 0.6)), "default", "euler-zero"),
    voiceoverWithAnimation("把向量旋转到六十度。终点横坐标是余弦六十度，纵坐标是正弦六十度。", chain(transform("vector_0", "vector_60"), transform("point_0", "point_60", 0.5), play(create("angle_arc", 0.6)), transform("coordinate_0", "coordinate_60", 0.8)), "default", "euler-sixty"),
    voiceoverWithAnimation("继续旋转到一百二十度，实部变为负二分之一，虚部仍然是正的根号三除以二。", chain(transform("vector_0", "vector_120"), transform("point_0", "point_120", 0.5), transform("coordinate_0", "coordinate_120", 0.8)), "default", "euler-one-twenty"),
    voiceoverWithAnimation("旋转到一百八十度时，终点落在负一逗号零，因此 e 的 i 派次方等于负一。", chain(transform("vector_0", "vector_180"), transform("point_0", "point_180", 0.5), transform("coordinate_0", "coordinate_180", 0.8)), "default", "euler-pi"),
    voiceoverWithAnimation("欧拉公式把旋转、三角函数和复数连接起来：实部是余弦，虚部是正弦。", chain(write("real_label", 0.7), write("imag_label", 0.7)), "default", "euler-summary"),
    wait(0.8),
  )),
};
