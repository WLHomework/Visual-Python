import type { ExampleProject } from "../types";
import { boolean, compare, input, number, print, setVariable, variable, workspace, chain } from "./builders";

export const comparisonLogicExample: ExampleProject = {
  id: "python-comparison-logic", title: "比较与逻辑", projectName: "comparison-and-logic.vpy",
  workspace: workspace(chain([
    setVariable("age", number(18)),
    setVariable("has_ticket", boolean(true)),
    print({ type: "logic_operation", fields: { OP: "AND" }, inputs: { A: input(compare(variable("age"), "GTE", number(18))), B: input(variable("has_ticket")) } }),
    print({ type: "logic_negate", inputs: { BOOL: input(compare(variable("age"), "LT", number(18))) } }),
  ])),
};
