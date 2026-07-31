import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerArcShapeBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_arc_object",
    message0: "圆弧 半径 %1 角度 %2 颜色 %3",
    args0: [
      { type: "input_value", name: "RADIUS", check: "Number" },
      { type: "input_value", name: "ANGLE", check: ["ManimAngle", "Number"] },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const radius = value(generator, block, "RADIUS", "1");
    const angle = value(generator, block, "ANGLE", "PI / 2");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("Arc", [`radius=${radius}`, `angle=${angle}`, `color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_sector_object",
    message0: "扇形 外半径 %1 角度 %2 颜色 %3",
    args0: [
      { type: "input_value", name: "OUTER_RADIUS", check: "Number" },
      { type: "input_value", name: "ANGLE", check: ["ManimAngle", "Number"] },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const outerRadius = value(generator, block, "OUTER_RADIUS", "1");
    const angle = value(generator, block, "ANGLE", "PI / 2");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("Sector", [`radius=${outerRadius}`, `angle=${angle}`, `color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_annulus_object",
    message0: "圆环 内半径 %1 外半径 %2 颜色 %3",
    args0: [
      { type: "input_value", name: "INNER_RADIUS", check: "Number" },
      { type: "input_value", name: "OUTER_RADIUS", check: "Number" },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const innerRadius = value(generator, block, "INNER_RADIUS", "0.5");
    const outerRadius = value(generator, block, "OUTER_RADIUS", "1");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("Annulus", [`inner_radius=${innerRadius}`, `outer_radius=${outerRadius}`, `color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });
};
