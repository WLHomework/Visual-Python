import type { ExampleProject } from "../types";
import { chain, compare, input, number, print, variable, workspace } from "./builders";

export const typedFunctionsExample: ExampleProject = {
  id: "python-typed-functions", title: "类型函数", projectName: "typed-functions.vpy",
  workspace: workspace(chain([
    {
      type: "python_typed_function_structured",
      fields: {
        NAME: "clamp", RETURN_TYPE: "int",
        PARAM_NAME0: "value", PARAM_TYPE0: "int",
        PARAM_NAME1: "minimum", PARAM_TYPE1: "int",
      },
      extraState: { parameters: [
        { kind: "positional_only", name: "value", annotation: "int" },
        { kind: "keyword_only_default", name: "minimum", annotation: "int" },
      ] },
      inputs: {
        PARAM1: input(number(0)),
        BODY: input({
          type: "controls_if", extraState: { hasElse: true },
          inputs: {
            IF0: input(compare(variable("value"), "LT", variable("minimum"))),
            DO0: input({ type: "python_return", inputs: { VALUE: input(variable("minimum")) } }),
            ELSE: input({ type: "python_return", inputs: { VALUE: input(variable("value")) } }),
          },
        }),
      },
    },
    print({
      type: "python_call_structured", fields: { TARGET: "clamp", ARG_NAME1: "minimum" },
      extraState: { arguments: [{ kind: "positional", name: "" }, { kind: "keyword", name: "minimum" }] },
      inputs: { ARG0: input(number(3)), ARG1: input(number(5)) },
    }),
  ])),
};
