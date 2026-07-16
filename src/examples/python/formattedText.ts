import type { ExampleProject } from "../types";
import { chain, input, number, print, setVariable, variable, workspace } from "./builders";

export const formattedTextExample: ExampleProject = {
  id: "python-formatted-text", title: "格式化与多行文本", projectName: "formatted-text.vpy",
  workspace: workspace(chain([
    setVariable("score", number(95.5)),
    print({
      type: "python_f_string", fields: { PREFIX: "分数：", FORMAT: ".1f", SUFFIX: " 分" },
      inputs: { VALUE: input(variable("score")) },
    }),
    print({ type: "python_multiline_string", fields: { TEXT: "第一行\\n第二行" } }),
    print({ type: "python_bytes", fields: { TEXT: "Python", ENCODING: "utf-8" } }),
  ])),
};
