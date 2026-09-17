import type { ExampleProject } from "../types";
import { assign, chain, formula, input, number, play, point, ref, sceneWorkspace, text, voiceover, voiceoverWithAnimation, wait } from "../manim/workspaceHelpers";

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const mathLabel = (content: string, x: number, y: number, color: string, size = 42) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const textLabel = (content: string, x: number, y: number, color: string, size = 36) => moveTo({
  type: "visual_python_manim_plain_text_object",
  fields: { COLOR: color },
  inputs: { CONTENT: text(content), FONT_SIZE: number(size) },
}, x, y);

const write = (name: string, seconds = 0.55) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

const moveAnim = (name: string, x: number, y: number, seconds = 1) => play({
  type: "visual_python_manim_animate_move_to",
  inputs: { MOBJECT: ref(name), POINT: input(point(x, y)), RUN_TIME: number(seconds) },
});

export const likeTermsExample: ExampleProject = {
  id: "math-like-terms",
  title: "单项式、多项式与同类项",
  projectName: "math-like-terms.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("LikeTermsIdentification", "Scene", chain(
    assign("title", textLabel("单项式、多项式与同类项", 0, 3.15, "WHITE", 40)),
    assign("term_3x2", mathLabel("3x^2", -5.4, 1.55, "BLUE", 44)),
    assign("term_2x", mathLabel("+\\,2x", -3.3, 1.55, "GREEN", 44)),
    assign("term_const5", mathLabel("-\\,5", -1.3, 1.55, "YELLOW", 44)),
    assign("term_x2", mathLabel("+\\,x^2", 0.7, 1.55, "BLUE", 44)),
    assign("term_4x", mathLabel("-\\,4x", 2.7, 1.55, "GREEN", 44)),
    assign("term_1", mathLabel("+\\,1", 4.6, 1.55, "YELLOW", 44)),
    assign("caption_mono", textLabel("单项式：只有一个项", -3.4, 0.35, "WHITE", 28)),
    assign("caption_poly", textLabel("多项式：多个项相加", 3.1, 0.35, "WHITE", 28)),
    assign("merged_blue", mathLabel("4x^2", -3.6, -2.25, "BLUE", 48)),
    assign("merged_green", mathLabel("-\\,2x", 0, -2.25, "GREEN", 48)),
    assign("merged_yellow", mathLabel("-\\,4", 3.4, -2.25, "YELLOW", 48)),
    assign("result", mathLabel("3x^2+2x-5+x^2-4x+1=4x^2-2x-4", 0, -3.25, "WHITE", 32)),
    voiceoverWithAnimation("先记住两个名字。只有一个项的式子叫单项式，由多个项相加组成的式子叫多项式。", chain(write("title", 0.9), write("caption_mono", 0.6), write("caption_poly", 0.6)), "default", "math-like-terms-names"),
    voiceoverWithAnimation("看这个多项式。它一共有六项：三个二次项、一次项和常数项混在一起。", chain(
      write("term_3x2", 0.45),
      write("term_2x", 0.4),
      write("term_const5", 0.4),
      write("term_x2", 0.4),
      write("term_4x", 0.4),
      write("term_1", 0.4),
    ), "default", "math-like-terms-poly"),
    voiceover("相同字母、相同次数的项是同类项。蓝色都是 x 平方，绿色都是 x，黄色都是常数。同类项用了同一种颜色。", "default", "math-like-terms-color"),
    voiceoverWithAnimation("现在把同类项拖到一起。两块蓝色先靠拢，两块绿色再靠拢，两块黄色也靠拢。", chain(
      moveAnim("term_3x2", -4.9, -0.75, 1),
      moveAnim("term_x2", -3.2, -0.75, 1),
      moveAnim("term_2x", -0.7, -0.75, 1),
      moveAnim("term_4x", 1.0, -0.75, 1),
      moveAnim("term_const5", 3.3, -0.75, 1),
      moveAnim("term_1", 4.8, -0.75, 1),
    ), "default", "math-like-terms-drag"),
    voiceoverWithAnimation("合并同类项，就是把相同颜色的系数加起来。三加一得四 x 平方，二减四得负二 x，负五加一得负四。", chain(
      write("merged_blue", 0.7),
      write("merged_green", 0.6),
      write("merged_yellow", 0.6),
      write("result", 1.1),
    ), "default", "math-like-terms-merge"),
    voiceover("所以识别同类项的关键只有两点：字母相同，次数也相同。颜色只是帮助我们看见这件事。", "default", "math-like-terms-summary"),
    wait(0.8),
  )),
};
