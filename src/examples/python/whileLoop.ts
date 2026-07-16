import type { ExampleProject } from "../types";
import { arithmetic, chain, compare, input, number, print, setVariable, variable, workspace } from "./builders";

export const whileLoopExample: ExampleProject = {
  id: "python-while", title: "while 循环", projectName: "while-loop.vpy",
  workspace: workspace(chain([
    setVariable("count", number(3)),
    { type: "controls_whileUntil", fields: { MODE: "WHILE" }, inputs: {
      BOOL: input(compare(variable("count"), "GT", number(0))),
      DO: input(chain([print(variable("count")), setVariable("count", arithmetic(variable("count"), "MINUS", number(1)))])),
    } },
    print(number(0)),
  ])),
};
