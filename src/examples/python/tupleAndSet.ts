import type { ExampleProject } from "../types";
import { chain, input, list, number, print, sequence, setVariable, variable, workspace } from "./builders";

export const tupleAndSetExample: ExampleProject = {
  id: "python-tuple-set", title: "元组与集合", projectName: "tuple-and-set.vpy",
  workspace: workspace(chain([
    setVariable("point", sequence("tuple", number(3), number(4))),
    setVariable("values", list(number(1), number(1), number(2), number(3))),
    setVariable("unique_values", { type: "python_convert", fields: { TYPE: "set" }, inputs: { VALUE: input(variable("values")) } }),
    print(variable("point")),
    print(variable("unique_values")),
    print({ type: "python_membership", fields: { OP: "in" }, inputs: { ITEM: input(number(2)), COLLECTION: input(variable("unique_values")) } }),
  ])),
};
