import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, colorOptions } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerCoordinateExtraBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_axes_plot",
    message0: "坐标系 %1 绘制函数 %2 x范围 %3 颜色 %4",
    args0: [
      { type: "input_value", name: "AXES", check: "ManimObject" },
      { type: "input_value", name: "FUNCTION" },
      { type: "input_value", name: "X_RANGE" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const axes = value(generator, block, "AXES", "Axes()", Order.MEMBER);
    const fn = value(generator, block, "FUNCTION", "lambda x: x");
    const xRange = value(generator, block, "X_RANGE", "[-5, 5]");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [`${axes}.plot(${fn}, x_range=${xRange}, color=${color})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_axes_c2p",
    message0: "坐标系 %1 坐标转点 x %2 y %3",
    args0: [
      { type: "input_value", name: "AXES", check: "ManimObject" },
      { type: "input_value", name: "X" },
      { type: "input_value", name: "Y" },
    ],
    inputsInline: true,
    output: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const axes = value(generator, block, "AXES", "Axes()", Order.MEMBER);
    return [`${axes}.c2p(${value(generator, block, "X", "0")}, ${value(generator, block, "Y", "0")})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_axes_p2c",
    message0: "坐标系 %1 点转坐标 %2",
    args0: [
      { type: "input_value", name: "AXES", check: "ManimObject" },
      { type: "input_value", name: "POINT" },
    ],
    inputsInline: true,
    output: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const axes = value(generator, block, "AXES", "Axes()", Order.MEMBER);
    return [`${axes}.p2c(${value(generator, block, "POINT", "ORIGIN")})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_axis_labels",
    message0: "坐标系 %1 轴标签 x %2 y %3",
    args0: [
      { type: "input_value", name: "AXES", check: "ManimObject" },
      { type: "input_value", name: "X_LABEL", check: "String" },
      { type: "input_value", name: "Y_LABEL", check: "String" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const axes = value(generator, block, "AXES", "Axes()", Order.MEMBER);
    const xLabel = value(generator, block, "X_LABEL", "'x'");
    const yLabel = value(generator, block, "Y_LABEL", "'y'");
    return [`${axes}.get_axis_labels(x_label=${xLabel}, y_label=${yLabel})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_axes_area",
    message0: "坐标系 %1 曲线 %2 面积范围 %3 颜色 %4",
    args0: [
      { type: "input_value", name: "AXES", check: "ManimObject" },
      { type: "input_value", name: "GRAPH", check: "ManimObject" },
      { type: "input_value", name: "X_RANGE" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const axes = value(generator, block, "AXES", "Axes()", Order.MEMBER);
    const graph = value(generator, block, "GRAPH", "Axes().plot(lambda x: x)");
    const xRange = value(generator, block, "X_RANGE", "[-1, 1]");
    const color = String(block.getFieldValue("COLOR") || "BLUE");
    return [`${axes}.get_area(${graph}, x_range=${xRange}, color=${color})`, Order.FUNCTION_CALL];
  });
};
