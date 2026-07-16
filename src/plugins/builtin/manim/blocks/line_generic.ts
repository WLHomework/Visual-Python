import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, colorOptions, lineOptions } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerGenericLineBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_line_object",
    message0: "线条/箭头 %1 起点 %2 终点 %3 颜色 %4",
    args0: [
      { type: "field_dropdown", name: "OBJECT", options: lineOptions },
      { type: "input_value", name: "START" },
      { type: "input_value", name: "END" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const objectType = String(block.getFieldValue("OBJECT") || "Line");
    const start = value(generator, block, "START", "LEFT");
    const end = value(generator, block, "END", "RIGHT");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [`${objectType}(${start}, ${end}, color=${color})`, Order.FUNCTION_CALL];
  });
};
