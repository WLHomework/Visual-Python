import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, colorOptions, shapeArgumentDefaults, shapeOptions } from "../constants";
import { addManimImport, joinArguments, pythonCall, value } from "../helpers";

export const registerShapeObjectBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_shape_object",
    message0: "基础图形 %1 参数 %2 颜色 %3",
    args0: [
      { type: "field_dropdown", name: "SHAPE", options: shapeOptions },
      { type: "input_value", name: "ARG" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const shape = String(block.getFieldValue("SHAPE") || "Circle");
    const argument = value(generator, block, "ARG", shapeArgumentDefaults[shape] || "");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [`${shape}(${joinArguments(argument, `color=${color}`)})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_circle_object",
    message0: "圆形 Circle 半径 %1 颜色 %2",
    args0: [
      { type: "input_value", name: "RADIUS", check: "Number" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const radius = value(generator, block, "RADIUS", "1");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [`Circle(radius=${radius}, color=${color})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_square_object",
    message0: "正方形 Square 边长 %1 颜色 %2",
    args0: [
      { type: "input_value", name: "SIDE_LENGTH", check: "Number" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const sideLength = value(generator, block, "SIDE_LENGTH", "2");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [`Square(side_length=${sideLength}, color=${color})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_rectangle_object",
    message0: "矩形 Rectangle 宽 %1 高 %2 颜色 %3",
    args0: [
      { type: "input_value", name: "WIDTH", check: "Number" },
      { type: "input_value", name: "HEIGHT", check: "Number" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const width = value(generator, block, "WIDTH", "3");
    const height = value(generator, block, "HEIGHT", "2");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("Rectangle", [`width=${width}`, `height=${height}`, `color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_dot_object",
    message0: "点 Dot 位置 %1 半径 %2 颜色 %3",
    args0: [
      { type: "input_value", name: "POINT" },
      { type: "input_value", name: "RADIUS", check: "Number" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const point = value(generator, block, "POINT", "ORIGIN");
    const radius = value(generator, block, "RADIUS", "0.08");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("Dot", [`point=${point}`, `radius=${radius}`, `color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });
};
