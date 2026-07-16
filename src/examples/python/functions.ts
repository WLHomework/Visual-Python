import type { ExampleProject } from "../types";
import { arithmetic, chain, input, number, print, variable, workspace } from "./builders";

export const functionsExample: ExampleProject = {
  id: "python-functions", title: "定义与调用函数", projectName: "functions.vpy",
  workspace: workspace(chain([
    {
      type: "python_function_structured", fields: { NAME: "add", PARAM_NAME0: "a", PARAM_NAME1: "b" },
      extraState: { parameters: [{ kind: "positional", name: "a" }, { kind: "positional", name: "b" }] },
      inputs: { BODY: input({ type: "python_return", inputs: { VALUE: input(arithmetic(variable("a"), "ADD", variable("b"))) } }) },
    },
    print({ type: "python_call_structured", fields: { TARGET: "add" }, extraState: { arguments: [{ kind: "positional", name: "" }, { kind: "positional", name: "" }] }, inputs: { ARG0: input(number(2)), ARG1: input(number(3)) } }),
  ])),
};
