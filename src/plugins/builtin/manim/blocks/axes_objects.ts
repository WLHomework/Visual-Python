import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerAxesObjectBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_axes_object",
    message0: "2D 坐标系 Axes x范围 %1 y范围 %2 x长度 %3 y长度 %4",
    args0: [
      { type: "input_value", name: "X_RANGE" },
      { type: "input_value", name: "Y_RANGE" },
      { type: "input_value", name: "X_LENGTH", check: "Number" },
      { type: "input_value", name: "Y_LENGTH", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const xRange = value(generator, block, "X_RANGE", "[-5, 5, 1]");
    const yRange = value(generator, block, "Y_RANGE", "[-3, 3, 1]");
    const xLength = value(generator, block, "X_LENGTH", "10");
    const yLength = value(generator, block, "Y_LENGTH", "6");
    return [pythonCall("Axes", [`x_range=${xRange}`, `y_range=${yRange}`, `x_length=${xLength}`, `y_length=${yLength}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_three_d_axes_object",
    message0: "3D 坐标系 ThreeDAxes x范围 %1 y范围 %2 z范围 %3",
    args0: [
      { type: "input_value", name: "X_RANGE" },
      { type: "input_value", name: "Y_RANGE" },
      { type: "input_value", name: "Z_RANGE" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const xRange = value(generator, block, "X_RANGE", "[-6, 6, 1]");
    const yRange = value(generator, block, "Y_RANGE", "[-5, 5, 1]");
    const zRange = value(generator, block, "Z_RANGE", "[-4, 4, 1]");
    return [pythonCall("ThreeDAxes", [`x_range=${xRange}`, `y_range=${yRange}`, `z_range=${zRange}`], { multiline: true }), Order.FUNCTION_CALL];
  });
};
