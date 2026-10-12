import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, list, number, play, point, ref, sceneWorkspace, text, voiceoverWithAnimation, wait } from "../manim/workspaceHelpers";

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const textLabel = (content: string, x: number, y: number, size: number, color = "WHITE") => moveTo({
  type: "visual_python_manim_plain_text_object",
  fields: { COLOR: color },
  inputs: { CONTENT: text(content), FONT_SIZE: number(size) },
}, x, y);

const mathLabel = (content: string, x: number, y: number, color: string, size = 32) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const polygon = (color: string, ...pts: Array<[number, number]>) => ({
  type: "visual_python_manim_polygon_from_list_object",
  fields: { COLOR: color },
  inputs: { POINTS: list(...pts.map(([x, y]) => point(x, y))) },
});

const filled = (mobject: object, color: string, opacity: number) => ({
  type: "visual_python_manim_set_fill",
  fields: { COLOR: color },
  inputs: { MOBJECT: input(mobject), OPACITY: number(opacity) },
});

const line = (x1: number, y1: number, x2: number, y2: number, color = "WHITE") => ({
  type: "visual_python_manim_line_segment_object",
  fields: { COLOR: color },
  inputs: { START: input(point(x1, y1)), END: input(point(x2, y2)) },
});

const write = (name: string, seconds = 0.7) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

const appear = (name: string, seconds = 0.55) => play(create(name, seconds));

const playList = (names: string[], seconds = 1.15, lag = 0.22) => ({
  type: "visual_python_manim_play_list",
  inputs: {
    ANIMATIONS: list(...names.map((name) => ({
      type: "visual_python_manim_create_object_animation",
      inputs: { MOBJECT: ref(name), RUN_TIME: number(0.65) },
    }))),
    RUN_TIME: number(seconds),
    LAG_RATIO: number(lag),
  },
});

const writeList = (names: string[], seconds = 1.1, lag = 0.18) => ({
  type: "visual_python_manim_play_list",
  inputs: {
    ANIMATIONS: list(...names.map((name) => ({
      type: "visual_python_manim_write_animation",
      inputs: { MOBJECT: ref(name), RUN_TIME: number(0.5) },
    }))),
    RUN_TIME: number(seconds),
    LAG_RATIO: number(lag),
  },
});

const clearScene = () => ({ type: "visual_python_manim_clear" });

export const pythagoreanTheoremExample: ExampleProject = {
  id: "math-pythagorean-theorem",
  title: "勾股定理",
  projectName: "math-pythagorean-theorem.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("PythagoreanTheorem", "Scene", chain(
    assign("cover_kicker", textLabel("初中数学", -3.55, 2.45, 26, "BLUE")),
    assign("cover_title", textLabel("勾股定理", -3.55, 1.45, 52)),
    assign("cover_sub", textLabel("直角三角形里的平方关系", -3.55, 0.55, 24, "GRAY")),
    assign("cover_eq", mathLabel("a^2+b^2=c^2", -3.55, -0.4, "YELLOW", 40)),
    assign("cover_hint", textLabel("两个小正方形，铺满一个大正方形", -3.55, -1.25, 22, "GRAY")),
    assign("cover_tri", polygon("WHITE", [1.8, -1.3], [1.8, 0.35], [4.0, -1.3])),
    assign("cover_right_h", line(1.8, -1.02, 2.08, -1.02)),
    assign("cover_right_v", line(2.08, -1.02, 2.08, -1.3)),
    assign("cover_sq_a", filled(polygon("BLUE", [0.15, -1.3], [1.8, -1.3], [1.8, 0.35], [0.15, 0.35]), "BLUE", 0.32)),
    assign("cover_sq_b", filled(polygon("GREEN", [1.8, -1.3], [4.0, -1.3], [4.0, -3.5], [1.8, -3.5]), "GREEN", 0.32)),
    assign("cover_sq_c", filled(polygon("YELLOW", [1.8, 0.35], [4.0, -1.3], [5.65, 0.9], [3.45, 2.55]), "YELLOW", 0.32)),
    assign("cover_a2", mathLabel("a^2", 0.98, -0.48, "BLUE", 28)),
    assign("cover_b2", mathLabel("b^2", 2.9, -2.4, "GREEN", 28)),
    assign("cover_c2", mathLabel("c^2", 3.73, 0.63, "YELLOW", 30)),
    voiceoverWithAnimation("直角三角形里，两个小正方形，能铺满斜边上的大正方形。这就是勾股定理。", chain(
      write("cover_kicker", 0.45),
      write("cover_title", 0.85),
      write("cover_sub", 0.5),
      appear("cover_tri", 0.7),
      appear("cover_right_h", 0.25),
      appear("cover_right_v", 0.25),
      playList(["cover_sq_a", "cover_sq_b", "cover_sq_c"], 1.35, 0.28),
      write("cover_a2", 0.35),
      write("cover_b2", 0.35),
      write("cover_c2", 0.4),
      write("cover_eq", 0.7),
      write("cover_hint", 0.55),
    ), "default", "math-pythagorean-cover"),
    wait(0.35),
    clearScene(),

    assign("t1_title", textLabel("直角三角形", 3.55, 2.55, 32, "BLUE")),
    assign("t1_tri", polygon("WHITE", [-1.8, -1.0], [-1.8, 0.8], [0.6, -1.0])),
    assign("t1_rh", line(-1.8, -0.72, -1.52, -0.72)),
    assign("t1_rv", line(-1.52, -0.72, -1.52, -1.0)),
    assign("t1_A", textLabel("A", -2.15, 1.05, 26)),
    assign("t1_B", textLabel("B", 0.95, -1.25, 26)),
    assign("t1_C", textLabel("C", -2.15, -1.35, 26)),
    assign("t1_a", textLabel("勾  a", -2.55, -0.05, 24, "BLUE")),
    assign("t1_b", textLabel("股  b", -0.6, -1.45, 24, "GREEN")),
    assign("t1_c", textLabel("弦  c", 0.15, 0.35, 24, "YELLOW")),
    assign("t1_note", textLabel("直角在 C，斜边对着直角", 3.55, 1.55, 22, "GRAY")),
    voiceoverWithAnimation("先看这个直角三角形。直角在 C。对着直角的边叫斜边，也叫弦；另外两条叫直角边，古人叫勾和股。", chain(
      write("t1_title", 0.5),
      appear("t1_tri", 0.75),
      appear("t1_rh", 0.2),
      appear("t1_rv", 0.2),
      writeList(["t1_A", "t1_B", "t1_C"], 0.85, 0.2),
      writeList(["t1_a", "t1_b", "t1_c"], 1.0, 0.22),
      write("t1_note", 0.55),
    ), "default", "math-pythagorean-triangle"),
    wait(0.25),
    clearScene(),

    assign("t2_title", textLabel("勾股定理", 3.7, 2.55, 32, "BLUE")),
    assign("t2_tri", polygon("WHITE", [-1.8, -1.0], [-1.8, 0.8], [0.6, -1.0])),
    assign("t2_rh", line(-1.8, -0.72, -1.52, -0.72)),
    assign("t2_rv", line(-1.52, -0.72, -1.52, -1.0)),
    assign("t2_sq_a", filled(polygon("BLUE", [-3.6, -1.0], [-1.8, -1.0], [-1.8, 0.8], [-3.6, 0.8]), "BLUE", 0.32)),
    assign("t2_sq_b", filled(polygon("GREEN", [-1.8, -1.0], [0.6, -1.0], [0.6, -3.4], [-1.8, -3.4]), "GREEN", 0.32)),
    assign("t2_sq_c", filled(polygon("YELLOW", [-1.8, 0.8], [0.6, -1.0], [2.4, 1.4], [0.0, 3.2]), "YELLOW", 0.28)),
    assign("t2_a2", mathLabel("a^2", -2.7, -0.1, "BLUE", 30)),
    assign("t2_b2", mathLabel("b^2", -0.6, -2.2, "GREEN", 30)),
    assign("t2_c2", mathLabel("c^2", 0.3, 1.1, "YELLOW", 30)),
    assign("t2_eq", mathLabel("a^2+b^2=c^2", 3.7, 1.35, "YELLOW", 36)),
    assign("t2_line1", textLabel("直角边平方和", 3.7, 0.35, 24)),
    assign("t2_line2", textLabel("等于斜边平方", 3.7, -0.35, 24)),
    voiceoverWithAnimation("勾股定理说：两条直角边上正方形的面积加起来，正好等于斜边上那个正方形的面积。", chain(
      write("t2_title", 0.45),
      appear("t2_tri", 0.55),
      appear("t2_rh", 0.18),
      appear("t2_rv", 0.18),
      playList(["t2_sq_a", "t2_sq_b", "t2_sq_c"], 1.4, 0.28),
      writeList(["t2_a2", "t2_b2", "t2_c2"], 0.95, 0.2),
      write("t2_eq", 0.7),
      write("t2_line1", 0.4),
      write("t2_line2", 0.4),
    ), "default", "math-pythagorean-theorem"),
    wait(0.25),
    clearScene(),

    assign("t3_title", textLabel("赵爽弦图", 3.7, 2.6, 32, "BLUE")),
    assign("t3_outer", polygon("WHITE", [-1.4, -1.2], [1.4, -1.2], [1.4, 1.6], [-1.4, 1.6])),
    assign("t3_t1", filled(polygon("ORANGE", [-1.4, -1.2], [0.2, -1.2], [-1.4, 0.0]), "ORANGE", 0.38)),
    assign("t3_t2", filled(polygon("ORANGE", [1.4, -1.2], [1.4, 0.4], [0.2, -1.2]), "ORANGE", 0.38)),
    assign("t3_t3", filled(polygon("ORANGE", [1.4, 1.6], [-0.2, 1.6], [1.4, 0.4]), "ORANGE", 0.38)),
    assign("t3_t4", filled(polygon("ORANGE", [-1.4, 1.6], [-1.4, 0.0], [-0.2, 1.6]), "ORANGE", 0.38)),
    assign("t3_inner", filled(polygon("YELLOW", [0.2, -1.2], [1.4, 0.4], [-0.2, 1.6], [-1.4, 0.0]), "YELLOW", 0.4)),
    assign("t3_ab", mathLabel("a+b", 0, 1.95, "WHITE", 28)),
    assign("t3_c", mathLabel("c", 0, 0.2, "YELLOW", 32)),
    assign("t3_f1", mathLabel("(a+b)^2", 3.7, 1.55, "WHITE", 30)),
    assign("t3_f2", mathLabel("=a^2+2ab+b^2", 3.7, 0.75, "WHITE", 28)),
    assign("t3_f3", textLabel("四个三角形 + 中间", 3.7, -0.05, 22, "GRAY")),
    assign("t3_f4", mathLabel("=2ab+c^2", 3.7, -0.85, "WHITE", 28)),
    assign("t3_f5", mathLabel("a^2+b^2=c^2", 3.7, -1.85, "YELLOW", 34)),
    voiceoverWithAnimation("古人用一张图就讲完了。大正方形面积可以看成 a 加 b 的平方；也可以看成四个直角三角形，加上中间斜放的正方形。两种算法是同一块地，减掉相同的四个三角形，就只剩下勾股定理。", chain(
      write("t3_title", 0.45),
      appear("t3_outer", 0.7),
      playList(["t3_t1", "t3_t2", "t3_t3", "t3_t4"], 1.6, 0.22),
      appear("t3_inner", 0.7),
      write("t3_ab", 0.35),
      write("t3_c", 0.35),
      write("t3_f1", 0.45),
      write("t3_f2", 0.5),
      write("t3_f3", 0.4),
      write("t3_f4", 0.5),
      write("t3_f5", 0.7),
    ), "default", "math-pythagorean-chord"),
    wait(0.3),
    clearScene(),

    assign("t4_title", textLabel("最小整数边：3、4、5", 0, 3.15, 32, "BLUE")),
    assign("t4_tri", polygon("WHITE", [-2.6, -1.1], [-2.6, 0.55], [-0.4, -1.1])),
    assign("t4_rh", line(-2.6, -0.82, -2.32, -0.82)),
    assign("t4_rv", line(-2.32, -0.82, -2.32, -1.1)),
    assign("t4_3", mathLabel("3", -3.05, -0.25, "BLUE", 32)),
    assign("t4_4", mathLabel("4", -1.5, -1.55, "GREEN", 32)),
    assign("t4_5", mathLabel("5", -0.85, 0.05, "YELLOW", 32)),
    assign("t4_e1", mathLabel("3^2+4^2", 2.85, 1.55, "WHITE", 34)),
    assign("t4_e2", mathLabel("=9+16", 2.85, 0.7, "WHITE", 34)),
    assign("t4_e3", mathLabel("=25", 2.85, -0.15, "WHITE", 34)),
    assign("t4_e4", mathLabel("=5^2", 2.85, -1.0, "YELLOW", 36)),
    assign("t4_note", textLabel("也可以反过来判断直角", 2.85, -1.95, 22, "GRAY")),
    voiceoverWithAnimation("最小的整数边就是三、四、五。九加十六等于二十五。所以它是直角三角形。也可以倒过来：先量三边，再用这个式子判断有没有直角。", chain(
      write("t4_title", 0.55),
      appear("t4_tri", 0.7),
      appear("t4_rh", 0.18),
      appear("t4_rv", 0.18),
      writeList(["t4_3", "t4_4", "t4_5"], 0.9, 0.2),
      write("t4_e1", 0.45),
      write("t4_e2", 0.4),
      write("t4_e3", 0.4),
      write("t4_e4", 0.55),
      write("t4_note", 0.45),
    ), "default", "math-pythagorean-345"),
    wait(0.25),
    clearScene(),

    assign("t5_title", textLabel("能算什么", 0, 3.15, 32, "BLUE")),
    assign("t5_wall", line(-5.1, -1.5, -5.1, 1.15, "GRAY")),
    assign("t5_floor", line(-5.1, -1.5, -2.7, -1.5, "GRAY")),
    assign("t5_ladder", line(-2.7, -1.5, -5.1, 1.15, "ORANGE")),
    assign("t5_l4", mathLabel("4", -5.55, -0.15, "BLUE", 28)),
    assign("t5_l3", mathLabel("3", -3.9, -1.9, "GREEN", 28)),
    assign("t5_lc", textLabel("梯子  c = 5", -3.9, 1.55, 24, "YELLOW")),
    assign("t5_p", line(1.5, -1.4, 3.3, -1.4)),
    assign("t5_n", line(3.3, -1.4, 3.3, 0.05)),
    assign("t5_d", line(1.5, -1.4, 3.3, 0.05, "YELLOW")),
    assign("t5_8", mathLabel("8", 2.4, -1.85, "GREEN", 26)),
    assign("t5_6", mathLabel("6", 3.75, -0.65, "BLUE", 26)),
    assign("t5_10", mathLabel("10", 1.85, -0.35, "YELLOW", 28)),
    assign("t5_map", textLabel("向东 8，向北 6", 2.55, 1.55, 22, "GRAY")),
    voiceoverWithAnimation("量不出斜边时，就用两直角边算。梯子多长、拐弯后两点多远，都是同一件事。", chain(
      write("t5_title", 0.45),
      appear("t5_wall", 0.35),
      appear("t5_floor", 0.35),
      appear("t5_ladder", 0.7),
      write("t5_l4", 0.3),
      write("t5_l3", 0.3),
      write("t5_lc", 0.5),
      appear("t5_p", 0.35),
      appear("t5_n", 0.35),
      appear("t5_d", 0.55),
      writeList(["t5_8", "t5_6", "t5_10"], 0.85, 0.18),
      write("t5_map", 0.4),
    ), "default", "math-pythagorean-use"),
    wait(0.25),
    clearScene(),

    assign("t6_1", textLabel("直角三角形", 0, 1.55, 36)),
    assign("t6_2", mathLabel("a^2+b^2=c^2", 0, 0.35, "YELLOW", 48)),
    assign("t6_3", textLabel("直角边平方和 等于 斜边平方", 0, -0.75, 28)),
    assign("t6_4", textLabel("弦图：同一面积，两种算法", 0, -1.75, 24, "GRAY")),
    voiceoverWithAnimation("记住画面：两个小正方形，能恰好铺满斜边上的大正方形。这就是勾股定理。", chain(
      write("t6_1", 0.55),
      write("t6_2", 0.8),
      write("t6_3", 0.55),
      write("t6_4", 0.5),
    ), "default", "math-pythagorean-summary"),
    wait(0.8),
  )),
};
