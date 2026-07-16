import type { ExampleProject } from "../types";
import { chain, input, list, number, print, setVariable, variable, workspace } from "./builders";

const targetVariable = (name: string) => ({ type: "python_variable_target", fields: { VAR: { name } } });

export const assignmentAndUnpackingExample: ExampleProject = {
  id: "python-assignment-unpacking", title: "赋值与解包", projectName: "assignment-and-unpacking.vpy",
  workspace: workspace(chain([
    setVariable("items", list(number(1), number(2), number(3))),
    {
      type: "python_assign_target",
      inputs: {
        TARGET: input({ type: "python_index_target", inputs: { OBJECT: input(variable("items")), INDEX: input(number(0)) } }),
        VALUE: input(number(10)),
      },
    },
    setVariable("total", number(0)),
    {
      type: "python_augmented_assign", fields: { OP: "+=" },
      inputs: { TARGET: input(targetVariable("total")), VALUE: input({ type: "python_index", inputs: { OBJECT: input(variable("items")), INDEX: input(number(0)) } }) },
    },
    {
      type: "python_assign_target",
      inputs: {
        TARGET: input({
          type: "python_unpack_target", fields: { KIND: "tuple" },
          inputs: {
            A: input(targetVariable("head")),
            B: input({ type: "python_starred_target", inputs: { TARGET: input(targetVariable("tail")) } }),
          },
        }),
        VALUE: input(variable("items")),
      },
    },
    print(variable("total")),
    print(variable("head")),
    print(variable("tail")),
  ])),
};
