import type { ExampleProject } from "../types";
import { chain, input, number, print, text, variable, workspace } from "./builders";

export const advancedFunctionsExample: ExampleProject = {
  id: "python-advanced-functions", title: "函数进阶", projectName: "advanced-functions.vpy",
  workspace: workspace(chain([
    {
      type: "python_function_structured",
      fields: { NAME: "collect", PARAM_NAME0: "value", PARAM_NAME1: "count", PARAM_NAME2: "args", PARAM_NAME3: "kwargs" },
      extraState: { parameters: [{ kind: "positional", name: "value" }, { kind: "default", name: "count" }, { kind: "args", name: "args" }, { kind: "kwargs", name: "kwargs" }] },
      inputs: { PARAM1: input(number(1)), BODY: input({ type: "python_return", inputs: { VALUE: input(variable("value")) } }) },
    },
    print({
      type: "python_call_structured", fields: { TARGET: "collect", ARG_NAME1: "count" },
      extraState: { arguments: [{ kind: "positional", name: "" }, { kind: "keyword", name: "count" }] },
      inputs: { ARG0: input(text("Python")), ARG1: input(number(3)) },
    }),
  ])),
};
