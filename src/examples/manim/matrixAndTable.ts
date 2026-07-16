import type { ExampleProject } from "../types";
import { assign, chain, direction, list, number, ref, sceneWorkspace, text, wait } from "./workspaceHelpers";

const row = (...values: (string | number)[]) => ({ type: "python_list_collection", extraState: { itemCount: values.length }, inputs: Object.fromEntries(values.map((value, i) => [`ITEM${i}`, typeof value === "number" ? number(value) : text(value)])) });
export const matrixAndTableExample: ExampleProject = {
  id: "manim-matrix-table", title: "Matrix and table", projectName: "manim-matrix-table.vpy", requiredPlugins: ["visual-python.manim"],
  workspace: sceneWorkspace("MatrixAndTable", "Scene", chain(
    assign("matrix", { type: "visual_python_manim_matrix_object", fields: { OBJECT: "Matrix" }, inputs: { DATA: list(row(1, 2), row(3, 4)) } }),
    assign("table", { type: "visual_python_manim_table_object", fields: { OBJECT: "Table" }, inputs: { DATA: list(row("A", "B"), row("C", "D")) } }),
    assign("table", { type: "visual_python_manim_table_highlight_cell", fields: { COLOR: "YELLOW" }, inputs: { TABLE: ref("table"), ROW: number(2), COLUMN: number(1) } }),
    assign("table", { type: "visual_python_manim_shift", inputs: { MOBJECT: ref("table"), VECTOR: direction("RIGHT") } }),
    { type: "visual_python_manim_add_two", inputs: { FIRST: ref("matrix"), SECOND: ref("table") } }, wait(),
  )),
};
