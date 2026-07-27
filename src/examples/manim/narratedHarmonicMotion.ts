import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, point, range, raw, ref, scaledDirection, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const centerX = -4;
const projectionX = -1.85;

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const radiusLine = (x: number, y: number) => ({
  type: "visual_python_manim_line_segment_object",
  fields: { COLOR: "YELLOW" },
  inputs: { START: input(point(centerX, 0)), END: input(point(x, y)) },
});

const projectionLine = (x: number, y: number) => ({
  type: "visual_python_manim_dashed_line_object",
  fields: { COLOR: "GREEN" },
  inputs: { START: input(point(x, y)), END: input(point(projectionX, y)), DASH_LENGTH: number(0.08) },
});

const movingDot = (x: number, y: number, color: string) => ({
  type: "visual_python_manim_dot_object",
  fields: { COLOR: color },
  inputs: { POINT: input(point(x, y)), RADIUS: number(0.11) },
});

const shiftedAxes = () => ({
  type: "visual_python_manim_shift",
  inputs: {
    MOBJECT: input({
      type: "visual_python_manim_axes_object",
      inputs: { X_RANGE: range(0, 6, 1), Y_RANGE: range(-2, 2, 1), X_LENGTH: number(6), Y_LENGTH: number(3.4) },
    }),
    VECTOR: scaledDirection("RIGHT", 3.1),
  },
});

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 38) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const transform = (source: string, target: string, seconds = 0.8) => play({
  type: "visual_python_manim_transform_to_animation",
  inputs: { SOURCE: ref(source), TARGET: ref(target), RUN_TIME: number(seconds) },
});

const write = (name: string, seconds = 0.8) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedHarmonicMotionExample: ExampleProject = {
  id: "manim-narrated-harmonic-motion",
  title: "物理演示：简谐振动与正弦波",
  projectName: "narrated-harmonic-motion.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedHarmonicMotion", "Scene", chain(
    assign("circle", moveTo({
      type: "visual_python_manim_circle_object",
      fields: { COLOR: "BLUE" },
      inputs: { RADIUS: number(1.5) },
    }, centerX, 0)),
    assign("axis_line", {
      type: "visual_python_manim_line_segment_object",
      fields: { COLOR: "WHITE" },
      inputs: { START: input(point(projectionX, -1.8)), END: input(point(projectionX, 1.8)) },
    }),
    assign("radius_0", radiusLine(-2.5, 0)),
    assign("radius_60", radiusLine(-3.25, 1.299)),
    assign("radius_120", radiusLine(-4.75, 1.299)),
    assign("radius_180", radiusLine(-5.5, 0)),
    assign("radius_270", radiusLine(-4, -1.5)),
    assign("circle_dot_0", movingDot(-2.5, 0, "RED")),
    assign("circle_dot_60", movingDot(-3.25, 1.299, "RED")),
    assign("circle_dot_120", movingDot(-4.75, 1.299, "RED")),
    assign("circle_dot_180", movingDot(-5.5, 0, "RED")),
    assign("circle_dot_270", movingDot(-4, -1.5, "RED")),
    assign("projection_0", projectionLine(-2.5, 0)),
    assign("projection_60", projectionLine(-3.25, 1.299)),
    assign("projection_120", projectionLine(-4.75, 1.299)),
    assign("projection_180", projectionLine(-5.5, 0)),
    assign("projection_270", projectionLine(-4, -1.5)),
    assign("oscillator_0", movingDot(projectionX, 0, "GREEN")),
    assign("oscillator_60", movingDot(projectionX, 1.299, "GREEN")),
    assign("oscillator_120", movingDot(projectionX, 1.299, "GREEN")),
    assign("oscillator_180", movingDot(projectionX, 0, "GREEN")),
    assign("oscillator_270", movingDot(projectionX, -1.5, "GREEN")),
    assign("wave_axes", shiftedAxes()),
    assign("wave", {
      type: "visual_python_manim_axes_plot",
      fields: { COLOR: "YELLOW" },
      inputs: { AXES: ref("wave_axes"), FUNCTION: raw("lambda x: 1.5 * np.sin(x)"), X_RANGE: range(0, 6) },
    }),
    assign("formula", mathLabel("y=A\\sin(\\omega t+\\varphi)", 3.45, 2.65, "YELLOW", 40)),
    assign("amplitude", mathLabel("A=1.5", -4, 2.15, "GREEN", 32)),
    voiceoverWithAnimation("红点沿蓝色圆周做匀速圆周运动。黄色半径长度保持不变，我们把它记作振幅 A。", chain(play(create("circle", 0.8)), play(create("radius_0", 0.6)), play(create("circle_dot_0", 0.3)), write("amplitude", 0.5)), "default", "harmonic-circle"),
    voiceoverWithAnimation("把红点的竖直高度投影到右侧直线上，得到绿色点。红点转动时，绿色点只会上下运动。", chain(play(create("axis_line", 0.5)), play(create("projection_0", 0.5)), play(create("oscillator_0", 0.3))), "default", "harmonic-projection"),
    voiceoverWithAnimation("转到六十度和一百二十度时，红点位置不同，但竖直高度相同，因此投影点处在同一高度。", chain(transform("radius_0", "radius_60"), transform("circle_dot_0", "circle_dot_60", 0.4), transform("projection_0", "projection_60", 0.4), transform("oscillator_0", "oscillator_60", 0.4), transform("radius_0", "radius_120"), transform("circle_dot_0", "circle_dot_120", 0.4), transform("projection_0", "projection_120", 0.4), transform("oscillator_0", "oscillator_120", 0.4)), "default", "harmonic-upper"),
    voiceoverWithAnimation("转到一百八十度时，投影回到中点；转到二百七十度时，投影到达最低位置。", chain(transform("radius_0", "radius_180"), transform("circle_dot_0", "circle_dot_180", 0.4), transform("projection_0", "projection_180", 0.4), transform("oscillator_0", "oscillator_180", 0.4), transform("radius_0", "radius_270"), transform("circle_dot_0", "circle_dot_270", 0.4), transform("projection_0", "projection_270", 0.4), transform("oscillator_0", "oscillator_270", 0.4)), "default", "harmonic-lower"),
    voiceoverWithAnimation("把投影高度随时间记录下来，就得到右侧的正弦曲线。圆周运动的竖直投影，正是简谐振动。", chain(play(create("wave_axes", 0.7)), play(create("wave", 1.2)), write("formula", 0.9)), "default", "harmonic-wave"),
    voiceover("振幅 A 决定上下运动的范围，角频率欧米伽决定振动快慢，初相位决定运动从哪里开始。", "default", "harmonic-summary"),
    wait(0.8),
  )),
};
