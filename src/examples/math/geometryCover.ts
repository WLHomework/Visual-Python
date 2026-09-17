import type { ExampleProject } from "../types";
import { assign, chain, input, number, play, point, ref, sceneWorkspace, text, wait } from "../manim/workspaceHelpers";

const moveTo = (mobject: object, x: number, y: number) => ({
  type: "visual_python_manim_move_to",
  inputs: { MOBJECT: input(mobject), POINT: input(point(x, y)) },
});

const textLabel = (content: string, x: number, y: number, size: number, color = "WHITE") => moveTo({
  type: "visual_python_manim_plain_text_object",
  fields: { COLOR: color },
  inputs: { CONTENT: text(content), FONT_SIZE: number(size) },
}, x, y);

const write = (name: string, seconds = 0.7) => play({
  type: "visual_python_manim_write_animation",
  inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) },
});

export const geometryCoverExample: ExampleProject = {
  id: "math-geometry-cover",
  title: "封面：相交线与平行线",
  projectName: "math-geometry-cover.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("IntersectingAndParallelCover", "Scene", chain(
    assign("kicker", textLabel("初中数学", 0, 2.35, 26, "BLUE")),
    assign("title", textLabel("相交线与平行线", 0, 1.35, 48)),
    assign("item1", textLabel("1  对顶角相等", 0, 0.15, 30)),
    assign("item2", textLabel("2  三线八角", 0, -0.55, 30)),
    assign("item3", textLabel("3  平行线的判定与性质", 0, -1.25, 30)),
    assign("item4", textLabel("4  平移", 0, -1.95, 30)),
    write("kicker", 0.6),
    write("title", 0.9),
    write("item1", 0.45),
    write("item2", 0.45),
    write("item3", 0.45),
    write("item4", 0.45),
    wait(2.2),
  )),
};
