import type { ExampleProject } from "../types";
import { assign, chain, direction, number, play, ref, sceneWorkspace, text, wait } from "./workspaceHelpers";

export const dynamicCounterExample: ExampleProject = {
  id: "manim-dynamic-counter", title: "动态数字计数", projectName: "manim-dynamic-counter.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("DynamicCounter", "Scene", chain(
    assign("tracker", { type: "visual_python_manim_value_tracker", inputs: { VALUE: number(0) } }),
    assign("counter", { type: "visual_python_manim_decimal_follow_tracker", inputs: { TRACKER: ref("tracker"), PLACES: number(0) } }),
    assign("caption", { type: "visual_python_manim_next_to", inputs: { MOBJECT: { block: { type: "visual_python_manim_plain_text_object", fields: { COLOR: "BLUE" }, inputs: { CONTENT: text("Count"), FONT_SIZE: number(34) } } }, TARGET: ref("counter"), DIRECTION: direction("UP"), BUFF: number(0.35) } }),
    { type: "visual_python_manim_add_two", inputs: { FIRST: ref("counter"), SECOND: ref("caption") } },
    play({ type: "visual_python_manim_tracker_set_value_animation", inputs: { TRACKER: ref("tracker"), VALUE: number(100) } }), wait(),
  )),
};
