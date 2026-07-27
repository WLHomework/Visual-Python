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

const bar = (value: number, x: number, color: string) => {
  const height = value * 0.2;
  return moveTo({
    type: "visual_python_manim_set_fill",
    fields: { COLOR: color },
    inputs: {
      MOBJECT: input({
        type: "visual_python_manim_rectangle_object",
        fields: { COLOR: color },
        inputs: { WIDTH: number(0.9), HEIGHT: number(height) },
      }),
      OPACITY: number(0.85),
    },
  }, x, -2.3 + height / 2);
};

const label = (content: string, x: number, y: number, color = "WHITE", size = 32) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const write = (name: string, seconds = 0.6) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedMeanAndOutlierExample: ExampleProject = {
  id: "manim-narrated-mean-outlier",
  title: "统计入门：平均数与离群值",
  projectName: "narrated-mean-outlier.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedMeanAndOutlier", "Scene", chain(
    assign("bar_1", bar(4, -4, "BLUE")),
    assign("bar_2", bar(5, -2.4, "BLUE")),
    assign("bar_3", bar(5, -0.8, "BLUE")),
    assign("bar_4", bar(6, 0.8, "GREEN")),
    assign("bar_5", bar(5, 2.4, "BLUE")),
    assign("outlier", bar(20, 4, "RED")),
    assign("value_1", label("4", -4, -2.65)),
    assign("value_2", label("5", -2.4, -2.65)),
    assign("value_3", label("5", -0.8, -2.65)),
    assign("value_4", label("6", 0.8, -2.65)),
    assign("value_5", label("5", 2.4, -2.65)),
    assign("value_outlier", label("20", 4, -2.65, "RED")),
    assign("mean_before", label("\\bar{x}=\\frac{4+5+5+6+5}{5}=5", 0, 2.75, "GREEN", 38)),
    assign("mean_after", label("\\bar{x}=\\frac{4+5+5+6+5+20}{6}=7.5", 0, 2.75, "YELLOW", 36)),
    assign("outlier_label", label("\\text{outlier}", 4, 2.15, "RED", 32)),
    voiceoverWithAnimation("先观察五个数据：四、五、五、六和五。它们彼此接近，柱子的高度也比较集中。", chain(play(create("bar_1", 0.4)), write("value_1", 0.3), play(create("bar_2", 0.4)), write("value_2", 0.3), play(create("bar_3", 0.4)), write("value_3", 0.3), play(create("bar_4", 0.4)), write("value_4", 0.3), play(create("bar_5", 0.4)), write("value_5", 0.3)), "default", "mean-outlier-data"),
    voiceoverWithAnimation("把这五个数相加再除以五，平均数正好等于五，它能较好地代表这组数据的中心。", write("mean_before", 1), "default", "mean-outlier-before"),
    voiceoverWithAnimation("现在加入一个远大于其他数据的二十。它明显脱离了原来的数据群，我们把这种数叫作离群值。", chain(play(create("outlier", 0.9)), write("value_outlier", 0.4), write("outlier_label", 0.7)), "default", "mean-outlier-add"),
    voiceoverWithAnimation("重新计算后，平均数从五升高到了七点五。但图中大多数数据仍然集中在五附近。", play({ type: "visual_python_manim_transform_to_animation", inputs: { SOURCE: ref("mean_before"), TARGET: ref("mean_after"), RUN_TIME: number(1.2) } }), "default", "mean-outlier-after"),
    voiceover("这说明平均数容易受到极端数据影响。分析数据时，不仅要看平均数，也要观察数据分布，并结合中位数等指标作出判断。", "default", "mean-outlier-summary"),
    wait(0.8),
  )),
};
