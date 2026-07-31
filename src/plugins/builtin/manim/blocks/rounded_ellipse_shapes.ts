import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerRoundedEllipseShapeBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_rounded_rectangle_object",
    message0: "圆角矩形 宽 %1 高 %2 圆角 %3 颜色 %4",
    args0: [
      { type: "input_value", name: "WIDTH", check: "Number" },
      { type: "input_value", name: "HEIGHT", check: "Number" },
      { type: "input_value", name: "CORNER_RADIUS", check: "Number" },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const width = value(generator, block, "WIDTH", "3");
    const height = value(generator, block, "HEIGHT", "2");
    const cornerRadius = value(generator, block, "CORNER_RADIUS", "0.2");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("RoundedRectangle", [`width=${width}`, `height=${height}`, `corner_radius=${cornerRadius}`, `color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_ellipse_object",
    message0: "椭圆 宽 %1 高 %2 颜色 %3",
    args0: [
      { type: "input_value", name: "WIDTH", check: "Number" },
      { type: "input_value", name: "HEIGHT", check: "Number" },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const width = value(generator, block, "WIDTH", "3");
    const height = value(generator, block, "HEIGHT", "2");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [`Ellipse(width=${width}, height=${height}, color=${color})`, Order.FUNCTION_CALL];
  });
};
