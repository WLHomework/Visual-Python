import type { ExampleProject } from "../types";

export const typeConversionExample: ExampleProject = {
  id: "python-type-conversion",
  title: "数据类型转换",
  projectName: "type-conversion.vpy",
  workspace: {
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: "python_input_assign",
        x: 96,
        y: 72,
        fields: { VAR: { name: "age_text" } },
        inputs: { PROMPT: { block: { type: "text", fields: { TEXT: "请输入年龄：" } } } },
        next: { block: {
          type: "variables_set",
          fields: { VAR: { name: "age" } },
          inputs: { VALUE: { block: { type: "python_convert", fields: { TYPE: "int" }, inputs: { VALUE: { block: { type: "variables_get", fields: { VAR: { name: "age_text" } } } } } } } },
          next: { block: { type: "python_print", inputs: { VALUE: { block: { type: "variables_get", fields: { VAR: { name: "age" } } } } } } },
        } },
      }],
    },
  },
};
