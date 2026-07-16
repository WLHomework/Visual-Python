import type { ExampleProject } from "../types";
import { chain, input, print, setVariable, text, variable, workspace } from "./builders";

export const classesExample: ExampleProject = {
  id: "python-classes", title: "类与对象", projectName: "classes-and-objects.vpy",
  workspace: workspace(chain([
    {
      type: "python_class_def", fields: { NAME: "Person", BASES: "object" }, inputs: { BODY: input(chain([
        {
          type: "python_method_structured", fields: { NAME: "__init__", PARAM_NAME0: "self", PARAM_NAME1: "name" },
          extraState: { parameters: [{ kind: "positional", name: "self" }, { kind: "positional", name: "name" }] },
          inputs: { BODY: input({ type: "python_set_attribute", fields: { ATTRIBUTE: "name" }, inputs: { OBJECT: input(variable("self")), VALUE: input(variable("name")) } }) },
        },
        {
          type: "python_method_structured", fields: { NAME: "greet", PARAM_NAME0: "self" },
          extraState: { parameters: [{ kind: "positional", name: "self" }] },
          inputs: { BODY: input({ type: "python_return", inputs: { VALUE: input({ type: "python_attribute", fields: { ATTRIBUTE: "name" }, inputs: { OBJECT: input(variable("self")) } }) } }) },
        },
      ])) },
    },
    setVariable("person", { type: "python_new_object", fields: { CLASS: "Person" }, inputs: { ARG: input(text("Ada")) } }),
    print({ type: "python_method_call", fields: { METHOD: "greet" }, inputs: { OBJECT: input(variable("person")) } }),
  ])),
};
