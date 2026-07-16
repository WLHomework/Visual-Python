import type { ExampleProject } from "../types";
import { chain, input, number, text, workspace } from "./builders";

export const asyncBasicsExample: ExampleProject = {
  id: "python-async-basics", title: "异步基础", projectName: "async-basics.vpy",
  workspace: workspace(chain([
    { type: "python_import", fields: { MODULE: "asyncio" } },
    {
      type: "python_async_function_structured", fields: { NAME: "main" }, extraState: { parameters: [] },
      inputs: { BODY: input(chain([
        { type: "python_print", inputs: { VALUE: input({ type: "python_await", inputs: { VALUE: input({ type: "python_call_structured", fields: { TARGET: "asyncio.sleep", ARG_NAME1: "result" }, extraState: { arguments: [{ kind: "positional", name: "" }, { kind: "keyword", name: "result" }] }, inputs: { ARG0: input(number(0)), ARG1: input(text("完成")) } }) } }) } },
      ])) },
    },
    {
      type: "python_call_statement_structured", fields: { TARGET: "asyncio.run" },
      extraState: { arguments: [{ kind: "positional", name: "" }] },
      inputs: { ARG0: input({ type: "python_call_structured", fields: { TARGET: "main" }, extraState: { arguments: [] } }) },
    },
  ])),
};
