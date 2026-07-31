import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerThreeDArrowBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_arrow3d_object",
    message0: "三维箭头 起点 %1 终点 %2 厚度 %3 箭头高度 %4 底部半径 %5 颜色 %6",
    args0: [
      { type: "input_value", name: "START", check: ["ManimVector", "Number"] },
      { type: "input_value", name: "END", check: ["ManimVector", "Number"] },
      { type: "input_value", name: "THICKNESS", check: "Number" },
      { type: "input_value", name: "HEIGHT", check: "Number" },
      { type: "input_value", name: "BASE_RADIUS", check: "Number" },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: false,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const start = value(generator, block, "START", "ORIGIN");
    const end = value(generator, block, "END", "OUT");
    const thickness = value(generator, block, "THICKNESS", "0.02");
    const height = value(generator, block, "HEIGHT", "0.3");
    const baseRadius = value(generator, block, "BASE_RADIUS", "0.08");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("Arrow3D", [start, end, `thickness=${thickness}`, `height=${height}`, `base_radius=${baseRadius}`, `color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });
};
