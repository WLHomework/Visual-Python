import type { ExampleProject } from "../types";
import { assign, chain, create, degrees, formula, input, list, number, play, point, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const line = (start: object, end: object) => ({
  type: "visual_python_manim_line_segment_object",
  fields: { COLOR: "WHITE" },
  inputs: { START: input(start), END: input(end) },
});

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const rotatedArc = (angle: number, rotation: number, color: string) => moveTo({
  type: "visual_python_manim_rotate",
  inputs: {
    MOBJECT: input({
      type: "visual_python_manim_arc_object",
      fields: { COLOR: color },
      inputs: { RADIUS: number(1.25), ANGLE: degrees(angle) },
    }),
    ANGLE: degrees(rotation),
  },
}, 0, -2);

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 36) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const copyTransform = (source: string, target: string) => play({
  type: "visual_python_manim_transform_from_copy_animation",
  inputs: { SOURCE: ref(source), TARGET: ref(target), RUN_TIME: number(1) },
});

const write = (name: string, seconds = 0.8) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedTriangleAngleSumExample: ExampleProject = {
  id: "manim-narrated-triangle-angle-sum",
  title: "几何证明：三角形内角和",
  projectName: "narrated-triangle-angle-sum.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedTriangleAngleSum", "Scene", chain(
    assign("triangle", {
      type: "visual_python_manim_polygon_from_list_object",
      fields: { COLOR: "WHITE" },
      inputs: { POINTS: list(point(-3, -0.8), point(3, -0.8), point(0.8, 2.7)) },
    }),
    assign("ray_ab", line(point(-3, -0.8), point(3, -0.8))),
    assign("ray_ac", line(point(-3, -0.8), point(0.8, 2.7))),
    assign("ray_ba", line(point(3, -0.8), point(-3, -0.8))),
    assign("ray_bc", line(point(3, -0.8), point(0.8, 2.7))),
    assign("ray_ca", line(point(0.8, 2.7), point(-3, -0.8))),
    assign("ray_cb", line(point(0.8, 2.7), point(3, -0.8))),
    assign("angle_a", { type: "visual_python_manim_angle", fields: { COLOR: "BLUE" }, inputs: { LINE1: ref("ray_ab"), LINE2: ref("ray_ac"), RADIUS: number(0.55) } }),
    assign("angle_b", { type: "visual_python_manim_angle", fields: { COLOR: "GREEN" }, inputs: { LINE1: ref("ray_bc"), LINE2: ref("ray_ba"), RADIUS: number(0.55) } }),
    assign("angle_c", { type: "visual_python_manim_angle", fields: { COLOR: "RED" }, inputs: { LINE1: ref("ray_ca"), LINE2: ref("ray_cb"), RADIUS: number(0.55) } }),
    assign("label_a", mathLabel("\\alpha", -2.25, -0.45, "BLUE", 32)),
    assign("label_b", mathLabel("\\beta", 2.25, -0.45, "GREEN", 32)),
    assign("label_c", mathLabel("\\gamma", 0.8, 1.85, "RED", 32)),
    assign("arc_a", rotatedArc(42.6, 0, "BLUE")),
    assign("arc_b", rotatedArc(57.9, 42.6, "GREEN")),
    assign("arc_c", rotatedArc(79.5, 100.5, "RED")),
    assign("diameter", {
      type: "visual_python_manim_line_segment_object",
      fields: { COLOR: "YELLOW" },
      inputs: { START: input(point(-1.55, -2)), END: input(point(1.55, -2)) },
    }),
    assign("result", mathLabel("\\alpha+\\beta+\\gamma=180^\\circ", 3.6, -2, "YELLOW", 36)),
    voiceoverWithAnimation("任意画一个三角形，把左下角、右下角和顶角分别记作阿尔法、贝塔和伽马。", chain(play(create("triangle", 1)), play(create("angle_a", 0.5)), play(create("angle_b", 0.5)), play(create("angle_c", 0.5)), write("label_a", 0.3), write("label_b", 0.3), write("label_c", 0.3)), "default", "triangle-sum-mark"),
    voiceover("三角形可以改变形状，三个角的大小也会变化。我们要证明的是，它们的总和始终保持不变。", "default", "triangle-sum-question"),
    voiceoverWithAnimation("先复制蓝色的阿尔法角，把它移动到下方，作为拼接平角的起点。", copyTransform("angle_a", "arc_a"), "default", "triangle-sum-alpha"),
    voiceoverWithAnimation("再把绿色的贝塔角紧接在后面。两个角首尾相接，中间没有空隙。", copyTransform("angle_b", "arc_b"), "default", "triangle-sum-beta"),
    voiceoverWithAnimation("最后放入红色的伽马角。三个角恰好拼成一条半圆弧，也就是一个平角。", chain(copyTransform("angle_c", "arc_c"), play(create("diameter", 0.7))), "default", "triangle-sum-gamma"),
    voiceoverWithAnimation("平角等于一百八十度，所以阿尔法加贝塔加伽马，永远等于一百八十度。", write("result", 1), "default", "triangle-sum-result"),
    wait(0.8),
  )),
};
