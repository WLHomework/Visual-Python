import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, range, raw, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const axesPoint = (x: number, y: number) => input({
  type: "visual_python_manim_axes_c2p",
  inputs: { AXES: ref("axes"), X: number(x), Y: number(y) },
});

const dot = (x: number, y: number, color: string) => ({
  type: "visual_python_manim_dot_object",
  fields: { COLOR: color },
  inputs: { POINT: axesPoint(x, y), RADIUS: number(0.11) },
});

const line = (x1: number, y1: number, x2: number, y2: number, color: string) => ({
  type: "visual_python_manim_line_segment_object",
  fields: { COLOR: color },
  inputs: { START: axesPoint(x1, y1), END: axesPoint(x2, y2) },
});

const label = (content: string, x: number, y: number, color = "WHITE", size = 30) => ({
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

const write = (name: string, seconds = 0.5) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedDiceFrequencyExample: ExampleProject = {
  id: "manim-narrated-dice-frequency",
  title: "概率入门：掷骰子的频率趋于稳定",
  projectName: "narrated-dice-frequency.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedDiceFrequency", "Scene", chain(
    assign("axes", {
      type: "visual_python_manim_axes_object",
      inputs: { X_RANGE: range(0, 6, 1), Y_RANGE: range(0, 0.45, 0.1), X_LENGTH: number(9), Y_LENGTH: number(5.2) },
    }),
    assign("theory", {
      type: "visual_python_manim_axes_plot",
      fields: { COLOR: "YELLOW" },
      inputs: { AXES: ref("axes"), FUNCTION: raw("lambda x: 1 / 6"), X_RANGE: range(0, 5.5) },
    }),
    assign("theory_label", label("P(6)=\\frac{1}{6}\\approx0.167", 3.9, 0.205, "YELLOW", 32)),
    assign("point_1", dot(1, 0.3, "RED")),
    assign("point_2", dot(2, 0.22, "BLUE")),
    assign("point_3", dot(3, 0.19, "BLUE")),
    assign("point_4", dot(4, 0.174, "GREEN")),
    assign("point_5", dot(5, 0.168, "GREEN")),
    assign("line_1", line(1, 0.3, 2, 0.22, "BLUE")),
    assign("line_2", line(2, 0.22, 3, 0.19, "BLUE")),
    assign("line_3", line(3, 0.19, 4, 0.174, "GREEN")),
    assign("line_4", line(4, 0.174, 5, 0.168, "GREEN")),
    assign("trials_1", label("10", 1, -0.035)),
    assign("trials_2", label("50", 2, -0.035)),
    assign("trials_3", label("100", 3, -0.035)),
    assign("trials_4", label("500", 4, -0.035)),
    assign("trials_5", label("1000", 5, -0.035)),
    assign("frequency_1", label("0.300", 1, 0.335, "RED", 26)),
    assign("frequency_5", label("0.168", 5, 0.205, "GREEN", 26)),
    voiceoverWithAnimation("一枚公平骰子有六个面，所以掷出六点的理论概率是六分之一，大约等于零点一六七。", chain(play(create("axes", 0.8)), play(create("theory", 1)), write("theory_label", 0.8)), "default", "dice-frequency-theory"),
    voiceoverWithAnimation("只掷十次时，假设有三次出现六点，频率是零点三。它和理论概率还有明显差距。", chain(play(create("point_1", 0.5)), write("trials_1", 0.3), write("frequency_1", 0.5)), "default", "dice-frequency-ten"),
    voiceoverWithAnimation("把试验增加到五十次和一百次，频率会有波动，但整体开始向六分之一靠近。", chain(play(create("line_1", 0.5)), play(create("point_2", 0.4)), write("trials_2", 0.3), play(create("line_2", 0.5)), play(create("point_3", 0.4)), write("trials_3", 0.3)), "default", "dice-frequency-hundred"),
    voiceoverWithAnimation("当试验次数增加到五百和一千次，记录中的频率变为零点一七四和零点一六八，已经非常接近理论值。", chain(play(create("line_3", 0.5)), play(create("point_4", 0.4)), write("trials_4", 0.3), play(create("line_4", 0.5)), play(create("point_5", 0.4)), write("trials_5", 0.3), write("frequency_5", 0.5)), "default", "dice-frequency-thousand"),
    voiceover("频率趋于稳定，不代表每次试验都正好等于理论概率。它表示试验次数足够多时，随机波动的影响通常会越来越小。", "default", "dice-frequency-summary"),
    wait(0.8),
  )),
};
