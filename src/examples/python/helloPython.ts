import type { ExampleProject } from "../types";

export const helloPythonExample: ExampleProject = {
  id: "python-hello",
  title: "Hello Python",
  projectName: "hello-python.vpy",
  workspace: {
    blocks: {
      languageVersion: 0,
      blocks: [{ type: "python_print", x: 96, y: 72, inputs: { VALUE: { block: { type: "text", fields: { TEXT: "Hello, Python!" } } } } }],
    },
  },
};
