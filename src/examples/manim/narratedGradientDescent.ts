import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, range, raw, ref, scaledDirection, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const axesPoint = (x: number, y: number) => input({
  type: "visual_python_manim_axes_c2p",
  inputs: { AXES: ref("axes"), X: number(x), Y: number(y) },
});

const dot = (x: number, y: number, color = "RED") => ({
  type: "visual_python_manim_dot_object",
  fields: { COLOR: color },
  inputs: { POINT: axesPoint(x, y), RADIUS: number(0.13) },
});

const path = (x1: number, y1: number, x2: number, y2: number) => ({
  type: "visual_python_manim_dashed_line_object",
  fields: { COLOR: "GREEN" },
  inputs: { START: axesPoint(x1, y1), END: axesPoint(x2, y2), DASH_LENGTH: number(0.08) },
});

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: {
    MOBJECT: input(mobject),
    POINT: input({ type: "visual_python_manim_point", inputs: { X: number(x), Y: number(y), Z: number(0) } }),
  },
});

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 36) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const transform = (source: string, target: string, seconds = 0.9) => play({
  type: "visual_python_manim_transform_to_animation",
  inputs: { SOURCE: ref(source), TARGET: ref(target), RUN_TIME: number(seconds) },
});

const write = (name: string, seconds = 0.7) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedGradientDescentExample: ExampleProject = {
  id: "manim-narrated-gradient-descent",
  title: "机器学习：梯度下降寻找最低点",
  projectName: "narrated-gradient-descent.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedGradientDescent", "Scene", chain(
    assign("axes", {
      type: "visual_python_manim_shift",
      inputs: {
        MOBJECT: input({
          type: "visual_python_manim_scale",
          inputs: {
            MOBJECT: input({ type: "visual_python_manim_axes_object", inputs: { X_RANGE: range(-5, 5, 1), Y_RANGE: range(0, 5, 1), X_LENGTH: number(9), Y_LENGTH: number(5.2) } }),
            FACTOR: number(0.75),
          },
        }),
        VECTOR: scaledDirection("LEFT", 2),
      },
    }),
    assign("loss_curve", {
      type: "visual_python_manim_axes_plot",
      fields: { COLOR: "BLUE" },
      inputs: { AXES: ref("axes"), FUNCTION: raw("lambda w: 0.25 * w**2"), X_RANGE: range(-4.3, 4.3) },
    }),
    assign("point_0", dot(4, 4)),
    assign("point_1", dot(2.5, 1.5625)),
    assign("point_2", dot(1.3, 0.4225)),
    assign("point_3", dot(0.5, 0.0625)),
    assign("point_4", dot(0, 0, "YELLOW")),
    assign("path_1", path(4, 4, 2.5, 1.5625)),
    assign("path_2", path(2.5, 1.5625, 1.3, 0.4225)),
    assign("path_3", path(1.3, 0.4225, 0.5, 0.0625)),
    assign("path_4", path(0.5, 0.0625, 0, 0)),
    assign("formula", mathLabel("J(w)=0.25w^2", 3.8, 2.8, "BLUE", 40)),
    assign("update_rule", mathLabel("w\\leftarrow w-\\eta\\frac{dJ}{dw}", 3.8, 1.65, "GREEN", 36)),
    assign("loss_0", mathLabel("J=4.000", 3.8, 0.35, "RED", 34)),
    assign("loss_1", mathLabel("J=1.563", 3.8, 0.35, "RED", 34)),
    assign("loss_2", mathLabel("J=0.423", 3.8, 0.35, "YELLOW", 34)),
    assign("loss_3", mathLabel("J=0.063", 3.8, 0.35, "YELLOW", 34)),
    assign("loss_4", mathLabel("J=0", 3.8, 0.35, "GREEN", 38)),
    assign("minimum", mathLabel("\\text{minimum}", 0, -0.55, "YELLOW", 30)),
    voiceoverWithAnimation("蓝色曲线表示模型的损失函数。红点是当前参数位置，我们希望找到让损失最小的参数。", chain(play(create("axes", 0.8)), play(create("loss_curve", 1.1)), play(create("point_0", 0.4)), write("formula", 0.7), write("loss_0", 0.5)), "default", "gradient-start"),
    voiceoverWithAnimation("梯度告诉我们函数上升最快的方向。为了降低损失，参数要沿梯度的反方向更新。", write("update_rule", 0.9), "default", "gradient-rule"),
    voiceoverWithAnimation("第一次更新后，参数从四移动到二点五，损失从四下降到大约一点五六三。", chain(play(create("path_1", 0.5)), transform("point_0", "point_1", 0.9), transform("loss_0", "loss_1", 0.5)), "default", "gradient-step-one"),
    voiceoverWithAnimation("继续重复更新，参数依次靠近一点三和零点五，损失也快速降低。", chain(play(create("path_2", 0.5)), transform("point_0", "point_2", 0.8), transform("loss_0", "loss_2", 0.5), play(create("path_3", 0.5)), transform("point_0", "point_3", 0.8), transform("loss_0", "loss_3", 0.5)), "default", "gradient-more-steps"),
    voiceoverWithAnimation("最终参数接近零，红点到达曲线最低处，损失也接近零。训练过程在这里逐渐收敛。", chain(play(create("path_4", 0.5)), transform("point_0", "point_4", 0.9), transform("loss_0", "loss_4", 0.5), write("minimum", 0.6)), "default", "gradient-converge"),
    voiceover("学习率艾塔决定每一步走多远。太小会收敛缓慢，太大则可能越过最低点，甚至无法稳定下来。", "default", "gradient-summary"),
    wait(0.8),
  )),
};
