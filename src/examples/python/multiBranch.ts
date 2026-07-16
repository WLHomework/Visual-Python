import type { ExampleProject } from "../types";
import { compare, input, number, print, setVariable, text, variable, workspace } from "./builders";

export const multiBranchExample: ExampleProject = {
  id: "python-multi-branch", title: "多分支判断", projectName: "multi-branch.vpy",
  workspace: workspace({ ...setVariable("score", number(85)), next: { block: {
    type: "controls_if", extraState: { elseIfCount: 1, hasElse: true },
    inputs: {
      IF0: input(compare(variable("score"), "GTE", number(90))), DO0: input(print(text("优秀"))),
      IF1: input(compare(variable("score"), "GTE", number(60))), DO1: input(print(text("及格"))),
      ELSE: input(print(text("不及格"))),
    },
  } } }),
};
