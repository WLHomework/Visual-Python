import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, range, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const axesPoint = (x: number, y: number) => input({ type: "visual_python_manim_axes_c2p", inputs: { AXES: ref("axes"), X: number(x), Y: number(y) } });
const arrow = (x1: number, y1: number, x2: number, y2: number, color: string) => ({ type: "visual_python_manim_arrow_object", fields: { COLOR: color }, inputs: { START: axesPoint(x1, y1), END: axesPoint(x2, y2), BUFF: number(0) } });
const label = (content: string, x: number, y: number, color: string, size = 38) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input({ type: "visual_python_manim_mathtex_object", fields: { COLOR: color }, inputs: { CONTENT: formula(content), FONT_SIZE: number(size) } }), POINT: axesPoint(x, y) },
});
const write = (name: string, seconds = 1) => play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) } });

export const narratedVectorAdditionExample: ExampleProject = {
  id: "manim-narrated-vector-addition",
  title: "配音讲解：向量加法",
  projectName: "narrated-vector-addition.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedVectorAddition", "Scene", chain(
    assign("axes", { type: "visual_python_manim_axes_object", inputs: { X_RANGE: range(-1, 6, 1), Y_RANGE: range(-1, 4, 1), X_LENGTH: number(8), Y_LENGTH: number(5) } }),
    assign("vector_a", arrow(0, 0, 3, 1, "BLUE")),
    assign("vector_b", arrow(3, 1, 4, 3, "GREEN")),
    assign("resultant", arrow(0, 0, 4, 3, "YELLOW")),
    assign("parallel_b", { type: "visual_python_manim_dashed_line_object", fields: { COLOR: "GRAY" }, inputs: { START: axesPoint(0, 0), END: axesPoint(1, 2), DASH_LENGTH: number(0.08) } }),
    assign("parallel_a", { type: "visual_python_manim_dashed_line_object", fields: { COLOR: "GRAY" }, inputs: { START: axesPoint(1, 2), END: axesPoint(4, 3), DASH_LENGTH: number(0.08) } }),
    assign("label_a", label("\\vec{a}", 1.5, 0.25, "BLUE")),
    assign("label_b", label("\\vec{b}", 3.75, 1.9, "GREEN")),
    assign("formula", label("\\vec{a}+\\vec{b}=(4,3)", 3.5, -0.65, "YELLOW", 34)),
    voiceoverWithAnimation("向量不仅有大小，还有方向。我们先画出蓝色向量 a。", chain(play(create("axes", 1)), play(create("vector_a", 1.2)), write("label_a", 0.5)), "default", "vector-narrated-a"),
    voiceoverWithAnimation("把绿色向量 b 的起点放在向量 a 的终点，这叫作首尾相接。", chain(play(create("vector_b", 1.2)), write("label_b", 0.5)), "default", "vector-narrated-b"),
    voiceoverWithAnimation("从第一个向量的起点，指向第二个向量的终点，就得到黄色的合向量。", play(create("resultant", 1.5)), "default", "vector-narrated-result"),
    voiceoverWithAnimation("补上两条平行辅助线，也能看出这就是向量加法的平行四边形法则。", chain(play(create("parallel_b", 0.8)), play(create("parallel_a", 0.8))), "default", "vector-narrated-parallelogram"),
    voiceoverWithAnimation("分量分别相加，三加一等于四，一加二等于三，所以合向量是四逗号三。", write("formula", 1.1), "default", "vector-narrated-components"),
    voiceover("首尾相接法和平行四边形法，得到的是同一个合向量。", "default", "vector-narrated-summary"),
    wait(0.8),
  )),
};
