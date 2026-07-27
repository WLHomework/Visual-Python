import type { ExampleProject } from "../types";
import { assign, chain, create, formula, input, list, number, play, point, ref, sceneWorkspace, voiceover, voiceoverWithAnimation, wait } from "./workspaceHelpers";

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const mathLabel = (content: string, x: number, y: number, color = "WHITE", size = 38) => moveTo({
  type: "visual_python_manim_mathtex_object",
  fields: { COLOR: color },
  inputs: { CONTENT: formula(content), FONT_SIZE: number(size) },
}, x, y);

const stackItem = (label: string, y: number, color: string, x = -1) => ({
  type: "visual_python_manim_group_from_list_object",
  inputs: {
    OBJECTS: list(
      moveTo({
        type: "visual_python_manim_set_fill",
        fields: { COLOR: color },
        inputs: {
          MOBJECT: input({
            type: "visual_python_manim_rectangle_object",
            fields: { COLOR: color },
            inputs: { WIDTH: number(3), HEIGHT: number(0.95) },
          }),
          OPACITY: number(0.45),
        },
      }, x, y),
      mathLabel(label, x, y, "WHITE", 40),
    ),
  },
});

const stackFrame = () => ({
  type: "visual_python_manim_group_from_list_object",
  inputs: {
    OBJECTS: list(
      {
        type: "visual_python_manim_line_segment_object",
        fields: { COLOR: "WHITE" },
        inputs: { START: input(point(-2.75, -2.7)), END: input(point(-2.75, 2.6)) },
      },
      {
        type: "visual_python_manim_line_segment_object",
        fields: { COLOR: "WHITE" },
        inputs: { START: input(point(0.75, -2.7)), END: input(point(0.75, 2.6)) },
      },
      {
        type: "visual_python_manim_line_segment_object",
        fields: { COLOR: "WHITE" },
        inputs: { START: input(point(-2.75, -2.7)), END: input(point(0.75, -2.7)) },
      },
    ),
  },
});

const topPointer = (y: number, label: string, color = "YELLOW") => ({
  type: "visual_python_manim_group_from_list_object",
  inputs: {
    OBJECTS: list(
      {
        type: "visual_python_manim_arrow_object",
        fields: { COLOR: color },
        inputs: { START: input(point(2.1, y)), END: input(point(0.65, y)), BUFF: number(0) },
      },
      mathLabel(label, 2.65, y, color, 30),
    ),
  },
});

const transform = (source: string, target: string, seconds = 0.8) => play({
  type: "visual_python_manim_transform_to_animation",
  inputs: { SOURCE: ref(source), TARGET: ref(target), RUN_TIME: number(seconds) },
});

const write = (name: string, seconds = 0.7) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const narratedStackOperationsExample: ExampleProject = {
  id: "manim-narrated-stack-operations",
  title: "数据结构：栈的入栈与出栈",
  projectName: "narrated-stack-operations.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("NarratedStackOperations", "Scene", chain(
    assign("frame", stackFrame()),
    assign("item_a", stackItem("A", -2.1, "BLUE")),
    assign("item_b", stackItem("B", -1.05, "GREEN")),
    assign("item_c", stackItem("C", 0, "RED")),
    assign("popped_c", stackItem("C", 0, "RED", 4)),
    assign("top_a", topPointer(-2.1, "top=A")),
    assign("top_b", topPointer(-1.05, "top=B")),
    assign("top_c", topPointer(0, "top=C")),
    assign("top_after_pop", topPointer(-1.05, "top=B", "GREEN")),
    assign("push_label", mathLabel("\\operatorname{push}(A),\\ push(B),\\ push(C)", 3.35, 2.45, "WHITE", 34)),
    assign("pop_label", mathLabel("\\operatorname{pop}()\\Rightarrow C", 3.35, 1.25, "YELLOW", 38)),
    assign("rule", mathLabel("\\text{LIFO: Last In, First Out}", 3.35, -2.25, "GREEN", 34)),
    voiceoverWithAnimation("栈可以想象成一个只有顶部开口的容器。元素只能从顶部放入，也只能从顶部取出。", chain(play(create("frame", 1)), write("push_label", 0.8)), "default", "stack-frame"),
    voiceoverWithAnimation("第一次执行入栈操作，把元素 A 放入栈底。此时 A 既是栈底，也是栈顶。", chain(play(create("item_a", 0.7)), play(create("top_a", 0.5))), "default", "stack-push-a"),
    voiceoverWithAnimation("继续压入 B，再压入 C。后加入的元素总是位于先加入元素的上方。", chain(play(create("item_b", 0.7)), transform("top_a", "top_b", 0.5), play(create("item_c", 0.7)), transform("top_a", "top_c", 0.5)), "default", "stack-push-bc"),
    voiceoverWithAnimation("现在执行一次出栈操作。最上面的 C 被首先取出，而不是最早进入的 A。", chain(write("pop_label", 0.7), transform("item_c", "popped_c", 1.1), transform("top_a", "top_after_pop", 0.6)), "default", "stack-pop-c"),
    voiceoverWithAnimation("C 离开以后，B 成为新的栈顶。下一次出栈会取出 B，然后才轮到 A。", write("rule", 0.9), "default", "stack-new-top"),
    voiceover("这种顺序叫作后进先出，英文缩写是 LIFO。函数调用、撤销操作和表达式计算都会使用栈。", "default", "stack-summary"),
    wait(0.8),
  )),
};
