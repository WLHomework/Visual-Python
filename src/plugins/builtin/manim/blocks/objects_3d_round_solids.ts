import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, colorOptions } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerRoundThreeDSolidBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_cone_object",
    message0: "圆锥 Cone 底半径 %1 高度 %2 方向 %3 显示底面 %4 颜色 %5",
    args0: [
      { type: "input_value", name: "BASE_RADIUS", check: "Number" },
      { type: "input_value", name: "HEIGHT", check: "Number" },
      { type: "input_value", name: "DIRECTION" },
      { type: "field_checkbox", name: "SHOW_BASE", checked: true },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const baseRadius = value(generator, block, "BASE_RADIUS", "1");
    const height = value(generator, block, "HEIGHT", "2");
    const direction = value(generator, block, "DIRECTION", "OUT");
    const showBase = block.getFieldValue("SHOW_BASE") === "TRUE" ? "True" : "False";
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("Cone", [`base_radius=${baseRadius}`, `height=${height}`, `direction=${direction}`, `show_base=${showBase}`, `fill_color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_cylinder_object",
    message0: "圆柱 Cylinder 半径 %1 高度 %2 方向 %3 显示端面 %4 颜色 %5",
    args0: [
      { type: "input_value", name: "RADIUS", check: "Number" },
      { type: "input_value", name: "HEIGHT", check: "Number" },
      { type: "input_value", name: "DIRECTION" },
      { type: "field_checkbox", name: "SHOW_ENDS", checked: true },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const radius = value(generator, block, "RADIUS", "1");
    const height = value(generator, block, "HEIGHT", "2");
    const direction = value(generator, block, "DIRECTION", "OUT");
    const showEnds = block.getFieldValue("SHOW_ENDS") === "TRUE" ? "True" : "False";
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("Cylinder", [`radius=${radius}`, `height=${height}`, `direction=${direction}`, `show_ends=${showEnds}`, `fill_color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });
};
