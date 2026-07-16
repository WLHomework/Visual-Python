import type { ExampleProject } from "../types";
import { assign, chain, formula, input, number, play, point, ref, sceneWorkspace, wait } from "./workspaceHelpers";

const mathAt = (content: string, x: number, y: number, color: string, fontSize: number) => ({
  type: "visual_python_manim_move_to",
  inputs: {
    MOBJECT: input({ type: "visual_python_manim_mathtex_object", fields: { COLOR: color }, inputs: { CONTENT: formula(content), FONT_SIZE: number(fontSize) } }),
    POINT: input(point(x, y)),
  },
});

const transform = (source: string, target: string, seconds = 1) => play({
  type: "visual_python_manim_transform_to_animation",
  inputs: { SOURCE: ref(source), TARGET: ref(target), RUN_TIME: number(seconds) },
});

export const bubbleSortVisualizationExample: ExampleProject = {
  id: "manim-bubble-sort-visualization",
  title: "冒泡排序过程演示",
  projectName: "manim-bubble-sort-visualization.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("BubbleSortVisualization", "Scene", chain(
    assign("title", mathAt("\\text{Bubble Sort}", 0, 2.7, "BLUE", 52)),
    assign("state", mathAt("[5,1,4,2]", 0, 0.8, "WHITE", 72)),
    assign("state_1", mathAt("[1,5,4,2]", 0, 0.8, "YELLOW", 72)),
    assign("state_2", mathAt("[1,4,5,2]", 0, 0.8, "YELLOW", 72)),
    assign("state_3", mathAt("[1,4,2,5]", 0, 0.8, "YELLOW", 72)),
    assign("state_4", mathAt("[1,2,4,5]", 0, 0.8, "GREEN", 72)),
    assign("comparison", mathAt("5>1\\;\\Rightarrow\\;swap", 0, -0.8, "RED", 42)),
    assign("comparison_2", mathAt("5>4\\;\\Rightarrow\\;swap", 0, -0.8, "RED", 42)),
    assign("comparison_3", mathAt("5>2\\;\\Rightarrow\\;swap", 0, -0.8, "RED", 42)),
    assign("comparison_4", mathAt("4>2\\;\\Rightarrow\\;swap", 0, -0.8, "RED", 42)),
    assign("complete", mathAt("\\text{Sorted!}", 0, -2.1, "GREEN", 46)),
    play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref("title"), RUN_TIME: number(0.8) } }),
    play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref("state"), RUN_TIME: number(1) } }),
    play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref("comparison"), RUN_TIME: number(0.6) } }),
    transform("state", "state_1"),
    transform("comparison", "comparison_2", 0.7),
    transform("state", "state_2"),
    transform("comparison", "comparison_3", 0.7),
    transform("state", "state_3"),
    transform("comparison", "comparison_4", 0.7),
    transform("state", "state_4"),
    play({ type: "visual_python_manim_fade_out_animation", inputs: { MOBJECT: ref("comparison"), SHIFT: input(point(0, -0.5)), SCALE: number(0.8), RUN_TIME: number(0.6) } }),
    play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref("complete"), RUN_TIME: number(0.8) } }),
    wait(1.5),
  )),
};
