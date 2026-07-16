import type { ExampleProject } from "../types";
import { input, print, text, variable, workspace } from "./builders";

export const exceptionsExample: ExampleProject = {
  id: "python-exceptions", title: "异常处理", projectName: "exceptions.vpy",
  workspace: workspace({
    type: "python_try_full", fields: { ERROR: "ValueError", ALIAS: { name: "error" } },
    inputs: {
      TRY: input(print({ type: "python_convert", fields: { TYPE: "int" }, inputs: { VALUE: input(text("abc")) } })),
      EXCEPT: input(print(variable("error"))),
      ELSE: input(print(text("转换成功"))),
      FINALLY: input(print(text("处理完成"))),
    },
  }),
};
