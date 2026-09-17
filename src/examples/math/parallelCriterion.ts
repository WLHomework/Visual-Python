import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, point, raw, ref, sceneWorkspace, text, wait } from "../manim/workspaceHelpers";

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

const textLabel = (content: string, x: number, y: number, size = 26, color = "WHITE") => moveTo({
  type: "visual_python_manim_plain_text_object",
  fields: { COLOR: color },
  inputs: { CONTENT: text(content), FONT_SIZE: number(size) },
}, x, y);

const write = (name: string, seconds = 0.55) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

const appear = (name: string, seconds = 0.6) => play(create(name, seconds));
const add = (name: string) => ({ type: "visual_python_manim_add", inputs: { MOBJECT: ref(name) } });
const alwaysRaw = (code: string) => ({ type: "visual_python_manim_always_redraw", inputs: { MOBJECT: raw(code) } });
const playTimed = (anim: object, seconds: number) => ({
  type: "visual_python_manim_play_with_options",
  inputs: { ANIMATION: input(anim), RUN_TIME: number(seconds), LAG_RATIO: number(0) },
});

export const parallelCriterionExample: ExampleProject = {
  id: "math-parallel-criterion",
  title: "平行线的判定与性质",
  projectName: "math-parallel-criterion.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("ParallelCriterion", "Scene", chain(
    assign("title", textLabel("平行线的判定与性质", 0, 3.3, 34)),
    assign("caption1", textLabel("下面这条直线先不平行。看两个同位角", 0, 2.68, 24)),
    assign("caption3", textLabel("判定：同位角相等 => 两直线平行", 0, 2.68, 24)),
    assign("caption4", textLabel("性质：两直线平行 => 同位角相等", 0, 2.68, 24)),
    assign("l1", line(-5.2, 1.25, 1.5, 1.25)),
    assign("transversal", line(-3.4, 2.9, 2.2, -2.6)),
    assign("tracker", { type: "visual_python_manim_value_tracker", inputs: { VALUE: number(22) } }),
    assign("l2", alwaysRaw("Line(np.array([-5.2, -1.15, 0]), np.array([1.5, -1.15, 0]), color=WHITE).rotate(tracker.get_value()*DEGREES, about_point=np.array([-1.4, -1.15, 0]))")),
    assign("ang1", textLabel("50", -2.05, 1.72, 28, "BLUE")),
    assign("ang2", alwaysRaw("Text(str(int(round(50 + tracker.get_value()))), font_size=28, color=YELLOW).move_to([-0.35, -0.55, 0])")),
    assign("eq", alwaysRaw("Text('同位角  50  与  ' + str(int(round(50 + tracker.get_value()))), font_size=26).move_to([3.55, 0.2, 0])")),
    assign("result", mathLabel("l_1 \\parallel l_2", 3.55, -1.15, "GREEN", 36)),
    write("title", 0.7),
    write("caption1", 0.7),
    appear("l1", 0.55),
    appear("transversal", 0.7),
    add("l2"),
    write("ang1", 0.4),
    add("ang2"),
    add("eq"),
    wait(0.5),
    playTimed({ type: "visual_python_manim_tracker_set_value_animation", inputs: { TRACKER: ref("tracker"), VALUE: number(0) } }, 4),
    write("result", 0.8),
    wait(0.35),
    play({
      type: "visual_python_manim_fade_animation",
      fields: { ANIMATION: "FadeOut" },
      inputs: { MOBJECT: ref("caption1") },
    }),
    write("caption3", 0.8),
    wait(1),
    play({
      type: "visual_python_manim_fade_animation",
      fields: { ANIMATION: "FadeOut" },
      inputs: { MOBJECT: ref("caption3") },
    }),
    write("caption4", 0.8),
    wait(1.4),
  )),
};
