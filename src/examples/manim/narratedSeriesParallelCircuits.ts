import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, list, number, play, point, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 34) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const line = (x1: number, y1: number, x2: number, y2: number, color = "WHITE") => ({
  type: "visual_python_manim_line_segment_object",
  fields: { COLOR: color },
  inputs: { START: input(point(x1, y1)), END: input(point(x2, y2)) },
});

const resistor = (x: number, y: number, label: string, color: string) => ({
  type: "visual_python_manim_group_from_list_object",
  inputs: {
    OBJECTS: list(
      moveTo({
        type: "visual_python_manim_set_fill",
        fields: { COLOR: color },
        inputs: {
          MOBJECT: input({
            type: "visual_python_manim_rectangle_object",
            fields: { COLOR: color },
            inputs: { WIDTH: number(1.15), HEIGHT: number(0.55) },
          }),
          OPACITY: number(0.4),
        },
      }, x, y),
      mathLabel(label, x, y, "WHITE", 27),
    ),
  },
});

const battery = (x: number, y: number) => ({
  type: "visual_python_manim_group_from_list_object",
  inputs: {
    OBJECTS: list(
      line(x - 0.12, y - 0.5, x - 0.12, y + 0.5, "YELLOW"),
      line(x + 0.12, y - 0.3, x + 0.12, y + 0.3, "YELLOW"),
      mathLabel("+", x - 0.35, y + 0.65, "YELLOW", 26),
      mathLabel("-", x + 0.35, y + 0.65, "YELLOW", 26),
    ),
  },
});

const arrow = (x1: number, y1: number, x2: number, y2: number, color: string) => ({
  type: "visual_python_manim_arrow_object",
  fields: { COLOR: color },
  inputs: { START: input(point(x1, y1)), END: input(point(x2, y2)), BUFF: number(0) },
});

const group = (...objects: object[]) => ({
  type: "visual_python_manim_group_from_list_object",
  inputs: { OBJECTS: list(...objects) },
});

const write = (name: string, seconds = 0.7) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedSeriesParallelCircuitsExample: ExampleProject = {
  id: "manim-narrated-series-parallel-circuits",
  title: "电学：串联与并联电路",
  projectName: "narrated-series-parallel-circuits.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedSeriesParallelCircuits", "Scene", chain(
    assign("series_circuit", group(
      line(-5.5, -1.25, -1, -1.25),
      line(-1, -1.25, -1, 1.25),
      line(-1, 1.25, -1.55, 1.25),
      line(-2.7, 1.25, -3.3, 1.25),
      line(-4.45, 1.25, -5.5, 1.25),
      line(-5.5, 1.25, -5.5, 0.5),
      line(-5.5, -0.5, -5.5, -1.25),
      resistor(-2.1, 1.25, "R_2", "GREEN"),
      resistor(-3.9, 1.25, "R_1", "BLUE"),
      battery(-5.5, 0),
    )),
    assign("series_current", group(
      arrow(-4.9, -1.25, -3.9, -1.25, "RED"),
      arrow(-2.8, -1.25, -1.8, -1.25, "RED"),
      arrow(-1, 0, -1, 0.8, "RED"),
    )),
    assign("parallel_circuit", group(
      line(1, -1.25, 5.5, -1.25),
      line(5.5, -1.25, 5.5, 1.25),
      line(1, 1.25, 5.5, 1.25),
      line(1, 1.25, 1, 0.5),
      line(1, -0.5, 1, -1.25),
      line(1, 0.55, 2.4, 0.55),
      line(3.6, 0.55, 5.5, 0.55),
      line(1, -0.55, 2.4, -0.55),
      line(3.6, -0.55, 5.5, -0.55),
      resistor(3, 0.55, "R_1", "BLUE"),
      resistor(3, -0.55, "R_2", "GREEN"),
      battery(1, 0),
    )),
    assign("parallel_current", group(
      arrow(1.5, 0.55, 2.2, 0.55, "RED"),
      arrow(1.5, -0.55, 2.2, -0.55, "ORANGE"),
      arrow(4.5, -1.25, 3.5, -1.25, "YELLOW"),
    )),
    assign("series_title", mathLabel("\\text{Series}", -3.25, 2.45, "BLUE", 40)),
    assign("parallel_title", mathLabel("\\text{Parallel}", 3.25, 2.45, "GREEN", 40)),
    assign("series_current_rule", mathLabel("I=I_1=I_2", -3.25, -2, "RED", 34)),
    assign("series_voltage_rule", mathLabel("V=V_1+V_2", -3.25, -2.8, "YELLOW", 34)),
    assign("parallel_voltage_rule", mathLabel("V=V_1=V_2", 3.25, -2, "YELLOW", 34)),
    assign("parallel_current_rule", mathLabel("I=I_1+I_2", 3.25, -2.8, "RED", 34)),
    assign("divider", line(0, -3.3, 0, 3.3, "GRAY")),
    voiceoverWithAnimation("左侧是串联电路。两个电阻首尾相接，电流只有一条可以通过的路径。", chain(play(create("divider", 0.4)), play(create("series_circuit", 1.2)), write("series_title", 0.6)), "default", "circuit-series-layout"),
    voiceoverWithAnimation("因为没有分支，流过第一个电阻、第二个电阻和电源的电流都相同。", chain(play(create("series_current", 0.8)), write("series_current_rule", 0.7)), "default", "circuit-series-current"),
    voiceoverWithAnimation("电源提供的总电压会分配到两个电阻上，因此总电压等于各部分电压之和。", write("series_voltage_rule", 0.8), "default", "circuit-series-voltage"),
    voiceoverWithAnimation("右侧是并联电路。两个电阻分别连接在相同的两个节点之间，电流拥有两条支路。", chain(play(create("parallel_circuit", 1.2)), write("parallel_title", 0.6)), "default", "circuit-parallel-layout"),
    voiceoverWithAnimation("每条支路的两端连接到同一对节点，所以两个电阻两端的电压都等于电源电压。", write("parallel_voltage_rule", 0.8), "default", "circuit-parallel-voltage"),
    voiceoverWithAnimation("总电流在节点处分成两部分，流过各支路后重新汇合，因此总电流等于支路电流之和。", chain(play(create("parallel_current", 0.8)), write("parallel_current_rule", 0.8)), "default", "circuit-parallel-current"),
    voiceover("串联电路中电流相同、电压分配；并联电路中电压相同、电流分流。判断连接方式时，先看电流是否存在分支。", "default", "circuit-summary"),
    wait(0.8),
  )),
};
