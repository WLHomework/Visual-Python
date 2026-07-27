import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, range, raw, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const c2p = (x: number, y: number) => input({ type: "visual_python_manim_axes_c2p", inputs: { AXES: ref("axes"), X: number(x), Y: number(y) } });
const dot = (x: number, y: number, color: string) => ({ type: "visual_python_manim_dot_object", fields: { COLOR: color }, inputs: { POINT: c2p(x, y), RADIUS: number(0.11) } });
const moveTo = (mobject: object, x: number, y: number) => ({ type: "visual_python_manim_move_to", inputs: { MOBJECT: input(mobject), POINT: input({ type: "visual_python_manim_point", inputs: { X: number(x), Y: number(y), Z: number(0) } }) } });
const transform = (source: string, target: string, seconds: number) => play({ type: "visual_python_manim_transform_to_animation", inputs: { SOURCE: ref(source), TARGET: ref(target), RUN_TIME: number(seconds) } });
const write = (name: string, seconds = 1) => play({ type: "visual_python_manim_write_animation", inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) } });

export const narratedLimitDialogueExample: ExampleProject = {
  id: "manim-narrated-limit-dialogue",
  title: "角色对话：理解极限",
  projectName: "narrated-limit-dialogue.vpy",
  requiredPlugins: ["visual-python.manim"],
  plugins: {
    requirements: [{ id: "visual-python.manim", version: "0.1.0" }],
    data: {
      "visual-python.manim.voiceover-roles": [
        { id: "teacher", name: "老师", model: "qwen-audio-3.0-tts-plus", voice: "longanlufeng", speed: 0.95, previewText: "我们一步一步理解极限。" },
        { id: "student", name: "学生", model: "qwen-audio-3.0-tts-flash", voice: "longanxiaoxin", speed: 1.05, previewText: "极限是不是一定要到达呢？" },
      ],
    },
  },
  workspace: sceneWorkspace("NarratedLimitDialogue", "Scene", chain(
    assign("axes", { type: "visual_python_manim_axes_object", inputs: { X_RANGE: range(-1, 5, 1), Y_RANGE: range(0, 6, 1), X_LENGTH: number(8), Y_LENGTH: number(5.5) } }),
    assign("curve", { type: "visual_python_manim_axes_plot", fields: { COLOR: "BLUE" }, inputs: { AXES: ref("axes"), FUNCTION: raw("lambda x: x + 1"), X_RANGE: range(-0.5, 4.3) } }),
    assign("moving_point", dot(4, 5, "YELLOW")),
    assign("point_near", dot(1.8, 2.8, "YELLOW")),
    assign("point_closer", dot(1.2, 2.2, "YELLOW")),
    assign("limit_point", { type: "visual_python_manim_move_to", inputs: { MOBJECT: input({ type: "visual_python_manim_circle_object", fields: { COLOR: "RED" }, inputs: { RADIUS: number(0.12) } }), POINT: c2p(1, 2) } }),
    assign("formula", moveTo({ type: "visual_python_manim_mathtex_object", fields: { COLOR: "WHITE" }, inputs: { CONTENT: formula("\\lim_{x\\to1}(x+1)=2"), FONT_SIZE: number(48) } }, 2.8, 2.6)),
    voiceoverWithAnimation("老师：观察函数 y 等于 x 加一。我们让黄色点沿图像逐渐靠近 x 等于一的位置。", chain(play(create("axes", 1)), play(create("curve", 1.3)), play(create("moving_point", 0.4))), "teacher", "limit-dialogue-teacher-intro"),
    voiceover("学生：极限是不是表示这个点最后一定要到达目标位置？", "student", "limit-dialogue-student-question"),
    voiceoverWithAnimation("老师：不一定。极限关心的是无限靠近时的趋势。先靠近一些，再靠近一些。", chain(transform("moving_point", "point_near", 1.4), transform("moving_point", "point_closer", 1.4)), "teacher", "limit-dialogue-teacher-approach"),
    voiceover("学生：也就是说，我们观察的是函数值越来越接近哪个数。", "student", "limit-dialogue-student-understanding"),
    voiceoverWithAnimation("老师：对。当 x 越来越接近一，x 加一就越来越接近二，所以这个极限等于二。", chain(play(create("limit_point", 0.6)), write("formula", 1.2)), "teacher", "limit-dialogue-teacher-result"),
    voiceover("学生：我明白了。极限描述的是接近的过程和趋势，而不只是最终有没有到达。", "student", "limit-dialogue-student-summary"),
    wait(0.8),
  )),
};
