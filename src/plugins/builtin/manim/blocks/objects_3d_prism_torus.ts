import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, colorOptions } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerPrismTorusBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_prism_object",
    message0: "棱柱 Prism 尺寸 %1 不透明度 %2 颜色 %3",
    args0: [
      { type: "input_value", name: "DIMENSIONS" },
      { type: "input_value", name: "FILL_OPACITY", check: "Number" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const dimensions = value(generator, block, "DIMENSIONS", "[3, 2, 1]");
    const fillOpacity = value(generator, block, "FILL_OPACITY", "0.75");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("Prism", [`dimensions=${dimensions}`, `fill_opacity=${fillOpacity}`, `fill_color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_torus_object",
    message0: "圆环面 Torus 主半径 %1 管半径 %2 不透明度 %3 颜色 %4",
    args0: [
      { type: "input_value", name: "MAJOR_RADIUS", check: "Number" },
      { type: "input_value", name: "MINOR_RADIUS", check: "Number" },
      { type: "input_value", name: "FILL_OPACITY", check: "Number" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const majorRadius = value(generator, block, "MAJOR_RADIUS", "3");
    const minorRadius = value(generator, block, "MINOR_RADIUS", "1");
    const fillOpacity = value(generator, block, "FILL_OPACITY", "0.75");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("Torus", [`major_radius=${majorRadius}`, `minor_radius=${minorRadius}`, `fill_opacity=${fillOpacity}`, `fill_color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });
};
