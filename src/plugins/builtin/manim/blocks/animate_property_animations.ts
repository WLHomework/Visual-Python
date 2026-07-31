import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { animateMethodDefaults, animateMethodOptions, colour } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerAnimatePropertyBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_animate_method",
    message0: "属性动画 对象 %1 操作 %2 参数 %3",
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
    message0: "移动动画 对象 %1 方向 %2 时间 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "VECTOR", check: ["ManimVector", "Number"] },
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
    message0: "缩放动画 对象 %1 倍数 %2 时间 %3",
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
    message0: "旋转动画 对象 %1 角度 %2 时间 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "ANGLE", check: ["ManimAngle", "Number"] },
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
    message0: "移动到指定点 对象 %1 目标点 %2 时间 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "POINT", check: ["ManimVector", "Number"] },
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

  context.registerBlock({
    type: "visual_python_manim_animate_set_color",
    message0: "颜色动画 对象 %1 变为 %2 时间 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "field_manim_color", name: "COLOR", value: "BLUE" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
    tooltip: "让对象平滑过渡到指定颜色。",
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()", Order.MEMBER);
    const color = String(block.getFieldValue("COLOR") || "BLUE");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`${target}.animate(run_time=${runTime}).set_color(${color})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_animate_set_color_gradient",
    message0: "渐变颜色动画 对象 %1 从 %2 到 %3 时间 %4",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "field_manim_color", name: "START_COLOR", value: "RED" },
      { type: "field_manim_color", name: "END_COLOR", value: "BLUE" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
    tooltip: "让对象平滑过渡到由两种颜色组成的渐变。",
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()", Order.MEMBER);
    const start = String(block.getFieldValue("START_COLOR") || "RED");
    const end = String(block.getFieldValue("END_COLOR") || "BLUE");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`${target}.animate(run_time=${runTime}).set_color([${start}, ${end}])`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_animate_set_color_blend",
    message0: "混合颜色动画 对象 %1 从 %2 到 %3 比例 %4 时间 %5",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "field_manim_color", name: "START_COLOR", value: "RED" },
      { type: "field_manim_color", name: "END_COLOR", value: "BLUE" },
      { type: "input_value", name: "RATIO", check: "Number" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
    tooltip: "让对象平滑过渡到两种颜色按指定比例混合后的颜色。",
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()", Order.MEMBER);
    const start = String(block.getFieldValue("START_COLOR") || "RED");
    const end = String(block.getFieldValue("END_COLOR") || "BLUE");
    const ratio = value(generator, block, "RATIO", "0.5");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`${target}.animate(run_time=${runTime}).set_color(interpolate_color(${start}, ${end}, ${ratio}))`, Order.FUNCTION_CALL];
  });
};
