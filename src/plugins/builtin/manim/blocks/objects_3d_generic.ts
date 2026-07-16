import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, colorOptions, threeDObjectArgumentDefaults, threeDObjectOptions } from "../constants";
import { addManimImport, joinArguments, value } from "../helpers";

export const registerGenericThreeDObjectBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_3d_object",
    message0: "3D 对象 %1 参数 %2 颜色 %3",
    args0: [
      { type: "field_dropdown", name: "OBJECT", options: threeDObjectOptions },
      { type: "input_value", name: "ARG" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const objectType = String(block.getFieldValue("OBJECT") || "Sphere");
    const argument = value(generator, block, "ARG", threeDObjectArgumentDefaults[objectType] || "");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [`${objectType}(${joinArguments(argument, `color=${color}`)})`, Order.FUNCTION_CALL];
  });
};
