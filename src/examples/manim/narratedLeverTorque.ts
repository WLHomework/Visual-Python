import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, list, number, play, point, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 36) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const beam = (x1: number, y1: number, x2: number, y2: number, color = "WHITE") => ({
  type: "visual_python_manim_line_segment_object",
  fields: { COLOR: color },
  inputs: { START: input(point(x1, y1)), END: input(point(x2, y2)) },
});

const force = (x: number, beamY: number, topY: number, color: string) => ({
  type: "visual_python_manim_arrow_object",
  fields: { COLOR: color },
  inputs: { START: input(point(x, topY)), END: input(point(x, beamY + 0.08)), BUFF: number(0) },
});

const transform = (source: string, target: string, seconds = 0.9) => play({
  type: "visual_python_manim_transform_to_animation",
  inputs: { SOURCE: ref(source), TARGET: ref(target), RUN_TIME: number(seconds) },
});

const write = (name: string, seconds = 0.7) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedLeverTorqueExample: ExampleProject = {
  id: "manim-narrated-lever-torque",
  title: "力学：杠杆平衡与力矩",
  projectName: "narrated-lever-torque.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedLeverTorque", "Scene", chain(
    assign("pivot", {
      type: "visual_python_manim_polygon_from_list_object",
      fields: { COLOR: "YELLOW" },
      inputs: { POINTS: list(point(-0.65, -1.35), point(0.65, -1.35), point(0, 0)) },
    }),
    assign("beam_balanced", beam(-4.5, 0, 4.5, 0)),
    assign("beam_tilted", beam(-4.43, -0.78, 4.43, 0.78, "RED")),
    assign("beam_return", beam(-4.5, 0, 4.5, 0, "GREEN")),
    assign("left_force", force(-4, 0, 1.45, "BLUE")),
    assign("left_force_tilted", force(-3.94, -0.69, 0.8, "BLUE")),
    assign("left_force_return", force(-4, 0, 1.45, "BLUE")),
    assign("right_force_far", force(4, 0, 1.45, "GREEN")),
    assign("right_force_near", force(2, 0.35, 1.55, "GREEN")),
    assign("right_force_strong", force(2, 0, 2.25, "RED")),
    assign("pivot_label", mathLabel("\\text{pivot}", 0, -1.8, "YELLOW", 30)),
    assign("left_label", mathLabel("F_1", -4.45, 1.55, "BLUE", 34)),
    assign("right_label", mathLabel("F_2", 4.45, 1.55, "GREEN", 34)),
    assign("right_near_label", mathLabel("F_2", 2.45, 1.7, "GREEN", 34)),
    assign("right_strong_label", mathLabel("2F_1", 2.65, 2.35, "RED", 34)),
    assign("torque_formula", mathLabel("\\tau=F\\times r", 0, 3.15, "WHITE", 42)),
    assign("balanced_rule", mathLabel("F_1\\cdot4=F_2\\cdot4", 0, -2.45, "GREEN", 38)),
    assign("unbalanced_rule", mathLabel("F_1\\cdot4>F_2\\cdot2", 0, -2.45, "RED", 38)),
    assign("restored_rule", mathLabel("F_1\\cdot4=(2F_1)\\cdot2", 0, -2.45, "YELLOW", 38)),
    voiceoverWithAnimation("杠杆绕黄色支点转动。力矩等于作用力乘以力臂，也就是力到支点的垂直距离。", chain(play(create("pivot", 0.6)), play(create("beam_balanced", 0.8)), write("pivot_label", 0.4), write("torque_formula", 0.8)), "default", "lever-definition"),
    voiceoverWithAnimation("左右两侧施加相同大小的力，并且距离支点都为四个单位。两个方向相反的力矩相等，杠杆保持水平。", chain(play(create("left_force", 0.6)), play(create("right_force_far", 0.6)), write("left_label", 0.4), write("right_label", 0.4), write("balanced_rule", 0.8)), "default", "lever-balanced"),
    voiceoverWithAnimation("现在把右侧作用点移到距离支点两个单位的位置，力的大小暂时不变。", chain(transform("right_force_far", "right_force_near", 0.9), transform("right_label", "right_near_label", 0.6)), "default", "lever-move-force"),
    voiceoverWithAnimation("右侧力臂缩短后，右侧力矩变小。左侧力矩更大，杠杆因此向左侧倾斜。", chain(transform("beam_balanced", "beam_tilted", 1), transform("left_force", "left_force_tilted", 0.7), transform("balanced_rule", "unbalanced_rule", 0.7)), "default", "lever-unbalanced"),
    voiceoverWithAnimation("要在较短力臂上恢复平衡，右侧力必须增大到原来的两倍，使两侧力矩再次相等。", chain(transform("right_force_far", "right_force_strong", 0.8), transform("right_label", "right_strong_label", 0.6), transform("beam_balanced", "beam_return", 1), transform("left_force", "left_force_return", 0.7), transform("balanced_rule", "restored_rule", 0.8)), "default", "lever-restored"),
    voiceover("杠杆平衡比较的不是两边力的大小，而是力矩。力臂越长，达到相同转动效果所需的力就越小。", "default", "lever-summary"),
    wait(0.8),
  )),
};
