import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { animateMethodDefaults, animateMethodOptions, colour } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerAnimatePropertyBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_animate_method",
    message0: "属性动画 对象 %1 animate.%2 参数 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "field_dropdown", name: "METHOD", options: animateMethodOptions },
      { type: "input_value", name: "ARG" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const method = String(block.getFieldValue("METHOD") || "shift");
    const target = value(generator, block, "MOBJECT", "Circle()", Order.MEMBER);
    const argument = value(generator, block, "ARG", animateMethodDefaults[method] || "");
    return [`${target}.animate.${method}(${argument})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_animate_shift",
    message0: "动画 animate.shift 对象 %1 移动 %2 时间 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "VECTOR" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()", Order.MEMBER);
    const vector = value(generator, block, "VECTOR", "RIGHT");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`${target}.animate(run_time=${runTime}).shift(${vector})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_animate_scale",
    message0: "动画 animate.scale 对象 %1 缩放 %2 时间 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "FACTOR", check: "Number" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()", Order.MEMBER);
    const factor = value(generator, block, "FACTOR", "2");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`${target}.animate(run_time=${runTime}).scale(${factor})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_animate_rotate",
    message0: "动画 animate.rotate 对象 %1 角度 %2 时间 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "ANGLE" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()", Order.MEMBER);
    const angle = value(generator, block, "ANGLE", "PI / 2");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`${target}.animate(run_time=${runTime}).rotate(${angle})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_animate_move_to",
    message0: "动画 animate.move_to 对象 %1 目标点 %2 时间 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "POINT" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()", Order.MEMBER);
    const point = value(generator, block, "POINT", "ORIGIN");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`${target}.animate(run_time=${runTime}).move_to(${point})`, Order.FUNCTION_CALL];
  });
};
