import type { ExampleProject } from "../types";
import { assign, chain, create, input, number, play, point, raw, ref, sceneWorkspace, text, wait } from "../manim/workspaceHelpers";

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const line = (x1: number, y1: number, x2: number, y2: number) => ({
  type: "visual_python_manim_line_segment_object",
  fields: { COLOR: "WHITE" },
  inputs: { START: input(point(x1, y1)), END: input(point(x2, y2)) },
});

const textLabel = (content: string, x: number, y: number, size = 26, color = "WHITE") => moveTo({
  type: "visual_python_manim_plain_text_object",
  fields: { COLOR: color },
  inputs: { CONTENT: text(content), FONT_SIZE: number(size) },
}, x, y);

const write = (name: string, seconds = 0.55) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

const appear = (name: string, seconds = 0.55) => play(create(name, seconds));
const add = (name: string) => ({ type: "visual_python_manim_add", inputs: { MOBJECT: ref(name) } });
const alwaysRaw = (code: string) => ({ type: "visual_python_manim_always_redraw", inputs: { MOBJECT: raw(code) } });
const playTimed = (anim: object, seconds: number) => ({
  type: "visual_python_manim_play_with_options",
  inputs: { ANIMATION: input(anim), RUN_TIME: number(seconds), LAG_RATIO: number(0) },
});

export const eightAnglesExample: ExampleProject = {
  id: "math-eight-angles",
  title: "三线八角",
  projectName: "math-eight-angles.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("EightAngles", "Scene", chain(
    assign("title", textLabel("三线八角", 0, 3.35, 36)),
    assign("caption1", textLabel("两条平行线被截线所截，形成八个角", 0, 2.72, 24)),
    assign("caption2", textLabel("转动截线，三类角的关系一直成立", 0, 2.72, 24)),
    assign("legend1", textLabel("蓝：同位角相等", 3.85, 1.25, 22, "BLUE")),
    assign("legend2", textLabel("绿：内错角相等", 3.85, 0.65, 22, "GREEN")),
    assign("legend3", textLabel("黄：同旁内角互补", 3.7, 0.05, 22, "YELLOW")),
    assign("l1", line(-5.4, 1.2, 1.6, 1.2)),
    assign("l2", line(-5.4, -1.2, 1.6, -1.2)),
    assign("label_l1", textLabel("l1", -5.85, 1.2, 20)),
    assign("label_l2", textLabel("l2", -5.85, -1.2, 20)),
    assign("tracker", { type: "visual_python_manim_value_tracker", inputs: { VALUE: number(-38) } }),
    assign("transversal", alwaysRaw("Line(np.array([-1.7, 1.2, 0]) - 3.6*np.array([np.cos(tracker.get_value()*DEGREES), np.sin(tracker.get_value()*DEGREES), 0]), np.array([-1.7, 1.2, 0]) + 3.6*np.array([np.cos(tracker.get_value()*DEGREES), np.sin(tracker.get_value()*DEGREES), 0]), color=WHITE)")),
    assign("live_corr", alwaysRaw("Text('同位角  ' + str(int(round(abs(tracker.get_value())))) + ' = ' + str(int(round(abs(tracker.get_value())))), font_size=26, color=BLUE).move_to([3.7, -0.9, 0])")),
    assign("live_alt", alwaysRaw("Text('内错角  ' + str(int(round(abs(tracker.get_value())))) + ' = ' + str(int(round(abs(tracker.get_value())))), font_size=26, color=GREEN).move_to([3.7, -1.5, 0])")),
    assign("live_ss", alwaysRaw("Text('同旁内角  ' + str(int(round(abs(tracker.get_value())))) + ' + ' + str(int(round(180 - abs(tracker.get_value())))) + ' = 180', font_size=24, color=YELLOW).move_to([3.35, -2.15, 0])")),
    write("title", 0.65),
    write("caption1", 0.7),
    appear("l1", 0.5),
    appear("l2", 0.5),
    write("label_l1", 0.25),
    write("label_l2", 0.25),
    add("transversal"),
    wait(0.35),
    write("legend1", 0.4),
    write("legend2", 0.4),
    write("legend3", 0.4),
    add("live_corr"),
    add("live_alt"),
    add("live_ss"),
    wait(0.35),
    play({
      type: "visual_python_manim_fade_animation",
      fields: { ANIMATION: "FadeOut" },
      inputs: { MOBJECT: ref("caption1") },
    }),
    write("caption2", 0.7),
    wait(0.25),
    playTimed({ type: "visual_python_manim_tracker_set_value_animation", inputs: { TRACKER: ref("tracker"), VALUE: number(-62) } }, 3.6),
    wait(0.25),
    playTimed({ type: "visual_python_manim_tracker_set_value_animation", inputs: { TRACKER: ref("tracker"), VALUE: number(-28) } }, 3.2),
    wait(1.2),
  )),
};
