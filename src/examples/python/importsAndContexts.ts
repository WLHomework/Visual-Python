import type { ExampleProject } from "../types";
import { chain, input, print, text, variable, workspace } from "./builders";

const call = (target: string, argument: ReturnType<typeof text>) => ({
  type: "python_call_structured", fields: { TARGET: target },
  extraState: { arguments: [{ kind: "positional", name: "" }] },
  inputs: { ARG0: input(argument) },
});

export const importsAndContextsExample: ExampleProject = {
  id: "python-imports-contexts", title: "导入与上下文", projectName: "imports-and-contexts.vpy",
  workspace: workspace(chain([
    { type: "python_import_multiple", fields: { MODULE1: "os", MODULE2: "sys" } },
    { type: "python_from_import_as", fields: { MODULE: "contextlib", NAME: "nullcontext", ALIAS: "scope" } },
    {
      type: "python_with_two", fields: { ALIAS1: { name: "first" }, ALIAS2: { name: "second" } },
      inputs: {
        CONTEXT1: input(call("scope", text("A"))),
        CONTEXT2: input(call("scope", text("B"))),
        BODY: input(chain([print(variable("first")), print(variable("second"))])),
      },
    },
  ])),
};
