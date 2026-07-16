import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, colorOptions } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerStyleMethodBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_set_color",
    message0: "对象 %1 设置颜色 %2",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`${value(generator, block, "MOBJECT", "Circle()", Order.MEMBER)}.set_color(${block.getFieldValue("COLOR") || "WHITE"})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_set_opacity",
    message0: "对象 %1 设置透明度 %2",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "OPACITY", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`${value(generator, block, "MOBJECT", "Circle()", Order.MEMBER)}.set_opacity(${value(generator, block, "OPACITY", "0.5")})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_set_fill",
    message0: "对象 %1 设置填充 颜色 %2 透明度 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
      { type: "input_value", name: "OPACITY", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    const opacity = value(generator, block, "OPACITY", "1");
    const target = value(generator, block, "MOBJECT", "Circle()", Order.MEMBER);
    return [pythonCall(`${target}.set_fill`, [`color=${color}`, `opacity=${opacity}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_set_stroke",
    message0: "对象 %1 设置描边 颜色 %2 线宽 %3 透明度 %4",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
      { type: "input_value", name: "WIDTH", check: "Number" },
      { type: "input_value", name: "OPACITY", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    const width = value(generator, block, "WIDTH", "2");
    const opacity = value(generator, block, "OPACITY", "1");
    const target = value(generator, block, "MOBJECT", "Circle()", Order.MEMBER);
    return [pythonCall(`${target}.set_stroke`, [`color=${color}`, `width=${width}`, `opacity=${opacity}`], { multiline: true }), Order.FUNCTION_CALL];
  });
};
