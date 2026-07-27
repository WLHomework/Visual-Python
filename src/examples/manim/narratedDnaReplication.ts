import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, list, number, play, point, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const ys = [-2, -1, 0, 1, 2];
const leftBases = ["A", "C", "G", "T", "A"];
const rightBases = ["T", "G", "C", "A", "T"];

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 34) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const group = (...objects: object[]) => ({
  type: "visual_python_manim_group_from_list_object",
  inputs: { OBJECTS: list(...objects) },
});

const baseColor = (base: string) => base === "A" ? "GREEN" : base === "T" ? "RED" : base === "C" ? "BLUE" : "YELLOW";

const strand = (x: number, bases: string[], direction: 1 | -1) => group(
  {
    type: "visual_python_manim_line_segment_object",
    fields: { COLOR: "WHITE" },
    inputs: { START: input(point(x, -2.55)), END: input(point(x, 2.55)) },
  },
  ...ys.flatMap((y, index) => {
    const base = bases[index];
    const baseX = x + direction * 0.43;
    const color = baseColor(base);
    return [
      moveTo({
        type: "visual_python_manim_set_fill",
        fields: { COLOR: color },
        inputs: {
          MOBJECT: input({
            type: "visual_python_manim_rectangle_object",
            fields: { COLOR: color },
            inputs: { WIDTH: number(0.72), HEIGHT: number(0.55) },
          }),
          OPACITY: number(0.65),
        },
      }, baseX, y),
      mathLabel(base, baseX, y, "WHITE", 26),
    ];
  }),
);

const bonds = () => group(...ys.map((y) => ({
  type: "visual_python_manim_dashed_line_object",
  fields: { COLOR: "GRAY" },
  inputs: { START: input(point(-0.48, y)), END: input(point(0.48, y)), DASH_LENGTH: number(0.06) },
})));

const transform = (source: string, target: string, seconds = 1) => play({
  type: "visual_python_manim_transform_to_animation",
  inputs: { SOURCE: ref(source), TARGET: ref(target), RUN_TIME: number(seconds) },
});

const write = (name: string, seconds = 0.7) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedDnaReplicationExample: ExampleProject = {
  id: "manim-narrated-dna-replication",
  title: "生物学：DNA 碱基配对与复制",
  projectName: "narrated-dna-replication.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedDnaReplication", "Scene", chain(
    assign("left_strand", strand(-0.9, leftBases, 1)),
    assign("right_strand", strand(0.9, rightBases, -1)),
    assign("hydrogen_bonds", bonds()),
    assign("left_template", strand(-3, leftBases, 1)),
    assign("right_template", strand(3, rightBases, -1)),
    assign("left_complement", strand(-1.8, rightBases, -1)),
    assign("right_complement", strand(1.8, leftBases, 1)),
    assign("pair_rule", mathLabel("A\\leftrightarrow T\\qquad C\\leftrightarrow G", 0, 3.1, "YELLOW", 40)),
    assign("unzip_label", mathLabel("\\text{template strands}", 0, 3.1, "WHITE", 34)),
    assign("daughter_left", mathLabel("\\text{DNA copy 1}", -2.4, 3.05, "GREEN", 32)),
    assign("daughter_right", mathLabel("\\text{DNA copy 2}", 2.4, 3.05, "GREEN", 32)),
    assign("semi_conservative", mathLabel("\\text{one old strand + one new strand}", 0, -3.15, "YELLOW", 32)),
    voiceoverWithAnimation("DNA 由两条链组成。中间的彩色碱基按照固定规则配对，两侧白色线条表示糖磷酸骨架。", chain(play(create("left_strand", 0.9)), play(create("right_strand", 0.9)), play(create("hydrogen_bonds", 0.7))), "default", "dna-structure"),
    voiceoverWithAnimation("腺嘌呤 A 总是与胸腺嘧啶 T 配对，胞嘧啶 C 总是与鸟嘌呤 G 配对。", write("pair_rule", 0.9), "default", "dna-pairing"),
    voiceoverWithAnimation("复制开始时，两条 DNA 链之间的氢键断开，双链像拉链一样分离，每一条旧链都成为模板。", chain(play({ type: "visual_python_manim_fade_out_animation", inputs: { MOBJECT: ref("hydrogen_bonds"), SHIFT: input(point(0, 0)), SCALE: number(0.8), RUN_TIME: number(0.6) } }), transform("left_strand", "left_template", 1.1), transform("right_strand", "right_template", 1.1), transform("pair_rule", "unzip_label", 0.6)), "default", "dna-unzip"),
    voiceoverWithAnimation("游离碱基按照互补配对规则，依次排列到左侧模板链旁边，形成一条新的互补链。", chain(play({ type: "visual_python_manim_fade_out_animation", inputs: { MOBJECT: ref("pair_rule"), SHIFT: input(point(0, 0)), SCALE: number(0.8), RUN_TIME: number(0.4) } }), play(create("left_complement", 1.2)), write("daughter_left", 0.6)), "default", "dna-left-copy"),
    voiceoverWithAnimation("右侧模板链也用同样方式合成新链。最终，一份 DNA 复制成了两份相同的 DNA。", chain(play(create("right_complement", 1.2)), write("daughter_right", 0.6)), "default", "dna-right-copy"),
    voiceoverWithAnimation("每个子代 DNA 都保留一条旧链，并新合成一条互补链，因此这种方式叫作半保留复制。", write("semi_conservative", 0.9), "default", "dna-semi-conservative"),
    voiceover("碱基互补配对保证了遗传信息能够被准确复制。A 对 T，C 对 G，是整个复制过程的核心规则。", "default", "dna-summary"),
    wait(0.8),
  )),
};
