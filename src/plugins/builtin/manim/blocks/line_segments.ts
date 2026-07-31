import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerLineSegmentBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_line_segment_object",
    message0: "直线 起点 %1 终点 %2 颜色 %3",
    args0: [
      { type: "input_value", name: "START", check: ["ManimVector", "Number"] },
      { type: "input_value", name: "END", check: ["ManimVector", "Number"] },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const start = value(generator, block, "START", "LEFT");
    const end = value(generator, block, "END", "RIGHT");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [`Line(${start}, ${end}, color=${color})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_dashed_line_object",
    message0: "虚线 起点 %1 终点 %2 虚线长度 %3 颜色 %4",
    args0: [
      { type: "input_value", name: "START", check: ["ManimVector", "Number"] },
      { type: "input_value", name: "END", check: ["ManimVector", "Number"] },
      { type: "input_value", name: "DASH_LENGTH", check: "Number" },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const start = value(generator, block, "START", "LEFT");
    const end = value(generator, block, "END", "RIGHT");
    const dashLength = value(generator, block, "DASH_LENGTH", "0.05");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("DashedLine", [start, end, `dash_length=${dashLength}`, `color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_vector_object",
    message0: "向量 方向 %1 颜色 %2",
    args0: [
      { type: "input_value", name: "DIRECTION", check: ["ManimVector", "Number"] },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const direction = value(generator, block, "DIRECTION", "RIGHT");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [`Vector(${direction}, color=${color})`, Order.FUNCTION_CALL];
  });
};
