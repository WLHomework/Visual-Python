import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, list, number, play, point, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const values = [3, 7, 11, 15, 19, 23, 27, 31];
const positions = [-5.25, -3.75, -2.25, -0.75, 0.75, 2.25, 3.75, 5.25];

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const box = (x: number) => moveTo({
  type: "visual_python_manim_set_fill",
  fields: { COLOR: "BLUE" },
  inputs: {
    MOBJECT: input({
      type: "visual_python_manim_rectangle_object",
      fields: { COLOR: "BLUE" },
      inputs: { WIDTH: number(1.2), HEIGHT: number(1.15) },
    }),
    OPACITY: number(0.35),
  },
}, x, 0);

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 36) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const group = (...objects: object[]) => ({
  type: "visual_python_manim_group_from_list_object",
  inputs: { OBJECTS: list(...objects) },
});

const rangeFrame = (width: number, x: number, color: string) => moveTo({
  type: "visual_python_manim_rectangle_object",
  fields: { COLOR: color },
  inputs: { WIDTH: number(width), HEIGHT: number(1.55) },
}, x, 0);

const pointer = (x: number, value: number, color = "YELLOW") => group(
  {
    type: "visual_python_manim_arrow_object",
    fields: { COLOR: color },
    inputs: { START: input(point(x, 2)), END: input(point(x, 0.75)), BUFF: number(0) },
  },
  mathLabel("mid=" + value, x, 2.35, color, 30),
);

const transform = (source: string, target: string, seconds = 0.8) => play({
  type: "visual_python_manim_transform_to_animation",
  inputs: { SOURCE: ref(source), TARGET: ref(target), RUN_TIME: number(seconds) },
});

const write = (name: string, seconds = 0.7) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedBinarySearchExample: ExampleProject = {
  id: "manim-narrated-binary-search",
  title: "算法演示：二分查找",
  projectName: "narrated-binary-search.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedBinarySearch", "Scene", chain(
    assign("array", group(...positions.flatMap((x, index) => [box(x), mathLabel(String(values[index]), x, 0, "WHITE", 34)]))),
    assign("range_all", rangeFrame(11.9, 0, "GREEN")),
    assign("range_right", rangeFrame(5.9, 3, "GREEN")),
    assign("range_last_two", rangeFrame(2.9, 4.5, "GREEN")),
    assign("range_target", rangeFrame(1.35, 5.25, "YELLOW")),
    assign("pointer_15", pointer(-0.75, 15)),
    assign("pointer_23", pointer(2.25, 23)),
    assign("pointer_27", pointer(3.75, 27)),
    assign("pointer_31", pointer(5.25, 31, "GREEN")),
    assign("target_label", mathLabel("\\text{target}=31", 0, 3.15, "YELLOW", 40)),
    assign("greater_15", mathLabel("31>15", -0.75, -1.45, "GREEN", 30)),
    assign("greater_23", mathLabel("31>23", 2.25, -1.45, "GREEN", 30)),
    assign("greater_27", mathLabel("31>27", 3.75, -1.45, "GREEN", 30)),
    assign("found", mathLabel("\\text{found }31", 4.8, -2.35, "GREEN", 38)),
    voiceoverWithAnimation("二分查找要求数据已经排好顺序。我们的目标是在这个升序数组中找到三十一。", chain(play(create("array", 1.2)), play(create("range_all", 0.5)), write("target_label", 0.7)), "default", "binary-search-start"),
    voiceoverWithAnimation("先检查整个区间的中间值十五。三十一大于十五，所以目标只可能在右半部分，左半部分可以全部排除。", chain(play(create("pointer_15", 0.6)), write("greater_15", 0.4), transform("range_all", "range_right", 0.9)), "default", "binary-search-fifteen"),
    voiceoverWithAnimation("在剩余四个数中检查中间值二十三。目标仍然更大，搜索范围再次缩小到右边两个数。", chain(transform("pointer_15", "pointer_23", 0.7), write("greater_23", 0.4), transform("range_all", "range_last_two", 0.9)), "default", "binary-search-twenty-three"),
    voiceoverWithAnimation("接着检查二十七。三十一依然更大，于是范围中只剩下最后一个位置。", chain(transform("pointer_15", "pointer_27", 0.7), write("greater_27", 0.4), transform("range_all", "range_target", 0.9)), "default", "binary-search-twenty-seven"),
    voiceoverWithAnimation("最后检查三十一，正好等于目标，查找成功。原本八个候选项经过三次比较就缩小到了一个。", chain(transform("pointer_15", "pointer_31", 0.7), write("found", 0.8)), "default", "binary-search-found"),
    voiceover("二分查找每比较一次，就排除大约一半数据。因此即使数据量很大，所需比较次数也增长得很慢。", "default", "binary-search-summary"),
    wait(0.8),
  )),
};
