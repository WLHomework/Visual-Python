import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerPlaneObjectBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_number_line_object",
    message0: "数轴 数值范围 %1 长度 %2 显示数字 %3",
    args0: [
      { type: "input_value", name: "X_RANGE", check: "ManimRange" },
      { type: "input_value", name: "LENGTH", check: "Number" },
      { type: "field_checkbox", name: "INCLUDE_NUMBERS", checked: true },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const xRange = value(generator, block, "X_RANGE", "[-5, 5, 1]");
    const length = value(generator, block, "LENGTH", "10");
    const includeNumbers = block.getFieldValue("INCLUDE_NUMBERS") === "TRUE" ? "True" : "False";
    return [`NumberLine(x_range=${xRange}, length=${length}, include_numbers=${includeNumbers})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_number_plane_object",
    message0: "平面网格 横轴范围 %1 纵轴范围 %2 横轴长度 %3 纵轴长度 %4",
    args0: [
      { type: "input_value", name: "X_RANGE", check: "ManimRange" },
      { type: "input_value", name: "Y_RANGE", check: "ManimRange" },
      { type: "input_value", name: "X_LENGTH", check: "Number" },
      { type: "input_value", name: "Y_LENGTH", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const xRange = value(generator, block, "X_RANGE", "[-7, 7, 1]");
    const yRange = value(generator, block, "Y_RANGE", "[-4, 4, 1]");
    const xLength = value(generator, block, "X_LENGTH", "14");
    const yLength = value(generator, block, "Y_LENGTH", "8");
    return [pythonCall("NumberPlane", [`x_range=${xRange}`, `y_range=${yRange}`, `x_length=${xLength}`, `y_length=${yLength}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_complex_plane_object",
    message0: "复平面 横轴范围 %1 纵轴范围 %2",
    args0: [
      { type: "input_value", name: "X_RANGE", check: "ManimRange" },
      { type: "input_value", name: "Y_RANGE", check: "ManimRange" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const xRange = value(generator, block, "X_RANGE", "[-5, 5, 1]");
    const yRange = value(generator, block, "Y_RANGE", "[-3, 3, 1]");
    return [`ComplexPlane(x_range=${xRange}, y_range=${yRange})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_polar_plane_object",
    message0: "极坐标平面 最大半径 %1 半径步长 %2 尺寸 %3",
    args0: [
      { type: "input_value", name: "RADIUS_MAX", check: "Number" },
      { type: "input_value", name: "RADIUS_STEP", check: "Number" },
      { type: "input_value", name: "SIZE", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const radiusMax = value(generator, block, "RADIUS_MAX", "4");
    const radiusStep = value(generator, block, "RADIUS_STEP", "1");
    const size = value(generator, block, "SIZE", "6");
    return [`PolarPlane(radius_max=${radiusMax}, radius_step=${radiusStep}, size=${size})`, Order.FUNCTION_CALL];
  });
};
