import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, list, number, play, point, raw, ref, scaledDirection, sceneWorkspace, text, wait } from "../manim/workspaceHelpers";

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
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

const write = (name: string, seconds = 0.5) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

const appear = (name: string, seconds = 0.55) => play(create(name, seconds));
const add = (name: string) => ({ type: "visual_python_manim_add", inputs: { MOBJECT: ref(name) } });
const alwaysRaw = (code: string) => ({ type: "visual_python_manim_always_redraw", inputs: { MOBJECT: raw(code) } });

const triangle = (color: string) => ({
  type: "visual_python_manim_polygon_from_list_object",
  fields: { COLOR: color },
  inputs: { POINTS: list(point(-4.1, -0.7), point(-2.5, 1.35), point(-1.5, -1.1)) },
});

export const translationExample: ExampleProject = {
  id: "math-translation",
  title: "平移",
  projectName: "math-translation.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("TranslationDemo", "Scene", chain(
    assign("title", textLabel("平移", 0, 3.3, 36)),
    assign("caption1", textLabel("图形上每个点都沿同一方向移动相同距离", 0, 2.7, 24)),
    assign("caption2", textLabel("对应点连线平行且相等", 0, 2.7, 24)),
    assign("tri", triangle("BLUE")),
    assign("tri2", triangle("GREEN")),
    assign("label_a", mathLabel("A", -4.35, -0.95, "BLUE", 28)),
    assign("label_b", mathLabel("B", -2.5, 1.65, "BLUE", 28)),
    assign("label_c", mathLabel("C", -1.35, -1.4, "BLUE", 28)),
    assign("label_ap", mathLabel("A'", 0.3, -1.05, "GREEN", 28)),
    assign("label_bp", mathLabel("B'", 1.9, 1.65, "GREEN", 28)),
    assign("label_cp", mathLabel("C'", 3.0, -1.45, "GREEN", 28)),
    assign("seg_a", alwaysRaw("Line(tri.get_vertices()[0], tri2.get_vertices()[0], color=YELLOW)")),
    assign("seg_b", alwaysRaw("Line(tri.get_vertices()[1], tri2.get_vertices()[1], color=YELLOW)")),
    assign("seg_c", alwaysRaw("Line(tri.get_vertices()[2], tri2.get_vertices()[2], color=YELLOW)")),
    assign("note", textLabel("黄线就是对应点连线，彼此平行且等长", 0, -2.85, 24)),
    write("title", 0.65),
    write("caption1", 0.7),
    appear("tri", 0.8),
    write("label_a", 0.3),
    write("label_b", 0.3),
    write("label_c", 0.3),
    wait(0.35),
    appear("tri2", 0.2),
    add("seg_a"),
    add("seg_b"),
    add("seg_c"),
    play({
      type: "visual_python_manim_animate_shift",
      inputs: { MOBJECT: ref("tri2"), VECTOR: scaledDirection("RIGHT", 4.4), RUN_TIME: number(2.8) },
    }),
    write("label_ap", 0.35),
    write("label_bp", 0.35),
    write("label_cp", 0.35),
    play({
      type: "visual_python_manim_fade_animation",
      fields: { ANIMATION: "FadeOut" },
      inputs: { MOBJECT: ref("caption1") },
    }),
    write("caption2", 0.7),
    write("note", 0.7),
    wait(1.4),
  )),
};
