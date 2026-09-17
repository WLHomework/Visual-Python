import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, point, ref, sceneWorkspace, text, voiceover, voiceoverWithAnimation, wait } from "../manim/workspaceHelpers";

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const line = (x1: number, y1: number, x2: number, y2: number) => ({
  type: "visual_python_manim_line_segment_object",
  fields: { COLOR: "WHITE" },
  inputs: { START: input(point(x1, y1)), END: input(point(x2, y2)) },
});

const mathLabel = (content: string, x: number, y: number, color: string, size = 32) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const textLabel = (content: string, x: number, y: number, color = "WHITE", size = 28) => moveTo({
  type: "visual_python_manim_plain_text_object",
  fields: { COLOR: color },
  inputs: { CONTENT: text(content), FONT_SIZE: number(size) },
}, x, y);

const write = (name: string, seconds = 0.5) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

const appear = (name: string, seconds = 0.6) => play(create(name, seconds));

const fadeOut = (name: string) => play({
  type: "visual_python_manim_fade_animation",
  fields: { ANIMATION: "FadeOut" },
  inputs: { MOBJECT: ref(name) },
});

const indicate = (name: string, color: string) => ({
  type: "visual_python_manim_indicate_animation",
  fields: { COLOR: color },
  inputs: { MOBJECT: ref(name), SCALE_FACTOR: number(1.45), RUN_TIME: number(1.15) },
});

const playTwo = (first: object, second: object, seconds = 1.2) => ({
  type: "visual_python_manim_play_two",
  inputs: { FIRST: input(first), SECOND: input(second), RUN_TIME: number(seconds), LAG_RATIO: number(0) },
});

export const parallelLineAnglesExample: ExampleProject = {
  id: "math-parallel-line-angles",
  title: "平行线的同位角、内错角、同旁内角",
  projectName: "math-parallel-line-angles.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("ParallelLineAngles", "Scene", chain(
    assign("title", textLabel("平行线与截线的角", 0, 3.35, "WHITE", 36)),
    assign("caption1", textLabel("先画两条互相平行的直线", 0, 2.72, "WHITE", 26)),
    assign("caption2", textLabel("再画一条直线去截它们，叫截线", 0, 2.72, "WHITE", 26)),
    assign("caption3", textLabel("一共形成八个角，先编上号", 0, 2.72, "WHITE", 26)),
    assign("caption4", textLabel("同位角：在截线同侧、位置相同，相等", 0, 2.72, "WHITE", 26)),
    assign("caption5", textLabel("内错角：在两平行线内侧、交叉相对，相等", 0, 2.72, "WHITE", 26)),
    assign("caption6", textLabel("同旁内角：在两平行线内侧、同一侧，互补", 0, 2.72, "WHITE", 26)),
    assign("l1", line(-5.4, 1.15, 1.9, 1.15)),
    assign("l2", line(-5.4, -1.15, 1.9, -1.15)),
    assign("transversal", line(-3.7, 2.95, 2.5, -2.85)),
    assign("label_l1", textLabel("l1", -5.85, 1.15, "WHITE", 22)),
    assign("label_l2", textLabel("l2", -5.85, -1.15, "WHITE", 22)),
    assign("label_t", textLabel("t", -3.55, 3.15, "WHITE", 22)),
    assign("n1", mathLabel("1", -2.36, 1.38, "WHITE", 30)),
    assign("n2", mathLabel("2", -1.55, 1.73, "WHITE", 30)),
    assign("n3", mathLabel("3", -1.20, 0.92, "WHITE", 30)),
    assign("n4", mathLabel("4", -2.01, 0.57, "WHITE", 30)),
    assign("n5", mathLabel("5", 0.10, -0.92, "WHITE", 30)),
    assign("n6", mathLabel("6", 0.91, -0.57, "WHITE", 30)),
    assign("n7", mathLabel("7", 1.26, -1.38, "WHITE", 30)),
    assign("n8", mathLabel("8", 0.45, -1.73, "WHITE", 30)),
    assign("eq_corr", mathLabel("2=6", 4.05, 0.85, "BLUE", 36)),
    assign("eq_alt", mathLabel("3=5", 4.05, 0.05, "GREEN", 36)),
    assign("eq_ss", mathLabel("3+6=180^\\circ", 3.85, -0.85, "YELLOW", 32)),
    voiceoverWithAnimation("先画两条互相平行的直线。", chain(write("title", 0.7), write("caption1", 0.7), appear("l1", 0.7), appear("l2", 0.7), write("label_l1", 0.3), write("label_l2", 0.3)), "default", "math-parallel-lines"),
    voiceoverWithAnimation("再画一条直线去截它们，这条直线叫做截线。", chain(fadeOut("caption1"), write("caption2", 0.7), appear("transversal", 0.9), write("label_t", 0.3)), "default", "math-parallel-transversal"),
    voiceoverWithAnimation("两条平行线被截线所截，一共形成八个角。我们先把它们编上号。", chain(fadeOut("caption2"), write("caption3", 0.7), write("n1", 0.22), write("n2", 0.22), write("n3", 0.22), write("n4", 0.22), write("n5", 0.22), write("n6", 0.22), write("n7", 0.22), write("n8", 0.22)), "default", "math-parallel-numbers"),
    voiceoverWithAnimation("同位角的位置相同。比如二和六，都在截线的右侧、每条平行线的上方。两条平行时，同位角相等，所以二等于六。", chain(fadeOut("caption3"), write("caption4", 0.75), playTwo(indicate("n2", "BLUE"), indicate("n6", "BLUE")), write("eq_corr", 0.7)), "default", "math-parallel-corresponding"),
    voiceoverWithAnimation("内错角在两平行线内侧，并且交叉相对。三在上面内侧右边，五在下面内侧左边。两条平行时，内错角也相等，所以三等于五。", chain(fadeOut("caption4"), write("caption5", 0.75), playTwo(indicate("n3", "GREEN"), indicate("n5", "GREEN")), write("eq_alt", 0.7)), "default", "math-parallel-alternate"),
    voiceoverWithAnimation("同旁内角也在两线内侧，但在截线的同一侧。三和六都在截线右侧。它们互补，加起来等于一百八十度。", chain(fadeOut("caption5"), write("caption6", 0.75), playTwo(indicate("n3", "YELLOW"), indicate("n6", "YELLOW")), write("eq_ss", 0.8)), "default", "math-parallel-same-side"),
    voiceover("记住三句话：同位角相等，内错角相等，同旁内角互补。判断平行，用的也是这三组角。", "default", "math-parallel-summary"),
    wait(0.8),
  )),
};
