import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerArrowObjectBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_arrow_object",
    message0: "箭头 起点 %1 终点 %2 留白 %3 颜色 %4",
    args0: [
      { type: "input_value", name: "START", check: ["ManimVector", "Number"] },
      { type: "input_value", name: "END", check: ["ManimVector", "Number"] },
      { type: "input_value", name: "BUFF", check: "Number" },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const start = value(generator, block, "START", "LEFT");
    const end = value(generator, block, "END", "RIGHT");
    const buff = value(generator, block, "BUFF", "0");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("Arrow", [start, end, `buff=${buff}`, `color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_double_arrow_object",
    message0: "双箭头 起点 %1 终点 %2 留白 %3 颜色 %4",
    args0: [
      { type: "input_value", name: "START", check: ["ManimVector", "Number"] },
      { type: "input_value", name: "END", check: ["ManimVector", "Number"] },
      { type: "input_value", name: "BUFF", check: "Number" },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const start = value(generator, block, "START", "LEFT");
    const end = value(generator, block, "END", "RIGHT");
    const buff = value(generator, block, "BUFF", "0");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("DoubleArrow", [start, end, `buff=${buff}`, `color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_curved_arrow_object",
    message0: "曲线箭头 起点 %1 终点 %2 弯曲角度 %3 颜色 %4",
    args0: [
      { type: "input_value", name: "START", check: ["ManimVector", "Number"] },
      { type: "input_value", name: "END", check: ["ManimVector", "Number"] },
      { type: "input_value", name: "ANGLE", check: ["ManimAngle", "Number"] },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const start = value(generator, block, "START", "LEFT");
    const end = value(generator, block, "END", "RIGHT");
    const angle = value(generator, block, "ANGLE", "TAU / 4");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("CurvedArrow", [start, end, `angle=${angle}`, `color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });
};
