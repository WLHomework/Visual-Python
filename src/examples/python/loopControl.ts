import type { ExampleProject } from "../types";
import { chain, compare, input, number, print, variable, workspace } from "./builders";

const conditionalFlow = (value: number, flow: "CONTINUE" | "BREAK") => ({
  type: "controls_if",
  inputs: { IF0: input(compare(variable("number"), "EQ", number(value))), DO0: input({ type: "controls_flow_statements", fields: { FLOW: flow } }) },
});

export const loopControlExample: ExampleProject = {
  id: "python-loop-control", title: "循环控制", projectName: "loop-control.vpy",
  workspace: workspace({
    type: "python_for_in", fields: { VAR: { name: "number" } },
    inputs: {
      ITERABLE: input({ type: "python_range", inputs: { START: input(number(1)), STOP: input(number(11)), STEP: input(number(1)) } }),
      DO: input(chain([conditionalFlow(3, "CONTINUE"), conditionalFlow(8, "BREAK"), print(variable("number"))])),
    },
  }),
};
