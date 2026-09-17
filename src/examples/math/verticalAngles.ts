import type { ExampleProject } from "../types";
import { assign, chain, create, input, number, play, point, raw, ref, sceneWorkspace, text, wait } from "../manim/workspaceHelpers";

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const textLabel = (content: string, x: number, y: number, size: number, color = "WHITE") => moveTo({
  type: "visual_python_manim_plain_text_object",
  fields: { COLOR: color },
  inputs: { CONTENT: text(content), FONT_SIZE: number(size) },
}, x, y);

const write = (name: string, seconds = 0.6) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

const appear = (name: string, seconds = 0.6) => play(create(name, seconds));

const add = (name: string) => ({ type: "visual_python_manim_add", inputs: { MOBJECT: ref(name) } });

const alwaysRaw = (code: string) => ({
  type: "visual_python_manim_always_redraw",
  inputs: { MOBJECT: raw(code) },
});

const playTimed = (anim: object, seconds: number) => ({
  type: "visual_python_manim_play_with_options",
  inputs: { ANIMATION: input(anim), RUN_TIME: number(seconds), LAG_RATIO: number(0) },
});

export const verticalAnglesExample: ExampleProject = {
  id: "math-vertical-angles",
  title: "对顶角相等",
  projectName: "math-vertical-angles.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("VerticalAngles", "Scene", chain(
    assign("title", textLabel("对顶角相等", 0, 3.3, 36)),
    assign("caption1", textLabel("两条直线相交，对顶角始终相等", 0, 2.7, 26)),
    assign("line_h", {
      type: "visual_python_manim_line_segment_object",
      fields: { COLOR: "WHITE" },
      inputs: { START: input(point(-3.6, 0)), END: input(point(3.6, 0)) },
    }),
    assign("tracker", { type: "visual_python_manim_value_tracker", inputs: { VALUE: number(32) } }),
    assign("line_r", alwaysRaw("Line(np.array([-3.6*np.cos(tracker.get_value()*DEGREES), -3.6*np.sin(tracker.get_value()*DEGREES), 0]), np.array([3.6*np.cos(tracker.get_value()*DEGREES), 3.6*np.sin(tracker.get_value()*DEGREES), 0]), color=WHITE)")),
    assign("ang_a", alwaysRaw("DecimalNumber(tracker.get_value(), num_decimal_places=0, unit=r'^{\\circ}', font_size=36, color=BLUE).move_to(np.array([1.35*np.cos(tracker.get_value()*DEGREES/2), 1.35*np.sin(tracker.get_value()*DEGREES/2), 0]))")),
    assign("ang_b", alwaysRaw("DecimalNumber(tracker.get_value(), num_decimal_places=0, unit=r'^{\\circ}', font_size=36, color=BLUE).move_to(np.array([1.35*np.cos(tracker.get_value()*DEGREES/2 + PI), 1.35*np.sin(tracker.get_value()*DEGREES/2 + PI), 0]))")),
    assign("note", textLabel("旋转其中一条直线，观察两个蓝色角", 0, -2.85, 24)),
    write("title", 0.7),
    write("caption1", 0.7),
    appear("line_h", 0.7),
    add("line_r"),
    add("ang_a"),
    add("ang_b"),
    write("note", 0.6),
    wait(0.35),
    playTimed({ type: "visual_python_manim_tracker_set_value_animation", inputs: { TRACKER: ref("tracker"), VALUE: number(68) } }, 4),
    wait(0.3),
    playTimed({ type: "visual_python_manim_tracker_set_value_animation", inputs: { TRACKER: ref("tracker"), VALUE: number(40) } }, 3),
    wait(1.2),
  )),
};
