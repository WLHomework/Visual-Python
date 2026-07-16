import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, colorOptions, textObjectOptions } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerTextObjectBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_text_object",
    message0: "文本/公式对象 %1 内容 %2",
    args0: [
      { type: "field_dropdown", name: "OBJECT", options: textObjectOptions },
      { type: "input_value", name: "CONTENT", check: "String" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const objectType = String(block.getFieldValue("OBJECT") || "Text");
    return [`${objectType}(${value(generator, block, "CONTENT", "'Hello Manim'")})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_plain_text_object",
    message0: "文本 Text 内容 %1 字号 %2 颜色 %3",
    args0: [
      { type: "input_value", name: "CONTENT", check: "String" },
      { type: "input_value", name: "FONT_SIZE", check: "Number" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const content = value(generator, block, "CONTENT", "'Hello Manim'");
    const fontSize = value(generator, block, "FONT_SIZE", "48");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("Text", [content, `font_size=${fontSize}`, `color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_tex_object",
    message0: "LaTeX 文本 Tex 内容 %1 字号 %2 颜色 %3",
    args0: [
      { type: "input_value", name: "CONTENT", check: "String" },
      { type: "input_value", name: "FONT_SIZE", check: "Number" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const content = value(generator, block, "CONTENT", "'Hello Manim'");
    const fontSize = value(generator, block, "FONT_SIZE", "48");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("Tex", [content, `font_size=${fontSize}`, `color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_mathtex_object",
    message0: "数学公式 MathTex 内容 %1 字号 %2 颜色 %3",
    args0: [
      { type: "input_value", name: "CONTENT", check: "String" },
      { type: "input_value", name: "FONT_SIZE", check: "Number" },
      { type: "field_dropdown", name: "COLOR", options: colorOptions },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const content = value(generator, block, "CONTENT", "'x^2 + y^2 = z^2'");
    const fontSize = value(generator, block, "FONT_SIZE", "48");
    const color = String(block.getFieldValue("COLOR") || "WHITE");
    return [pythonCall("MathTex", [content, `font_size=${fontSize}`, `color=${color}`], { multiline: true }), Order.FUNCTION_CALL];
  });
};
