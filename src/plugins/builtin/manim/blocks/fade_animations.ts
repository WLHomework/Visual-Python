import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, fadeAnimationOptions } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerFadeAnimationBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_fade_animation",
    message0: "淡入淡出动画 %1 对象 %2",
    args0: [
      { type: "field_dropdown", name: "ANIMATION", options: fadeAnimationOptions },
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const animation = String(block.getFieldValue("ANIMATION") || "FadeIn");
    return [`${animation}(${value(generator, block, "MOBJECT", "Circle()")})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_fade_in_animation",
    message0: "淡入 FadeIn 对象 %1 方向 %2 缩放 %3 时间 %4",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "SHIFT" },
      { type: "input_value", name: "SCALE", check: "Number" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()");
    const shift = value(generator, block, "SHIFT", "ORIGIN");
    const scale = value(generator, block, "SCALE", "1");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`FadeIn(${target}, shift=${shift}, scale=${scale}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_fade_out_animation",
    message0: "淡出 FadeOut 对象 %1 方向 %2 缩放 %3 时间 %4",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "SHIFT" },
      { type: "input_value", name: "SCALE", check: "Number" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()");
    const shift = value(generator, block, "SHIFT", "ORIGIN");
    const scale = value(generator, block, "SCALE", "1");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`FadeOut(${target}, shift=${shift}, scale=${scale}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });
};
