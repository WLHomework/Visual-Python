import type { ExampleProject } from "../types";
import { assign, chain, create, degrees, formula, input, list, number, play, point, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const earthX = -1;

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const filledCircle = (radius: number, x: number, y: number, color: string) => moveTo({
  type: "visual_python_manim_set_fill",
  fields: { COLOR: color },
  inputs: {
    MOBJECT: input({ type: "visual_python_manim_circle_object", fields: { COLOR: color }, inputs: { RADIUS: number(radius) } }),
    OPACITY: number(0.9),
  },
}, x, y);

const hemisphere = (rotation: number, color: string, opacity: number) => moveTo({
  type: "visual_python_manim_set_fill",
  fields: { COLOR: color },
  inputs: {
    MOBJECT: input({
      type: "visual_python_manim_rotate",
      inputs: {
        MOBJECT: input({
          type: "visual_python_manim_sector_object",
          fields: { COLOR: color },
          inputs: { OUTER_RADIUS: number(2), ANGLE: degrees(180) },
        }),
        ANGLE: degrees(rotation),
      },
    }),
    OPACITY: number(opacity),
  },
}, earthX, 0);

const group = (...objects: object[]) => ({
  type: "visual_python_manim_group_from_list_object",
  inputs: { OBJECTS: list(...objects) },
});

const location = (x: number, y: number) => ({
  type: "visual_python_manim_dot_object",
  fields: { COLOR: "RED" },
  inputs: { POINT: input(point(x, y)), RADIUS: number(0.13) },
});

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 36) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const transform = (source: string, target: string, seconds = 1) => play({
  type: "visual_python_manim_transform_to_animation",
  inputs: { SOURCE: ref(source), TARGET: ref(target), RUN_TIME: number(seconds) },
});

const write = (name: string, seconds = 0.7) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedDayNightCycleExample: ExampleProject = {
  id: "manim-narrated-day-night-cycle",
  title: "地理：昼夜交替与地球自转",
  projectName: "narrated-day-night-cycle.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedDayNightCycle", "Scene", chain(
    assign("earth_outline", moveTo({ type: "visual_python_manim_circle_object", fields: { COLOR: "BLUE" }, inputs: { RADIUS: number(2) } }, earthX, 0)),
    assign("day_side", hemisphere(-90, "YELLOW", 0.35)),
    assign("night_side", hemisphere(90, "PURPLE", 0.55)),
    assign("terminator", {
      type: "visual_python_manim_line_segment_object",
      fields: { COLOR: "WHITE" },
      inputs: { START: input(point(earthX, -2)), END: input(point(earthX, 2)) },
    }),
    assign("sun", filledCircle(0.65, 4.8, 0, "YELLOW")),
    assign("sun_rays", group(
      ...[-1.3, -0.65, 0, 0.65, 1.3].map((y) => ({
        type: "visual_python_manim_arrow_object",
        fields: { COLOR: "YELLOW" },
        inputs: { START: input(point(4, y)), END: input(point(1.1, y)), BUFF: number(0) },
      })),
    )),
    assign("rotation_arrow", {
      type: "visual_python_manim_curved_arrow_object",
      fields: { COLOR: "GREEN" },
      inputs: { START: input(point(-2.8, 2.15)), END: input(point(0.8, 2.15)), ANGLE: degrees(-100) },
    }),
    assign("point_noon", location(1, 0)),
    assign("point_sunset", location(earthX, 2)),
    assign("point_midnight", location(-3, 0)),
    assign("point_sunrise", location(earthX, -2)),
    assign("point_return", location(1, 0)),
    assign("noon_label", mathLabel("\\text{noon}", 3, -2.45, "YELLOW", 36)),
    assign("sunset_label", mathLabel("\\text{sunset}", 3, -2.45, "RED", 36)),
    assign("midnight_label", mathLabel("\\text{midnight}", 3, -2.45, "PURPLE", 36)),
    assign("sunrise_label", mathLabel("\\text{sunrise}", 3, -2.45, "GREEN", 36)),
    assign("noon_return_label", mathLabel("\\text{noon}", 3, -2.45, "YELLOW", 36)),
    assign("cycle_label", mathLabel("24\\text{ h}\\rightarrow360^\\circ", -1, 3.15, "WHITE", 38)),
    assign("day_label", mathLabel("\\text{day}", 0.05, 0, "YELLOW", 30)),
    assign("night_label", mathLabel("\\text{night}", -2.05, 0, "WHITE", 30)),
    voiceoverWithAnimation("太阳光从右侧照向地球。面向太阳的一半被照亮形成白昼，背向太阳的一半处于黑夜。", chain(play(create("sun", 0.6)), play(create("sun_rays", 0.8)), play(create("day_side", 0.6)), play(create("night_side", 0.6)), play(create("earth_outline", 0.6)), write("day_label", 0.4), write("night_label", 0.4)), "default", "day-night-light"),
    voiceoverWithAnimation("昼半球和夜半球之间的分界线叫作晨昏线。地球自西向东自转，使地表地点不断穿过这条线。", chain(play(create("terminator", 0.5)), play(create("rotation_arrow", 0.7)), write("cycle_label", 0.7)), "default", "day-night-terminator"),
    voiceoverWithAnimation("红点位于正对太阳的一侧时，当地接近正午，太阳高度较高。", chain(play(create("point_noon", 0.4)), write("noon_label", 0.6)), "default", "day-night-noon"),
    voiceoverWithAnimation("随着地球自转，红点到达上方晨昏线并进入夜半球，当地经历日落。", chain(transform("point_noon", "point_sunset", 1), transform("noon_label", "sunset_label", 0.6)), "default", "day-night-sunset"),
    voiceoverWithAnimation("继续转到背向太阳的一侧，当地进入午夜，接收到的太阳光最少。", chain(transform("point_noon", "point_midnight", 1), transform("noon_label", "midnight_label", 0.6)), "default", "day-night-midnight"),
    voiceoverWithAnimation("红点再转到下方晨昏线并重新进入昼半球，当地迎来日出，随后回到正午。", chain(transform("point_noon", "point_sunrise", 1), transform("noon_label", "sunrise_label", 0.6), transform("point_noon", "point_return", 1), transform("noon_label", "noon_return_label", 0.6)), "default", "day-night-sunrise"),
    voiceover("地球大约二十四小时自转一周。昼夜交替来自地球自转，而不是太阳每天真的绕着地球转动。", "default", "day-night-summary"),
    wait(0.8),
  )),
};
