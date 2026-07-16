import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, colorOptions } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerBasicThreeDSolidBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_sphere_object",
    message0: "球体 Sphere 半径 %1 不透明度 %2 颜色 %3",
    args0: [
      { type: "input_value", name: "RADIUS", check: "Number" },
      { type: "input_value", name: "FILL_OPACITY", check: "Number" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const radius = value(generator, block, "RADIUS", "1");
    const fillOpacity = value(generator, block, "FILL_OPACITY", "0.75");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("Sphere", [`radius=${radius}`, `fill_opacity=${fillOpacity}`, `fill_color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_cube_object",
    message0: "立方体 Cube 边长 %1 不透明度 %2 颜色 %3",
    args0: [
      { type: "input_value", name: "SIDE_LENGTH", check: "Number" },
      { type: "input_value", name: "FILL_OPACITY", check: "Number" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const sideLength = value(generator, block, "SIDE_LENGTH", "2");
    const fillOpacity = value(generator, block, "FILL_OPACITY", "0.75");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("Cube", [`side_length=${sideLength}`, `fill_opacity=${fillOpacity}`, `fill_color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });
};
