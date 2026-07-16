import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, colorOptions, curvedShapeArgumentDefaults, curvedShapeOptions } from "../constants";
import { addManimImport, joinArguments, value } from "../helpers";

export const registerGenericCurveShapeBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_curved_shape_object",
    message0: "曲线/特殊形状 %1 参数 %2 颜色 %3",
    args0: [
      { type: "field_dropdown", name: "OBJECT", options: curvedShapeOptions },
      { type: "input_value", name: "ARG" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const objectType = String(block.getFieldValue("OBJECT") || "RoundedRectangle");
    const argument = value(generator, block, "ARG", curvedShapeArgumentDefaults[objectType] || "");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [`${objectType}(${joinArguments(argument, `color=${color}`)})`, Order.FUNCTION_CALL];
  });
};
