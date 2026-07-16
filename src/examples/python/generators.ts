import type { ExampleProject } from "../types";
import { arithmetic, chain, compare, input, list, number, print, setVariable, variable, workspace } from "./builders";

export const generatorsExample: ExampleProject = {
  id: "python-generators", title: "生成器", projectName: "generators.vpy",
  workspace: workspace(chain([
    {
      type: "python_function_structured", fields: { NAME: "repeat", PARAM_NAME0: "items" },
      extraState: { parameters: [{ kind: "positional", name: "items" }] },
      inputs: { BODY: input({ type: "python_yield_from", inputs: { VALUE: input(variable("items")) } }) },
    },
    setVariable("numbers", list(number(-1), number(1), number(2), number(3))),
    setVariable("doubled", {
      type: "python_generator_expression", fields: { VAR: { name: "item" } },
      inputs: {
        EXPRESSION: input(arithmetic(variable("item"), "MULTIPLY", number(2))),
        ITERABLE: input(variable("numbers")),
        CONDITION: input(compare(variable("item"), "GT", number(0))),
      },
    }),
    print({ type: "python_convert", fields: { TYPE: "list" }, inputs: { VALUE: input(variable("doubled")) } }),
    print({
      type: "python_convert", fields: { TYPE: "list" },
      inputs: { VALUE: input({ type: "python_call_structured", fields: { TARGET: "repeat" }, extraState: { arguments: [{ kind: "positional", name: "" }] }, inputs: { ARG0: input(variable("numbers")) } }) },
    }),
  ])),
};
