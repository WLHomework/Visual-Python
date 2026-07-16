import type { ExampleProject } from "../types";

export const inputAndVariableExample: ExampleProject = {
  id: "python-input-variable",
  title: "输入与变量",
  projectName: "input-and-variable.vpy",
  workspace: {
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: "python_input_assign",
        x: 96,
        y: 72,
        fields: { VAR: { name: "name" } },
        inputs: { PROMPT: { block: { type: "text", fields: { TEXT: "请输入你的名字：" } } } },
        next: { block: { type: "python_print", inputs: { VALUE: { block: { type: "variables_get", fields: { VAR: { name: "name" } } } } } } },
      }],
    },
  },
};
