import type { ExampleProject } from "../types";
import { chain, input, print, text, variable, workspace } from "./builders";

const openFile = (mode: "w" | "r") => ({ type: "python_open_file", fields: { MODE: mode, ENCODING: "utf-8" }, inputs: { PATH: input(text("hello.txt")) } });

export const fileIoExample: ExampleProject = {
  id: "python-files", title: "文件读写", projectName: "file-io.vpy",
  workspace: workspace(chain([
    { type: "python_with", fields: { ALIAS: { name: "handle" } }, inputs: {
      CONTEXT: input(openFile("w")), BODY: input({ type: "python_file_write", inputs: { FILE: input(variable("handle")), VALUE: input(text("Hello, Python!")) } }),
    } },
    { type: "python_with", fields: { ALIAS: { name: "handle" } }, inputs: {
      CONTEXT: input(openFile("r")), BODY: input(print({ type: "python_file_read", inputs: { FILE: input(variable("handle")) } })),
    } },
  ])),
};
