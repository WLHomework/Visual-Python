import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, list, number, play, point, ref, sceneWorkspace, text, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const mathTex = (content: string, color: string, size = 48) => ({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
});

const write = (name: string, seconds = 1) => play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) } });

export const narratedPythagoreanTheoremExample: ExampleProject = {
  id: "manim-narrated-pythagorean-theorem",
  title: "配音讲解：勾股定理",
  projectName: "narrated-pythagorean-theorem.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedPythagoreanTheorem", "Scene", chain(
    assign("title", moveTo({ type: "visual_python_manim_plain_text_object", fields: { COLOR: "BLUE" }, inputs: { CONTENT: text("勾股定理"), FONT_SIZE: number(44) } }, 0, 3.1)),
    assign("triangle", { type: "visual_python_manim_polygon_from_list_object", fields: { COLOR: "YELLOW" }, inputs: { POINTS: list(point(-5, -2), point(-1, -2), point(-5, 1)) } }),
    assign("a_label", moveTo(mathTex("a=3", "GREEN", 36), -5.55, -0.5)),
    assign("b_label", moveTo(mathTex("b=4", "BLUE", 36), -3, -2.45)),
    assign("c_label", moveTo(mathTex("c=5", "YELLOW", 36), -2.65, -0.25)),
    assign("formula", moveTo(mathTex("a^2+b^2=c^2", "WHITE", 52), 2.7, 0.9)),
    assign("numbers", moveTo(mathTex("3^2+4^2=5^2", "BLUE", 50), 2.7, 0.9)),
    assign("result", moveTo(mathTex("9+16=25", "GREEN", 54), 2.7, 0.9)),
    voiceoverWithAnimation("勾股定理描述的是直角三角形三条边之间的关系。", chain(write("title", 0.8), play(create("triangle", 1.5))), "default", "pythagorean-narrated-intro"),
    voiceoverWithAnimation("两条直角边分别记作 a 和 b，斜边记作 c。", chain(write("a_label", 0.5), write("b_label", 0.5), write("c_label", 0.5)), "default", "pythagorean-narrated-sides"),
    voiceoverWithAnimation("勾股定理告诉我们，a 的平方加 b 的平方，等于 c 的平方。", write("formula", 1.4), "default", "pythagorean-narrated-formula"),
    voiceoverWithAnimation("在这个三四五直角三角形中，代入边长可以得到三的平方加四的平方等于五的平方。", play({ type: "visual_python_manim_transform_to_animation", inputs: { SOURCE: ref("formula"), TARGET: ref("numbers"), RUN_TIME: number(1.5) } }), "default", "pythagorean-narrated-substitute"),
    voiceoverWithAnimation("计算后得到九加十六等于二十五，等式成立。", play({ type: "visual_python_manim_transform_to_animation", inputs: { SOURCE: ref("formula"), TARGET: ref("result"), RUN_TIME: number(1.3) } }), "default", "pythagorean-narrated-result"),
    voiceover("所以，只要知道直角三角形的两条边，就可以利用勾股定理求出另一条边。", "default", "pythagorean-narrated-summary"),
    wait(0.8),
  )),
};
