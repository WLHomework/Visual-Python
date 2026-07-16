import type { ExampleProject } from "../types";
import { chain, input, list, number, print, setVariable, variable, workspace } from "./builders";

const listMethod = (method: string, argument?: ReturnType<typeof number>) => ({
  type: "python_list_method", fields: { METHOD: method },
  inputs: { LIST: input(variable("items")), ...(argument ? { ARG: input(argument) } : {}) },
});

export const listOperationsExample: ExampleProject = {
  id: "python-list-operations", title: "列表操作", projectName: "list-operations.vpy",
  workspace: workspace(chain([
    setVariable("items", list(number(3), number(1), number(2))),
    listMethod("append", number(4)),
    listMethod("sort"),
    print({ type: "python_index", inputs: { OBJECT: input(variable("items")), INDEX: input(number(0)) } }),
    print(variable("items")),
  ])),
};
