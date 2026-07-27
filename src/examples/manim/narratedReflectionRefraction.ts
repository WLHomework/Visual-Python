import type { ExampleProject } from "../types";
import { assign, chain, create, degrees, formula, input, number, play, point, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const filledRegion = (y: number, color: string, opacity: number) => moveTo({
  type: "visual_python_manim_set_fill",
  fields: { COLOR: color },
  inputs: {
    MOBJECT: input({
      type: "visual_python_manim_rectangle_object",
      fields: { COLOR: color },
      inputs: { WIDTH: number(14), HEIGHT: number(3.5) },
    }),
    OPACITY: number(opacity),
  },
}, 0, y);

const ray = (x1: number, y1: number, x2: number, y2: number, color: string) => ({
  type: "visual_python_manim_arrow_object",
  fields: { COLOR: color },
  inputs: { START: input(point(x1, y1)), END: input(point(x2, y2)), BUFF: number(0) },
});

const angleArc = (angle: number, rotation: number, color: string) => moveTo({
  type: "visual_python_manim_rotate",
  inputs: {
    MOBJECT: input({
      type: "visual_python_manim_arc_object",
      fields: { COLOR: color },
      inputs: { RADIUS: number(0.85), ANGLE: degrees(angle) },
    }),
    ANGLE: degrees(rotation),
  },
}, 0, 0);

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 36) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const write = (name: string, seconds = 0.7) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedReflectionRefractionExample: ExampleProject = {
  id: "manim-narrated-reflection-refraction",
  title: "光学：反射与折射定律",
  projectName: "narrated-reflection-refraction.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedReflectionRefraction", "Scene", chain(
    assign("air", filledRegion(1.75, "BLUE", 0.12)),
    assign("glass", filledRegion(-1.75, "TEAL", 0.28)),
    assign("interface", {
      type: "visual_python_manim_line_segment_object",
      fields: { COLOR: "WHITE" },
      inputs: { START: input(point(-7, 0)), END: input(point(7, 0)) },
    }),
    assign("normal", {
      type: "visual_python_manim_dashed_line_object",
      fields: { COLOR: "GRAY" },
      inputs: { START: input(point(0, -3.4)), END: input(point(0, 3.4)), DASH_LENGTH: number(0.1) },
    }),
    assign("incident_ray", ray(-4, 3, 0, 0, "YELLOW")),
    assign("reflected_ray", ray(0, 0, 4, 3, "RED")),
    assign("refracted_ray", ray(0, 0, 2.2, -3, "GREEN")),
    assign("incident_arc", angleArc(53.1, 90, "YELLOW")),
    assign("reflection_arc", angleArc(53.1, 36.9, "RED")),
    assign("refraction_arc", angleArc(36.3, -90, "GREEN")),
    assign("air_label", mathLabel("\\text{air }n_1", -5.2, 2.7, "WHITE", 32)),
    assign("glass_label", mathLabel("\\text{glass }n_2", -5.2, -2.7, "WHITE", 32)),
    assign("normal_label", mathLabel("\\text{normal}", 0.9, 2.7, "GRAY", 30)),
    assign("incident_label", mathLabel("\\theta_i", -1.15, 1.05, "YELLOW", 34)),
    assign("reflection_label", mathLabel("\\theta_r", 1.15, 1.05, "RED", 34)),
    assign("refraction_label", mathLabel("\\theta_t", 0.85, -1.2, "GREEN", 34)),
    assign("reflection_rule", mathLabel("\\theta_i=\\theta_r", 4.6, 1.25, "RED", 38)),
    assign("snell_rule", mathLabel("n_1\\sin\\theta_i=n_2\\sin\\theta_t", -3.8, -2.1, "GREEN", 36)),
    assign("bend_note", mathLabel("n_2>n_1\\Rightarrow\\theta_t<\\theta_i", 3.9, -2.2, "YELLOW", 32)),
    voiceoverWithAnimation("上方是空气，下方是折射率更高的玻璃。白色水平线表示两种介质的分界面。", chain(play(create("air", 0.5)), play(create("glass", 0.5)), play(create("interface", 0.6)), write("air_label", 0.4), write("glass_label", 0.4)), "default", "optics-media"),
    voiceoverWithAnimation("黄色入射光到达分界面。测量角度时，要以垂直分界面的法线为基准，而不是以界面为基准。", chain(play(create("normal", 0.5)), write("normal_label", 0.4), play(create("incident_ray", 0.8)), play(create("incident_arc", 0.5)), write("incident_label", 0.4)), "default", "optics-incident"),
    voiceoverWithAnimation("一部分光返回空气形成反射光。反射角始终等于入射角，两者分别位于法线两侧。", chain(play(create("reflected_ray", 0.8)), play(create("reflection_arc", 0.5)), write("reflection_label", 0.4), write("reflection_rule", 0.7)), "default", "optics-reflection"),
    voiceoverWithAnimation("另一部分光进入玻璃形成折射光。由于传播速度发生变化，光线方向也随之偏折。", chain(play(create("refracted_ray", 0.8)), play(create("refraction_arc", 0.5)), write("refraction_label", 0.4)), "default", "optics-refraction"),
    voiceoverWithAnimation("空气进入玻璃时，第二种介质折射率更大，折射光向法线方向偏折，所以折射角小于入射角。", write("bend_note", 0.8), "default", "optics-bending"),
    voiceoverWithAnimation("入射角和折射角满足斯涅尔定律：折射率乘以对应角度的正弦，在界面两侧保持相等。", write("snell_rule", 0.9), "default", "optics-snell"),
    voiceover("反射决定光线返回的方向，折射决定光线进入新介质后的方向。镜子、透镜和光纤都建立在这些规律之上。", "default", "optics-summary"),
    wait(0.8),
  )),
};
