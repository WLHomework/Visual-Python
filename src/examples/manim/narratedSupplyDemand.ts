import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, range, raw, ref, scaledDirection, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const axesPoint = (x: number, y: number) => input({
  type: "visual_python_manim_axes_c2p",
  inputs: { AXES: ref("axes"), X: number(x), Y: number(y) },
});

const dot = (x: number, y: number, color: string) => ({
  type: "visual_python_manim_dot_object",
  fields: { COLOR: color },
  inputs: { POINT: axesPoint(x, y), RADIUS: number(0.11) },
});

const line = (x1: number, y1: number, x2: number, y2: number, color: string, dashed = false) => ({
  type: dashed ? "visual_python_manim_dashed_line_object" : "visual_python_manim_line_segment_object",
  fields: { COLOR: color },
  inputs: {
    START: axesPoint(x1, y1),
    END: axesPoint(x2, y2),
    ...(dashed ? { DASH_LENGTH: number(0.08) } : {}),
  },
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

export const narratedSupplyDemandExample: ExampleProject = {
  id: "manim-narrated-supply-demand",
  title: "经济学：供给与需求均衡",
  projectName: "narrated-supply-demand.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedSupplyDemand", "Scene", chain(
    assign("axes", {
      type: "visual_python_manim_shift",
      inputs: {
        MOBJECT: input({
          type: "visual_python_manim_scale",
          inputs: {
            MOBJECT: input({ type: "visual_python_manim_axes_object", inputs: { X_RANGE: range(0, 7, 1), Y_RANGE: range(0, 6, 1), X_LENGTH: number(7), Y_LENGTH: number(6) } }),
            FACTOR: number(0.78),
          },
        }),
        VECTOR: scaledDirection("LEFT", 2),
      },
    }),
    assign("demand", {
      type: "visual_python_manim_axes_plot",
      fields: { COLOR: "BLUE" },
      inputs: { AXES: ref("axes"), FUNCTION: raw("lambda q: -0.6 * q + 5"), X_RANGE: range(0, 7) },
    }),
    assign("supply", {
      type: "visual_python_manim_axes_plot",
      fields: { COLOR: "RED" },
      inputs: { AXES: ref("axes"), FUNCTION: raw("lambda q: 0.6 * q + 1"), X_RANGE: range(0, 7) },
    }),
    assign("price_high", line(0, 4.3, 6.3, 4.3, "YELLOW", true)),
    assign("price_low", line(0, 2, 6.3, 2, "YELLOW", true)),
    assign("price_eq", line(0, 3, 6.3, 3, "GREEN", true)),
    assign("demand_high", dot(1.167, 4.3, "BLUE")),
    assign("supply_high", dot(5.5, 4.3, "RED")),
    assign("demand_low", dot(5, 2, "BLUE")),
    assign("supply_low", dot(1.667, 2, "RED")),
    assign("demand_eq", dot(3.333, 3, "GREEN")),
    assign("supply_eq", dot(3.333, 3, "GREEN")),
    assign("surplus_line", line(1.167, 4.3, 5.5, 4.3, "RED")),
    assign("shortage_line", line(1.667, 2, 5, 2, "BLUE")),
    assign("demand_label", mathLabel("D", -4.8, 2.55, "BLUE", 38)),
    assign("supply_label", mathLabel("S", 0.55, 2.55, "RED", 38)),
    assign("high_note", mathLabel("\\text{surplus: }Q_s>Q_d", 3.75, 2.2, "RED", 34)),
    assign("low_note", mathLabel("\\text{shortage: }Q_d>Q_s", 3.75, 0.75, "BLUE", 34)),
    assign("equilibrium_note", mathLabel("Q_s=Q_d", 3.75, -0.75, "GREEN", 40)),
    assign("equilibrium_price", mathLabel("P^*=3,\\quad Q^*=3.33", 3.75, -2.05, "YELLOW", 36)),
    voiceoverWithAnimation("蓝色需求曲线向下倾斜，价格越高，消费者愿意购买的数量通常越少。红色供给曲线则向上倾斜。", chain(play(create("axes", 0.8)), play(create("demand", 1)), play(create("supply", 1)), write("demand_label", 0.4), write("supply_label", 0.4)), "default", "market-curves"),
    voiceoverWithAnimation("当价格高于均衡水平时，供给量大于需求量，市场出现商品剩余，也就是供过于求。", chain(play(create("price_high", 0.6)), play(create("demand_high", 0.3)), play(create("supply_high", 0.3)), play(create("surplus_line", 0.6)), write("high_note", 0.7)), "default", "market-surplus"),
    voiceoverWithAnimation("如果价格过低，需求量会超过供给量，市场出现短缺，买方之间的竞争会推动价格上升。", chain(transform("price_high", "price_low"), transform("demand_high", "demand_low", 0.6), transform("supply_high", "supply_low", 0.6), transform("surplus_line", "shortage_line", 0.7), write("low_note", 0.7)), "default", "market-shortage"),
    voiceoverWithAnimation("价格调整到两条曲线的交点时，供给量正好等于需求量，市场达到均衡。", chain(transform("price_high", "price_eq"), transform("demand_high", "demand_eq", 0.6), transform("supply_high", "supply_eq", 0.6), write("equilibrium_note", 0.7)), "default", "market-equilibrium"),
    voiceoverWithAnimation("在这个示例中，均衡价格是三，均衡数量约为三点三三。此时既没有持续剩余，也没有持续短缺。", write("equilibrium_price", 0.9), "default", "market-values"),
    voiceover("供给或需求发生变化时，曲线会移动，市场会寻找新的交点。均衡不是价格永远不变，而是供需力量暂时平衡。", "default", "market-summary"),
    wait(0.8),
  )),
};
