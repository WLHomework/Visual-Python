import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, transformAnimationOptions } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerTransformAnimationBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_transform_animation",
    message0: "变换动画 %1 从 %2 到 %3",
    args0: [
      { type: "field_dropdown", name: "ANIMATION", options: transformAnimationOptions },
      { type: "input_value", name: "SOURCE", check: "ManimObject" },
      { type: "input_value", name: "TARGET", check: "ManimObject" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const animation = String(block.getFieldValue("ANIMATION") || "Transform");
    const source = value(generator, block, "SOURCE", "Circle()");
    const target = value(generator, block, "TARGET", "Square()");
    return [`${animation}(${source}, ${target})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_transform_to_animation",
    message0: "变形 从 %1 到 %2 时间 %3",
    args0: [
      { type: "input_value", name: "SOURCE", check: "ManimObject" },
      { type: "input_value", name: "TARGET", check: "ManimObject" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const source = value(generator, block, "SOURCE", "Circle()");
    const target = value(generator, block, "TARGET", "Square()");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`Transform(${source}, ${target}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_replacement_transform_animation",
    message0: "替换变形 从 %1 到 %2 时间 %3",
    args0: [
      { type: "input_value", name: "SOURCE", check: "ManimObject" },
      { type: "input_value", name: "TARGET", check: "ManimObject" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const source = value(generator, block, "SOURCE", "Circle()");
    const target = value(generator, block, "TARGET", "Square()");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`ReplacementTransform(${source}, ${target}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_transform_from_copy_animation",
    message0: "复制后变形 从 %1 到 %2 时间 %3",
    args0: [
      { type: "input_value", name: "SOURCE", check: "ManimObject" },
      { type: "input_value", name: "TARGET", check: "ManimObject" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const source = value(generator, block, "SOURCE", "Circle()");
    const target = value(generator, block, "TARGET", "Square()");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`TransformFromCopy(${source}, ${target}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_fade_transform_animation",
    message0: "淡化变形 从 %1 到 %2 时间 %3",
    args0: [
      { type: "input_value", name: "SOURCE", check: "ManimObject" },
      { type: "input_value", name: "TARGET", check: "ManimObject" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const source = value(generator, block, "SOURCE", "Circle()");
    const target = value(generator, block, "TARGET", "Square()");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`FadeTransform(${source}, ${target}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });
};
