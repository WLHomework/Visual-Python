import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const point = (x: number, y: number) => input({
  type: "visual_python_manim_point",
  inputs: { X: number(x), Y: number(y), Z: number(0) },
});

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: point(x, y) },
});

const filledBar = (height: number, x: number, color: string) => moveTo({
  type: "visual_python_manim_set_fill",
  fields: { COLOR: color },
  inputs: {
    MOBJECT: input({
      type: "visual_python_manim_rectangle_object",
      fields: { COLOR: color },
      inputs: { WIDTH: number(1.15), HEIGHT: number(height) },
    }),
    OPACITY: number(0.82),
  },
}, x, -2.4 + height / 2);

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 34) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const write = (name: string, seconds = 0.6) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedCompoundInterestExample: ExampleProject = {
  id: "manim-narrated-compound-interest",
  title: "生活数学：复利增长",
  projectName: "narrated-compound-interest.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedCompoundInterest", "Scene", chain(
    assign("formula", mathLabel("A=P(1+r)^n", 0, 3.15, "YELLOW", 46)),
    assign("bar_0", filledBar(2, -4, "BLUE")),
    assign("bar_1", filledBar(2.2, -2, "BLUE")),
    assign("bar_2", filledBar(2.42, 0, "GREEN")),
    assign("bar_3", filledBar(2.662, 2, "GREEN")),
    assign("bar_4", filledBar(2.928, 4, "YELLOW")),
    assign("year_0", mathLabel("0", -4, -2.85, "WHITE", 30)),
    assign("year_1", mathLabel("1", -2, -2.85, "WHITE", 30)),
    assign("year_2", mathLabel("2", 0, -2.85, "WHITE", 30)),
    assign("year_3", mathLabel("3", 2, -2.85, "WHITE", 30)),
    assign("year_4", mathLabel("4", 4, -2.85, "WHITE", 30)),
    assign("amount_0", mathLabel("1000", -4, -0.05, "BLUE", 28)),
    assign("amount_1", mathLabel("1100", -2, 0.15, "BLUE", 28)),
    assign("amount_2", mathLabel("1210", 0, 0.37, "GREEN", 28)),
    assign("amount_3", mathLabel("1331", 2, 0.61, "GREEN", 28)),
    assign("amount_4", mathLabel("1464.1", 4, 0.88, "YELLOW", 28)),
    voiceoverWithAnimation("假设我们存入一千元，年利率是百分之十。复利的关键，是每一年的利息都会加入本金。", chain(write("formula", 0.9), play(create("bar_0", 0.8)), write("year_0"), write("amount_0")), "default", "compound-interest-start"),
    voiceoverWithAnimation("第一年结束，本金和利息合计一千一百元。下一年不再只用最初的一千元计算。", chain(play(create("bar_1", 0.8)), write("year_1"), write("amount_1")), "default", "compound-interest-year-one"),
    voiceoverWithAnimation("第二年，一千一百元再乘一点一，变成一千二百一十元。这就是利滚利。", chain(play(create("bar_2", 0.8)), write("year_2"), write("amount_2")), "default", "compound-interest-year-two"),
    voiceoverWithAnimation("继续按相同方式增长，第三年是一千三百三十一元，第四年大约是一千四百六十四点一元。", chain(play(create("bar_3", 0.8)), write("year_3"), write("amount_3"), play(create("bar_4", 0.8)), write("year_4"), write("amount_4")), "default", "compound-interest-later-years"),
    voiceover("公式里，P 是初始本金，r 是每期利率，n 是期数。时间越长，复利曲线增长得越明显。", "default", "compound-interest-summary"),
    wait(0.8),
  )),
};
