import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, colorOptions, directionOptions, mathConstantOptions } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerValueBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_formula_value",
    message0: "数学公式 %1",
    args0: [{ type: "field_manim_formula", name: "LATEX", value: "x^2 + y^2 = z^2" }],
    inputsInline: true,
    output: "String",
    colour,
  }, (block, generator) => [generator.quote_(String(block.getFieldValue("LATEX") || "")), Order.ATOMIC]);

  context.registerBlock({
    type: "visual_python_manim_direction_constant",
    message0: "方向常量 %1",
    args0: [{ type: "field_dropdown", name: "VALUE", options: directionOptions }],
    inputsInline: true,
    output: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [String(block.getFieldValue("VALUE") || "RIGHT"), Order.ATOMIC];
  });

  context.registerBlock({
    type: "visual_python_manim_scaled_direction",
    message0: "方向 %1 * %2",
    args0: [
      { type: "field_dropdown", name: "DIRECTION", options: directionOptions },
      { type: "input_value", name: "SCALE", check: "Number" },
    ],
    inputsInline: true,
    output: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const direction = String(block.getFieldValue("DIRECTION") || "RIGHT");
    return [`${direction} * ${value(generator, block, "SCALE", "1")}`, Order.MULTIPLICATIVE];
  });

  context.registerBlock({
    type: "visual_python_manim_math_constant",
    message0: "数学常量 %1",
    args0: [{ type: "field_dropdown", name: "VALUE", options: mathConstantOptions }],
    inputsInline: true,
    output: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [String(block.getFieldValue("VALUE") || "PI"), Order.ATOMIC];
  });

  context.registerBlock({
    type: "visual_python_manim_degrees",
    message0: "角度 %1 度",
    args0: [{ type: "field_manim_angle", name: "VALUE", value: 90 }],
    inputsInline: true,
    output: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`${block.getFieldValue("VALUE") || "90"} * DEGREES`, Order.MULTIPLICATIVE];
  });

  context.registerBlock({
    type: "visual_python_manim_range",
    message0: "范围 起始 %1 结束 %2 步长 %3",
    args0: [
      { type: "input_value", name: "START", check: "Number" },
      { type: "input_value", name: "END", check: "Number" },
      { type: "input_value", name: "STEP", check: "Number" },
    ],
    inputsInline: true,
    output: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`[${value(generator, block, "START", "-5")}, ${value(generator, block, "END", "5")}, ${value(generator, block, "STEP", "1")}]`, Order.ATOMIC];
  });

  context.registerBlock({
    type: "visual_python_manim_range_min_max",
    message0: "范围 起始 %1 结束 %2",
    args0: [
      { type: "input_value", name: "START", check: "Number" },
      { type: "input_value", name: "END", check: "Number" },
    ],
    inputsInline: true,
    output: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`[${value(generator, block, "START", "-3")}, ${value(generator, block, "END", "3")}]`, Order.ATOMIC];
  });

  context.registerBlock({
    type: "visual_python_manim_point",
    message0: "点坐标 x %1 y %2 z %3",
    args0: [
      { type: "input_value", name: "X", check: "Number" },
      { type: "input_value", name: "Y", check: "Number" },
      { type: "input_value", name: "Z", check: "Number" },
    ],
    inputsInline: true,
    output: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`[${value(generator, block, "X", "0")}, ${value(generator, block, "Y", "0")}, ${value(generator, block, "Z", "0")}]`, Order.ATOMIC];
  });

  context.registerBlock({
    type: "visual_python_manim_point_list_3",
    message0: "三个顶点 %1 %2 %3",
    args0: [
      { type: "input_value", name: "P1" },
      { type: "input_value", name: "P2" },
      { type: "input_value", name: "P3" },
    ],
    inputsInline: true,
    output: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`${value(generator, block, "P1", "LEFT")}, ${value(generator, block, "P2", "UP")}, ${value(generator, block, "P3", "RIGHT")}`, Order.NONE];
  });

  context.registerBlock({
    type: "visual_python_manim_table_data_2x2",
    message0: "2x2 表格数据 %1 %2 %3 %4",
    args0: [
      { type: "input_value", name: "A" },
      { type: "input_value", name: "B" },
      { type: "input_value", name: "C" },
      { type: "input_value", name: "D" },
    ],
    inputsInline: true,
    output: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`[[${value(generator, block, "A", "'A'")}, ${value(generator, block, "B", "'B'")}], [${value(generator, block, "C", "'C'")}, ${value(generator, block, "D", "'D'")}]]`, Order.ATOMIC];
  });

  context.registerBlock({
    type: "visual_python_manim_matrix_data_2x2",
    message0: "2x2 数字矩阵 %1 %2 %3 %4",
    args0: [
      { type: "input_value", name: "A", check: "Number" },
      { type: "input_value", name: "B", check: "Number" },
      { type: "input_value", name: "C", check: "Number" },
      { type: "input_value", name: "D", check: "Number" },
    ],
    inputsInline: true,
    output: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`[[${value(generator, block, "A", "1")}, ${value(generator, block, "B", "2")}], [${value(generator, block, "C", "3")}, ${value(generator, block, "D", "4")}]]`, Order.ATOMIC];
  });

  context.registerBlock({
    type: "visual_python_manim_color_constant",
    message0: "颜色常量 %1",
    args0: [{ type: "field_dropdown", name: "VALUE", options: colorOptions }],
    inputsInline: true,
    output: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [String(block.getFieldValue("VALUE") || "WHITE"), Order.ATOMIC];
  });
};
