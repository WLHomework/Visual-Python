import type { ExampleProject } from "../types";
import { chain, input, number, print, setVariable, text, variable, workspace } from "./builders";

export const dictionaryExample: ExampleProject = {
  id: "python-dictionary", title: "字典操作", projectName: "dictionary.vpy",
  workspace: workspace(chain([
    setVariable("student", { type: "python_dynamic_dict", extraState: { itemCount: 2 }, inputs: {
      KEY0: input(text("name")), VALUE0: input(text("Ada")), KEY1: input(text("score")), VALUE1: input(number(95)),
    } }),
    print({ type: "python_dict_get", inputs: { DICT: input(variable("student")), KEY: input(text("name")) } }),
    { type: "python_for_in", fields: { VAR: { name: "pair" } }, inputs: {
      ITERABLE: input({ type: "python_dict_view", fields: { METHOD: "items" }, inputs: { DICT: input(variable("student")) } }),
      DO: input(print(variable("pair"))),
    } },
  ])),
};
