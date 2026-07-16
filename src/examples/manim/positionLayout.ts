import type { ExampleProject } from "../types";
import { assign, chain, direction, input, number, ref, sceneWorkspace, text, wait } from "./workspaceHelpers";

const label = (value: string, color: string) => ({ type: "visual_python_manim_plain_text_object", fields: { COLOR: color }, inputs: { CONTENT: text(value), FONT_SIZE: number(34) } });
export const positionLayoutExample: ExampleProject = {
  id: "manim-position-layout", title: "位置与相邻布局", projectName: "manim-position-layout.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("PositionLayout", "Scene", chain(
    assign("title", { type: "visual_python_manim_to_edge", inputs: { MOBJECT: input(label("Layout", "BLUE")), DIRECTION: direction("UP"), BUFF: number(0.4) } }),
    assign("circle", { type: "visual_python_manim_circle_object", fields: { COLOR: "GREEN" }, inputs: { RADIUS: number(1) } }),
    assign("caption", { type: "visual_python_manim_next_to", inputs: { MOBJECT: input(label("Circle", "YELLOW")), TARGET: ref("circle"), DIRECTION: direction("DOWN"), BUFF: number(0.35) } }),
    assign("corner", { type: "visual_python_manim_to_corner", inputs: { MOBJECT: input(label("UR", "RED")), DIRECTION: direction("UR"), BUFF: number(0.4) } }),
    { type: "visual_python_manim_add_two", inputs: { FIRST: ref("title"), SECOND: ref("circle") } }, { type: "visual_python_manim_add_two", inputs: { FIRST: ref("caption"), SECOND: ref("corner") } }, wait(),
  )),
};
