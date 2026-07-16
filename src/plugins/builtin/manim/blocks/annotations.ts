import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, colorOptions } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerAnnotationBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_brace",
    message0: "大括号 Brace 目标 %1 方向 %2",
    args0: [
      { type: "input_value", name: "TARGET", check: "ManimObject" },
      { type: "input_value", name: "DIRECTION" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "TARGET", "Rectangle()");
    const direction = value(generator, block, "DIRECTION", "DOWN");
    return [`Brace(${target}, ${direction})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_brace_label",
    message0: "大括号标注 BraceLabel 目标 %1 文本 %2 方向 %3",
    args0: [
      { type: "input_value", name: "TARGET", check: "ManimObject" },
      { type: "input_value", name: "LABEL", check: "String" },
      { type: "input_value", name: "DIRECTION" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "TARGET", "Rectangle()");
    const label = value(generator, block, "LABEL", "'label'");
    const direction = value(generator, block, "DIRECTION", "DOWN");
    return [`BraceLabel(${target}, ${label}, brace_direction=${direction})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_surrounding_rectangle",
    message0: "环绕矩形 目标 %1 间距 %2 颜色 %3",
    args0: [
      { type: "input_value", name: "TARGET", check: "ManimObject" },
      { type: "input_value", name: "BUFF", check: "Number" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "TARGET", "Text('target')");
    const buff = value(generator, block, "BUFF", "0.1");
    const color = String(block.getFieldValue("COLOR") || "YELLOW");
    return [`SurroundingRectangle(${target}, buff=${buff}, color=${color})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_angle",
    message0: "角度标注 Angle 线1 %1 线2 %2 半径 %3 颜色 %4",
    args0: [
      { type: "input_value", name: "LINE1", check: "ManimObject" },
      { type: "input_value", name: "LINE2", check: "ManimObject" },
      { type: "input_value", name: "RADIUS", check: "Number" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const line1 = value(generator, block, "LINE1", "Line(ORIGIN, RIGHT)");
    const line2 = value(generator, block, "LINE2", "Line(ORIGIN, UP)");
    const radius = value(generator, block, "RADIUS", "0.5");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [`Angle(${line1}, ${line2}, radius=${radius}, color=${color})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_right_angle",
    message0: "直角标注 RightAngle 线1 %1 线2 %2 长度 %3 颜色 %4",
    args0: [
      { type: "input_value", name: "LINE1", check: "ManimObject" },
      { type: "input_value", name: "LINE2", check: "ManimObject" },
      { type: "input_value", name: "LENGTH", check: "Number" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const line1 = value(generator, block, "LINE1", "Line(ORIGIN, RIGHT)");
    const line2 = value(generator, block, "LINE2", "Line(ORIGIN, UP)");
    const length = value(generator, block, "LENGTH", "0.25");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [`RightAngle(${line1}, ${line2}, length=${length}, color=${color})`, Order.FUNCTION_CALL];
  });
};
