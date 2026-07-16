import type { ExampleProject } from "../types";
import { input, number, print, text, workspace } from "./builders";

export const repeatLoopExample: ExampleProject = {
  id: "python-repeat", title: "重复循环", projectName: "repeat-loop.vpy",
  workspace: workspace({ type: "controls_repeat_ext", inputs: { TIMES: input(number(5)), DO: input(print(text("Python"))) } }),
};
