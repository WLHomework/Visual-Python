import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, list, number, play, point, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const centerX = -2;

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 36) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const electron = (radius: number, angle: number, color = "BLUE") => {
  const radians = angle * Math.PI / 180;
  return {
    type: "visual_python_manim_dot_object",
    fields: { COLOR: color },
    inputs: {
      POINT: input(point(centerX + radius * Math.cos(radians), radius * Math.sin(radians))),
      RADIUS: number(0.09),
    },
  };
};

const group = (...objects: object[]) => ({
  type: "visual_python_manim_group_from_list_object",
  inputs: { OBJECTS: list(...objects) },
});

const transform = (source: string, target: string, seconds = 1) => play({
  type: "visual_python_manim_transform_to_animation",
  inputs: { SOURCE: ref(source), TARGET: ref(target), RUN_TIME: number(seconds) },
});

const write = (name: string, seconds = 0.7) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedElectronShellsExample: ExampleProject = {
  id: "manim-narrated-electron-shells",
  title: "化学：原子电子层模型",
  projectName: "narrated-electron-shells.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedElectronShells", "Scene", chain(
    assign("nucleus", moveTo({
      type: "visual_python_manim_set_fill",
      fields: { COLOR: "RED" },
      inputs: {
        MOBJECT: input({
          type: "visual_python_manim_circle_object",
          fields: { COLOR: "RED" },
          inputs: { RADIUS: number(0.34) },
        }),
        OPACITY: number(0.85),
      },
    }, centerX, 0)),
    assign("nucleus_label", mathLabel("11p", centerX, 0, "WHITE", 24)),
    assign("shell_1", moveTo({ type: "visual_python_manim_circle_object", fields: { COLOR: "GRAY" }, inputs: { RADIUS: number(0.65) } }, centerX, 0)),
    assign("shell_2", moveTo({ type: "visual_python_manim_circle_object", fields: { COLOR: "GRAY" }, inputs: { RADIUS: number(1.25) } }, centerX, 0)),
    assign("shell_3", moveTo({ type: "visual_python_manim_circle_object", fields: { COLOR: "YELLOW" }, inputs: { RADIUS: number(2) } }, centerX, 0)),
    assign("inner_electrons", group(electron(0.65, 0), electron(0.65, 180))),
    assign("second_electrons", group(...Array.from({ length: 8 }, (_, index) => electron(1.25, index * 45)))),
    assign("valence_electron", electron(2, 0, "YELLOW")),
    assign("free_electron", {
      type: "visual_python_manim_dot_object",
      fields: { COLOR: "YELLOW" },
      inputs: { POINT: input(point(4.5, 0)), RADIUS: number(0.12) },
    }),
    assign("atom_label", mathLabel("\\mathrm{Na}", centerX, 2.75, "WHITE", 46)),
    assign("ion_label", mathLabel("\\mathrm{Na}^{+}", centerX, 2.75, "GREEN", 46)),
    assign("configuration", mathLabel("2,8,1", 3.4, 2.45, "YELLOW", 42)),
    assign("shell_note", mathLabel("\\text{electron shells}", 3.4, 1.25, "WHITE", 32)),
    assign("valence_note", mathLabel("\\text{valence electron}", 3.4, 0.15, "YELLOW", 32)),
    assign("reaction", mathLabel("\\mathrm{Na}\\rightarrow\\mathrm{Na}^{+}+e^{-}", 3.4, -1.25, "GREEN", 40)),
    assign("stable", mathLabel("2,8", 3.4, -2.35, "GREEN", 42)),
    voiceoverWithAnimation("这是钠原子的简化电子层模型。中心原子核含有十一个质子，核外共有十一个电子。", chain(play(create("nucleus", 0.5)), write("nucleus_label", 0.4), write("atom_label", 0.6)), "default", "electron-nucleus"),
    voiceoverWithAnimation("电子按照不同能级分布在电子层上。第一层有两个电子，第二层有八个电子。", chain(play(create("shell_1", 0.5)), play(create("inner_electrons", 0.7)), play(create("shell_2", 0.5)), play(create("second_electrons", 1)), write("shell_note", 0.6)), "default", "electron-inner-shells"),
    voiceoverWithAnimation("第三层只有一个电子，所以钠的电子排布可以写成二、八、一。最外层电子叫作价电子。", chain(play(create("shell_3", 0.5)), play(create("valence_electron", 0.5)), write("configuration", 0.6), write("valence_note", 0.6)), "default", "electron-valence"),
    voiceoverWithAnimation("这个价电子离原子核较远，受到的吸引相对较弱。钠在反应中容易失去它。", transform("valence_electron", "free_electron", 1.4), "default", "electron-leave"),
    voiceoverWithAnimation("失去一个带负电的电子后，质子数比电子数多一，钠原子就变成带一个正电荷的钠离子。", chain(play({ type: "visual_python_manim_fade_out_animation", inputs: { MOBJECT: ref("shell_3"), SHIFT: input(point(0, 0)), SCALE: number(0.8), RUN_TIME: number(0.7) } }), transform("atom_label", "ion_label", 0.8), write("reaction", 0.9)), "default", "electron-ion"),
    voiceoverWithAnimation("此时钠离子的最外层拥有八个电子，排布变成二、八，结构比原来更加稳定。", write("stable", 0.7), "default", "electron-stable"),
    voiceover("离子的形成并不是质子发生变化，而是原子得到或失去电子。失去电子形成阳离子，得到电子形成阴离子。", "default", "electron-summary"),
    wait(0.8),
  )),
};
