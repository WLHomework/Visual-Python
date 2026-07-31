import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, creationAnimationOptions } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerCreationAnimationBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_create_animation",
    message0: "创建动画 %1 对象 %2",
    args0: [
      { type: "field_dropdown", name: "ANIMATION", options: creationAnimationOptions },
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const animation = String(block.getFieldValue("ANIMATION") || "Create");
    return [`${animation}(${value(generator, block, "MOBJECT", "Circle()")})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_create_object_animation",
    message0: "绘制对象 %1 时间 %2",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`Create(${target}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_write_animation",
    message0: "书写对象 %1 时间 %2",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Text('Hello')");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`Write(${target}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_uncreate_animation",
    message0: "反向绘制对象 %1 时间 %2",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`Uncreate(${target}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_unwrite_animation",
    message0: "反向书写对象 %1 时间 %2",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Text('Hello')");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`Unwrite(${target}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_draw_border_then_fill_animation",
    message0: "先描边再填充 对象 %1 时间 %2",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`DrawBorderThenFill(${target}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });
};
