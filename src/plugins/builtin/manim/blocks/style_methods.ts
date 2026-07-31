import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerStyleMethodBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_set_color",
    message0: "对象 %1 设置颜色 %2",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "field_manim_color", name: "COLOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`${value(generator, block, "MOBJECT", "Circle()", Order.MEMBER)}.set_color(${block.getFieldValue("COLOR") || "WHITE"})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_set_color_gradient",
    message0: "对象 %1 设置双色渐变 从 %2 到 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "field_manim_color", name: "START_COLOR" },
      { type: "field_manim_color", name: "END_COLOR", value: "BLUE" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
    tooltip: "让对象的颜色从起始色平滑过渡到结束色。",
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()", Order.MEMBER);
    const start = String(block.getFieldValue("START_COLOR") || "WHITE");
    const end = String(block.getFieldValue("END_COLOR") || "BLUE");
    return [`${target}.set_color([${start}, ${end}])`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_set_color_gradient_three",
    message0: "对象 %1 设置三色渐变 从 %2 经过 %3 到 %4",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "field_manim_color", name: "START_COLOR", value: "RED" },
      { type: "field_manim_color", name: "MIDDLE_COLOR", value: "YELLOW" },
      { type: "field_manim_color", name: "END_COLOR", value: "BLUE" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
    tooltip: "让对象依次经过三种颜色，形成更丰富的渐变。",
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()", Order.MEMBER);
    const start = String(block.getFieldValue("START_COLOR") || "RED");
    const middle = String(block.getFieldValue("MIDDLE_COLOR") || "YELLOW");
    const end = String(block.getFieldValue("END_COLOR") || "BLUE");
    return [`${target}.set_color([${start}, ${middle}, ${end}])`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_set_color_blend",
    message0: "对象 %1 设置混合颜色 从 %2 到 %3 比例 %4",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "field_manim_color", name: "START_COLOR", value: "RED" },
      { type: "field_manim_color", name: "END_COLOR", value: "BLUE" },
      { type: "input_value", name: "RATIO", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
    tooltip: "按比例混合两种颜色。零表示起始色，一表示结束色。",
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()", Order.MEMBER);
    const start = String(block.getFieldValue("START_COLOR") || "RED");
    const end = String(block.getFieldValue("END_COLOR") || "BLUE");
    const ratio = value(generator, block, "RATIO", "0.5");
    return [`${target}.set_color(interpolate_color(${start}, ${end}, ${ratio}))`, Order.FUNCTION_CALL];
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
      { type: "field_manim_color", name: "COLOR" },
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
      { type: "field_manim_color", name: "COLOR" },
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
