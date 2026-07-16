import type { ExampleProject } from "../types";
import { chain, input, list, print, setVariable, text, variable, workspace } from "./builders";

const stringMethod = (receiver: ReturnType<typeof text> | ReturnType<typeof variable>, method: string, argument?: ReturnType<typeof text> | ReturnType<typeof list>) => ({
  type: "python_string_method", fields: { METHOD: method },
  inputs: { TEXT: input(receiver), ...(argument ? { ARG: input(argument) } : {}) },
});

export const stringProcessingExample: ExampleProject = {
  id: "python-string", title: "字符串处理", projectName: "string-processing.vpy",
  workspace: workspace(chain([
    setVariable("message", text("  Hello Python  ")),
    print(stringMethod(variable("message"), "strip")),
    print(stringMethod(variable("message"), "upper")),
    print(stringMethod(variable("message"), "split")),
    print(stringMethod(text("-"), "join", list(text("visual"), text("python")))),
  ])),
};
