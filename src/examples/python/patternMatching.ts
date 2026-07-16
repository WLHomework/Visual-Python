import type { ExampleProject } from "../types";
import { chain, input, print, setVariable, text, variable, workspace } from "./builders";

export const patternMatchingExample: ExampleProject = {
  id: "python-pattern-matching", title: "模式匹配", projectName: "pattern-matching.vpy",
  workspace: workspace(chain([
    setVariable("status", text("ready")),
    {
      type: "python_match",
      inputs: {
        SUBJECT: input(variable("status")),
        CASES: input({
          type: "python_case", inputs: { PATTERN: input(text("ready")), BODY: input(print(text("开始"))) },
          next: { block: {
            type: "python_case", inputs: { PATTERN: input(text("waiting")), BODY: input(print(text("等待"))) },
            next: { block: { type: "python_case_wildcard", inputs: { BODY: input(print(text("未知状态"))) } } },
          } },
        }),
      },
    },
  ])),
};
