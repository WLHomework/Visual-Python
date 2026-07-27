import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, range, raw, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const axesPoint = (x: number, y: number) => input({
  type: "visual_python_manim_axes_c2p",
  inputs: { AXES: ref("axes"), X: number(x), Y: number(y) },
});

const arrow = (x1: number, y1: number, x2: number, y2: number, color: string) => ({
  type: "visual_python_manim_arrow_object",
  fields: { COLOR: color },
  inputs: { START: axesPoint(x1, y1), END: axesPoint(x2, y2), BUFF: number(0) },
});

const label = (content: string, x: number, y: number, color: string, size = 34) => ({
  type: "visual_python_manim_move_to",
  inputs: {
    MOBJECT: input({
      type: "visual_python_manim_mathtex_object",
      fields: { COLOR: color },
      inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
    }),
    POINT: axesPoint(x, y),
  },
});

const moveBall = (x: number, y: number, seconds: number) => play({
  type: "visual_python_manim_animate_move_to",
  inputs: { MOBJECT: ref("ball"), POINT: axesPoint(x, y), RUN_TIME: number(seconds) },
});

const write = (name: string, seconds = 0.7) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedProjectileMotionExample: ExampleProject = {
  id: "manim-narrated-projectile-motion",
  title: "物理演示：抛物运动",
  projectName: "narrated-projectile-motion.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedProjectileMotion", "Scene", chain(
    assign("axes", {
      type: "visual_python_manim_axes_object",
      inputs: { X_RANGE: range(-5, 5, 1), Y_RANGE: range(-2, 4, 1), X_LENGTH: number(9), Y_LENGTH: number(5.5) },
    }),
    assign("trajectory", {
      type: "visual_python_manim_axes_plot",
      fields: { COLOR: "YELLOW" },
      inputs: { AXES: ref("axes"), FUNCTION: raw("lambda x: -0.25 * x**2 + 2.5"), X_RANGE: range(-4, 4) },
    }),
    assign("ground", {
      type: "visual_python_manim_line_segment_object",
      fields: { COLOR: "GRAY" },
      inputs: { START: axesPoint(-4.6, -1.5), END: axesPoint(4.6, -1.5) },
    }),
    assign("ball", {
      type: "visual_python_manim_dot_object",
      fields: { COLOR: "RED" },
      inputs: { POINT: axesPoint(-4, -1.5), RADIUS: number(0.14) },
    }),
    assign("velocity_x", arrow(-4, -1.5, -2.7, -1.5, "BLUE")),
    assign("velocity_y", arrow(-4, -1.5, -4, 0.1, "GREEN")),
    assign("label_x", label("v_x", -3.3, -1.85, "BLUE")),
    assign("label_y", label("v_y", -4.35, -0.65, "GREEN")),
    assign("formula", label("y=-0.25x^2+2.5", 2.7, 3.25, "YELLOW", 38)),
    assign("peak", label("v_y=0", 0, 2.95, "GREEN", 32)),
    voiceoverWithAnimation("把一个小球斜向上抛出，它同时拥有水平速度和竖直速度。我们用蓝色和绿色箭头分别表示。", chain(play(create("axes", 0.8)), play(create("ground", 0.5)), play(create("ball", 0.4)), play(create("velocity_x", 0.6)), play(create("velocity_y", 0.6)), write("label_x", 0.4), write("label_y", 0.4)), "default", "projectile-components"),
    voiceoverWithAnimation("忽略空气阻力时，水平方向保持匀速，竖直方向受到重力影响。两种运动叠加后形成抛物线。", chain(play(create("trajectory", 1.3)), write("formula", 0.8)), "default", "projectile-trajectory"),
    voiceoverWithAnimation("小球上升时，竖直速度逐渐减小，但水平方向仍在持续前进。", chain(moveBall(-2, 1.5, 1.2), moveBall(0, 2.5, 1.2)), "default", "projectile-rising"),
    voiceoverWithAnimation("在最高点，竖直速度暂时等于零。注意，小球并没有停住，它仍然具有水平速度。", write("peak", 0.8), "default", "projectile-peak"),
    voiceoverWithAnimation("越过最高点后，竖直速度方向向下，小球一边向前，一边加速下落。", chain(moveBall(2, 1.5, 1.2), moveBall(4, -1.5, 1.2)), "default", "projectile-falling"),
    voiceover("抛物运动可以拆成水平方向的匀速运动，以及竖直方向的加速运动。分开分析，再把结果组合起来，问题就清楚了。", "default", "projectile-summary"),
    wait(0.8),
  )),
};
