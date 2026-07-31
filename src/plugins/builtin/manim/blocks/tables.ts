import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, matrixOptions, tableOptions } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerTableBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_table_object",
    message0: "表格对象 %1 数据 %2",
    args0: [
      { type: "field_dropdown", name: "OBJECT", options: tableOptions },
      { type: "input_value", name: "DATA" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const objectType = String(block.getFieldValue("OBJECT") || "Table");
    const data = value(generator, block, "DATA", "[['A', 'B'], ['C', 'D']]");
    return [`${objectType}(${data})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_matrix_object",
    message0: "矩阵对象 %1 数据 %2",
    args0: [
      { type: "field_dropdown", name: "OBJECT", options: matrixOptions },
      { type: "input_value", name: "DATA" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const objectType = String(block.getFieldValue("OBJECT") || "Matrix");
    const data = value(generator, block, "DATA", "[[1, 2], [3, 4]]");
    return [`${objectType}(${data})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_determinant_object",
    message0: "行列式矩阵 数据 %1",
    args0: [{ type: "input_value", name: "DATA" }],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const data = value(generator, block, "DATA", "[[1, 2], [3, 4]]");
    return [`Matrix(${data}, left_bracket="|", right_bracket="|")`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_table_highlight_cell",
    message0: "表格 %1 高亮单元格 行 %2 列 %3 颜色 %4",
    args0: [
      { type: "input_value", name: "TABLE", check: "ManimObject" },
      { type: "input_value", name: "ROW", check: "Number" },
      { type: "input_value", name: "COLUMN", check: "Number" },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const table = value(generator, block, "TABLE", "Table([['A', 'B'], ['C', 'D']])", Order.MEMBER);
    const row = value(generator, block, "ROW", "1");
    const column = value(generator, block, "COLUMN", "1");
    const color = String(block.getFieldValue("COLOR") || "YELLOW");
    return [`${table}.add_highlighted_cell((${row}, ${column}), color=${color})`, Order.FUNCTION_CALL];
  });
};
