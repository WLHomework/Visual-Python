import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, number, play, point, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const centerX = -1;
const starX = -3.87;

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const filledCircle = (radius: number, x: number, y: number, color: string) => moveTo({
  type: "visual_python_manim_set_fill",
  fields: { COLOR: color },
  inputs: {
    MOBJECT: input({
      type: "visual_python_manim_circle_object",
      fields: { COLOR: color },
      inputs: { RADIUS: number(radius) },
    }),
    OPACITY: number(0.9),
  },
}, x, y);

const planet = (x: number, y: number) => filledCircle(0.2, x, y, "BLUE");

const line = (x1: number, y1: number, x2: number, y2: number, color: string) => ({
  type: "visual_python_manim_dashed_line_object",
  fields: { COLOR: color },
  inputs: { START: input(point(x1, y1)), END: input(point(x2, y2)), DASH_LENGTH: number(0.08) },
});

const velocity = (x1: number, y1: number, x2: number, y2: number, color: string) => ({
  type: "visual_python_manim_arrow_object",
  fields: { COLOR: color },
  inputs: { START: input(point(x1, y1)), END: input(point(x2, y2)), BUFF: number(0) },
});

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 36) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const transform = (source: string, target: string, seconds = 1.1) => play({
  type: "visual_python_manim_transform_to_animation",
  inputs: { SOURCE: ref(source), TARGET: ref(target), RUN_TIME: number(seconds) },
});

const write = (name: string, seconds = 0.7) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedPlanetaryOrbitExample: ExampleProject = {
  id: "manim-narrated-planetary-orbit",
  title: "天文学：行星绕恒星运动",
  projectName: "narrated-planetary-orbit.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedPlanetaryOrbit", "Scene", chain(
    assign("orbit", moveTo({
      type: "visual_python_manim_ellipse_object",
      fields: { COLOR: "WHITE" },
      inputs: { WIDTH: number(7), HEIGHT: number(4) },
    }, centerX, 0)),
    assign("star", filledCircle(0.38, starX, 0, "YELLOW")),
    assign("center_marker", {
      type: "visual_python_manim_dot_object",
      fields: { COLOR: "GRAY" },
      inputs: { POINT: input(point(centerX, 0)), RADIUS: number(0.07) },
    }),
    assign("planet_peri", planet(-4.5, 0)),
    assign("planet_top", planet(centerX, 2)),
    assign("planet_ap", planet(2.5, 0)),
    assign("planet_bottom", planet(centerX, -2)),
    assign("planet_return", planet(-4.5, 0)),
    assign("distance_peri", line(starX, 0, -4.5, 0, "GREEN")),
    assign("distance_top", line(starX, 0, centerX, 2, "GREEN")),
    assign("distance_ap", line(starX, 0, 2.5, 0, "GREEN")),
    assign("distance_bottom", line(starX, 0, centerX, -2, "GREEN")),
    assign("distance_return", line(starX, 0, -4.5, 0, "GREEN")),
    assign("speed_peri", velocity(-4.5, 0, -4.5, -1.65, "RED")),
    assign("speed_top", velocity(centerX, 2, 0.35, 2, "RED")),
    assign("speed_ap", velocity(2.5, 0, 2.5, 0.65, "BLUE")),
    assign("speed_bottom", velocity(centerX, -2, -2.35, -2, "RED")),
    assign("speed_return", velocity(-4.5, 0, -4.5, -1.65, "RED")),
    assign("focus_label", mathLabel("\\text{star at focus}", -3.87, 0.85, "YELLOW", 30)),
    assign("peri_label", mathLabel("\\text{perihelion}", -4.5, 2.7, "GREEN", 32)),
    assign("ap_label", mathLabel("\\text{aphelion}", 2.5, 2.7, "BLUE", 32)),
    assign("speed_rule", mathLabel("v_{\\rm peri}>v_{\\rm ap}", 4.75, 1.2, "YELLOW", 38)),
    assign("kepler_rule", mathLabel("\\frac{dA}{dt}=\\text{constant}", 4.75, -0.25, "GREEN", 36)),
    assign("orbit_rule", mathLabel("\\text{ellipse, not circle}", 4.75, -1.65, "WHITE", 30)),
    voiceoverWithAnimation("行星轨道通常是椭圆，而不是正圆。恒星位于椭圆的一个焦点，并不位于几何中心。", chain(play(create("orbit", 1)), play(create("center_marker", 0.3)), play(create("star", 0.6)), write("focus_label", 0.6), write("orbit_rule", 0.7)), "default", "orbit-shape"),
    voiceoverWithAnimation("行星运行到近日点时，距离恒星最近。绿色虚线表示当前距离，红色箭头表示运动速度。", chain(play(create("planet_peri", 0.4)), play(create("distance_peri", 0.5)), play(create("speed_peri", 0.6)), write("peri_label", 0.5)), "default", "orbit-perihelion"),
    voiceoverWithAnimation("行星继续沿椭圆轨道运动，距离逐渐增加，速度也会逐渐减小。", chain(transform("planet_peri", "planet_top", 1.2), transform("distance_peri", "distance_top", 1), transform("speed_peri", "speed_top", 0.8)), "default", "orbit-to-top"),
    voiceoverWithAnimation("到达远日点时，行星距离恒星最远，速度箭头也最短。因此近日点速度大于远日点速度。", chain(transform("planet_peri", "planet_ap", 1.2), transform("distance_peri", "distance_ap", 1), transform("speed_peri", "speed_ap", 0.8), write("ap_label", 0.5), write("speed_rule", 0.8)), "default", "orbit-aphelion"),
    voiceoverWithAnimation("从远日点继续运行，行星重新靠近恒星，速度再次增加，最终完成一周运动。", chain(transform("planet_peri", "planet_bottom", 1.2), transform("distance_peri", "distance_bottom", 1), transform("speed_peri", "speed_bottom", 0.8), transform("planet_peri", "planet_return", 1.2), transform("distance_peri", "distance_return", 1), transform("speed_peri", "speed_return", 0.8)), "default", "orbit-return"),
    voiceoverWithAnimation("开普勒第二定律说明，行星与恒星的连线在相同时间内扫过相同面积。靠近恒星时，只能通过提高速度来满足这个规律。", write("kepler_rule", 0.9), "default", "orbit-kepler"),
    voiceover("椭圆轨道、焦点位置和速度变化共同说明：行星不是匀速绕圆运动，而是在引力作用下不断改变速度。", "default", "orbit-summary"),
    wait(0.8),
  )),
};
