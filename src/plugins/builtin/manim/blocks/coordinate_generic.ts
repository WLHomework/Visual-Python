import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, coordinateOptions } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerGenericCoordinateObjectBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_coordinate_object",
    message0: "坐标系统 %1 横轴范围 %2 纵轴范围 %3",
    args0: [
      { type: "field_dropdown", name: "SYSTEM", options: coordinateOptions },
      { type: "input_value", name: "X_RANGE" },
      { type: "input_value", name: "Y_RANGE" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const system = String(block.getFieldValue("SYSTEM") || "Axes");
    const xRange = value(generator, block, "X_RANGE", "[-5, 5, 1]");
    const yRange = value(generator, block, "Y_RANGE", "[-3, 3, 1]");
    return [`${system}(x_range=${xRange}, y_range=${yRange})`, Order.FUNCTION_CALL];
  });
};
