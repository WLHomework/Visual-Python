import type { ExampleProject } from "../types";
import { chain, compare, input, number, print, setVariable, text, variable, workspace } from "./builders";

export const conditionExample: ExampleProject = {
  id: "python-condition", title: "条件判断", projectName: "condition.vpy",
  workspace: workspace(chain([
    { type: "python_input_assign", fields: { VAR: { name: "score" } }, inputs: { PROMPT: input(text("请输入成绩：")) } },
    setVariable("score", { type: "python_convert", fields: { TYPE: "int" }, inputs: { VALUE: input(variable("score")) } }),
    {
      type: "controls_if", extraState: { hasElse: true },
      inputs: { IF0: input(compare(variable("score"), "GTE", number(60))), DO0: input(print(text("及格"))), ELSE: input(print(text("需要继续努力"))) },
    },
  ])),
};
