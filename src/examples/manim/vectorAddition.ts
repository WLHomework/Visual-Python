import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, range, ref, sceneWorkspace, wait } from "./workspaceHelpers";

const axesPoint = (x: number, y: number) => input({
  type: "visual_python_manim_axes_c2p",
  inputs: { AXES: ref("axes"), X: number(x), Y: number(y) },
});

const arrow = (startX: number, startY: number, endX: number, endY: number, color: string) => ({
  type: "visual_python_manim_arrow_object",
  fields: { COLOR: color },
  inputs: { START: axesPoint(startX, startY), END: axesPoint(endX, endY), BUFF: number(0) },
});

const label = (content: string, x: number, y: number, color: string) => ({
  type: "visual_python_manim_move_to",
  inputs: {
    MOBJECT: input({ type: "visual_python_manim_mathtex_object", fields: { COLOR: color }, inputs: { CONTENT: formula(content), FONT_SIZE: number(38) } }),
    POINT: axesPoint(x, y),
  },
});

export const vectorAdditionExample: ExampleProject = {
  id: "manim-vector-addition",
  title: "向量合成与平行四边形法则",
  projectName: "manim-vector-addition.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("VectorAddition", "Scene", chain(
    assign("axes", { type: "visual_python_manim_axes_object", inputs: { X_RANGE: range(-1, 6, 1), Y_RANGE: range(-1, 4, 1), X_LENGTH: number(8), Y_LENGTH: number(5) } }),
    assign("vector_a", arrow(0, 0, 3, 1, "BLUE")),
    assign("vector_b", arrow(3, 1, 4, 3, "GREEN")),
    assign("resultant", arrow(0, 0, 4, 3, "YELLOW")),
    assign("guide_a", { type: "visual_python_manim_dashed_line_object", fields: { COLOR: "GRAY" }, inputs: { START: axesPoint(0, 0), END: axesPoint(1, 2), DASH_LENGTH: number(0.08) } }),
    assign("guide_b", { type: "visual_python_manim_dashed_line_object", fields: { COLOR: "GRAY" }, inputs: { START: axesPoint(1, 2), END: axesPoint(4, 3), DASH_LENGTH: number(0.08) } }),
    assign("label_a", label("\\vec{a}", 1.5, 0.25, "BLUE")),
    assign("label_b", label("\\vec{b}", 3.75, 1.9, "GREEN")),
    assign("formula", label("\\vec{a}+\\vec{b}=(4,3)", 3.5, -0.65, "YELLOW")),
    play(create("axes", 1.2)),
    play(create("vector_a", 1.2)),
    play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref("label_a"), RUN_TIME: number(0.6) } }),
    play(create("vector_b", 1.2)),
    play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref("label_b"), RUN_TIME: number(0.6) } }),
    play(create("guide_a", 0.8)),
    play(create("guide_b", 0.8)),
    play(create("resultant", 1.5)),
    play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref("formula"), RUN_TIME: number(1) } }),
    wait(1.5),
  )),
};
