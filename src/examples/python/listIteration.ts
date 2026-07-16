import type { ExampleProject } from "../types";
import { input, list, print, setVariable, text, variable, workspace } from "./builders";

export const listIterationExample: ExampleProject = {
  id: "python-list-iteration", title: "遍历列表", projectName: "list-iteration.vpy",
  workspace: workspace({ ...setVariable("fruits", list(text("苹果"), text("香蕉"), text("橙子"))), next: { block: {
    type: "python_for_in", fields: { VAR: { name: "fruit" } }, inputs: { ITERABLE: input(variable("fruits")), DO: input(print(variable("fruit"))) },
  } } }),
};
