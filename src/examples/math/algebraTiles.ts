import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, point, ref, sceneWorkspace, text, voiceover, voiceoverWithAnimation, wait } from "../manim/workspaceHelpers";

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const filledRectangle = (width: number, height: number, x: number, y: number, color: string) => moveTo({
  type: "visual_python_manim_set_fill",
  fields: { COLOR: color },
  inputs: {
    MOBJECT: input({
      type: "visual_python_manim_rectangle_object",
      fields: { COLOR: color },
      inputs: { WIDTH: number(width), HEIGHT: number(height) },
    }),
    OPACITY: number(0.8),
  },
}, x, y);

const outlineRectangle = (width: number, height: number, x: number, y: number) => moveTo({
  type: "visual_python_manim_rectangle_object",
  fields: { COLOR: "WHITE" },
  inputs: { WIDTH: number(width), HEIGHT: number(height) },
}, x, y);

const line = (x1: number, y1: number, x2: number, y2: number) => ({
  type: "visual_python_manim_line_segment_object",
  fields: { COLOR: "WHITE" },
  inputs: { START: input(point(x1, y1)), END: input(point(x2, y2)) },
});

const mathLabel = (content: string, x: number, y: number, color: string, size = 36) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const textLabel = (content: string, x: number, y: number, color = "WHITE", size = 32) => moveTo({
  type: "visual_python_manim_plain_text_object",
  fields: { COLOR: color },
  inputs: { CONTENT: text(content), FONT_SIZE: number(size) },
}, x, y);

const write = (name: string, seconds = 0.6) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

const appear = (name: string, seconds = 0.5) => play(create(name, seconds));

export const algebraTilesExample: ExampleProject = {
  id: "math-algebra-tiles",
  title: "整式乘法：代数瓷砖",
  projectName: "math-algebra-tiles.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("AlgebraTiles", "Scene", chain(
    assign("title", textLabel("整式乘法：代数瓷砖", 0, 3.35, "WHITE", 36)),
    assign("caption", textLabel("把 (x+2)(x+3) 看成矩形面积", 0, 2.72, "WHITE", 26)),
    assign("product", mathLabel("(x+2)(x+3)", 3.9, 1.7, "WHITE", 36)),
    assign("frame", outlineRectangle(4.1, 3.4, -2.15, -0.2)),
    assign("side_left", mathLabel("x+2", -4.85, -0.2, "WHITE", 30)),
    assign("side_bottom", mathLabel("x+3", -2.15, -2.28, "WHITE", 30)),
    assign("vcut0", line(-2.2, -1.9, -2.2, 1.5)),
    assign("hcut0", line(-4.2, -0.5, -0.1, -0.5)),
    assign("mark_x_left", mathLabel("x", -4.85, 0.5, "BLUE", 28)),
    assign("mark_2_left", mathLabel("2", -4.85, -1.2, "GREEN", 28)),
    assign("mark_x_bottom", mathLabel("x", -3.2, -2.28, "BLUE", 28)),
    assign("mark_3_bottom", mathLabel("3", -1.15, -2.28, "YELLOW", 28)),
    assign("vcut1", line(-1.5, -1.9, -1.5, 1.5)),
    assign("vcut2", line(-0.8, -1.9, -0.8, 1.5)),
    assign("hcut1", line(-4.2, -1.2, -0.1, -1.2)),
    assign("tile_x2", filledRectangle(2.0, 2.0, -3.2, 0.5, "BLUE")),
    assign("tile_vx0", filledRectangle(0.7, 2.0, -1.85, 0.5, "GREEN")),
    assign("tile_vx1", filledRectangle(0.7, 2.0, -1.15, 0.5, "GREEN")),
    assign("tile_vx2", filledRectangle(0.7, 2.0, -0.45, 0.5, "GREEN")),
    assign("tile_hx0", filledRectangle(2.0, 0.7, -3.2, -0.85, "GREEN")),
    assign("tile_hx1", filledRectangle(2.0, 0.7, -3.2, -1.55, "GREEN")),
    assign("tile_u00", filledRectangle(0.7, 0.7, -1.85, -1.55, "YELLOW")),
    assign("tile_u01", filledRectangle(0.7, 0.7, -1.15, -1.55, "YELLOW")),
    assign("tile_u02", filledRectangle(0.7, 0.7, -0.45, -1.55, "YELLOW")),
    assign("tile_u10", filledRectangle(0.7, 0.7, -1.85, -0.85, "YELLOW")),
    assign("tile_u11", filledRectangle(0.7, 0.7, -1.15, -0.85, "YELLOW")),
    assign("tile_u12", filledRectangle(0.7, 0.7, -0.45, -0.85, "YELLOW")),
    assign("label_x2", mathLabel("x^2", -3.2, 0.5, "WHITE", 40)),
    assign("label_3x", mathLabel("3x", -1.15, 0.5, "WHITE", 32)),
    assign("label_2x", mathLabel("2x", -3.2, -1.2, "WHITE", 32)),
    assign("label_6", mathLabel("6", -1.15, -1.2, "BLACK", 32)),
    assign("sum_line", mathLabel("x^2+3x+2x+6", 3.9, 0.35, "WHITE", 34)),
    assign("result", mathLabel("(x+2)(x+3)=x^2+5x+6", 3.55, -0.7, "WHITE", 30)),
    voiceoverWithAnimation("两个一次式相乘，可以看成一个矩形的面积。这个矩形的两边，分别是 x 加二，和 x 加三。", chain(write("title", 0.7), write("caption", 0.7), write("product", 0.7)), "default", "math-tiles-intro"),
    voiceoverWithAnimation("先画出这个矩形，并标出高是 x 加二，宽是 x 加三。", chain(appear("frame", 1), write("side_left", 0.5), write("side_bottom", 0.5)), "default", "math-tiles-frame"),
    voiceoverWithAnimation("沿着长度为 x 的地方画分割线。左上角这块，就是 x 乘 x，也就是 x 的平方。", chain(appear("vcut0", 0.4), appear("hcut0", 0.4), write("mark_x_left", 0.35), write("mark_x_bottom", 0.35)), "default", "math-tiles-x-cut"),
    voiceoverWithAnimation("剩下的高是二，宽是三。再把单位长度一也画出来，矩形就被分成了三种格子。", chain(appear("vcut1", 0.25), appear("vcut2", 0.25), appear("hcut1", 0.25), write("mark_2_left", 0.35), write("mark_3_bottom", 0.35)), "default", "math-tiles-unit-cut"),
    voiceoverWithAnimation("蓝色大方块是 x 的平方。", chain(appear("tile_x2", 0.8), write("label_x2", 0.45)), "default", "math-tiles-x2"),
    voiceoverWithAnimation("右边三块绿色长条，每一块都是一乘 x，合起来是三 x。", chain(appear("tile_vx0", 0.32), appear("tile_vx1", 0.32), appear("tile_vx2", 0.32), write("label_3x", 0.4)), "default", "math-tiles-3x"),
    voiceoverWithAnimation("下边两块绿色长条，每一块都是 x 乘一，合起来是二 x。", chain(appear("tile_hx0", 0.32), appear("tile_hx1", 0.32), write("label_2x", 0.4)), "default", "math-tiles-2x"),
    voiceoverWithAnimation("右下角六个黄色小方块，每块面积都是一，合起来是六。", chain(appear("tile_u00", 0.2), appear("tile_u01", 0.2), appear("tile_u02", 0.2), appear("tile_u10", 0.2), appear("tile_u11", 0.2), appear("tile_u12", 0.2), write("label_6", 0.4)), "default", "math-tiles-ones"),
    voiceoverWithAnimation("把四块面积加起来：x 平方，加三 x，加二 x，加六，就是 x 平方加五 x 加六。", chain(write("sum_line", 0.8), write("result", 1)), "default", "math-tiles-sum"),
    voiceover("所以整式乘法，可以记成拼瓷砖：大格是 x 平方，长条是 x，小格是一。", "default", "math-tiles-summary"),
    wait(0.8),
  )),
};
