import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerWaveFlashAnimationBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_wiggle_animation",
    message0: "摆动 Wiggle 对象 %1 缩放 %2 旋转角度 %3 摆动次数 %4 时间 %5",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "SCALE_VALUE", check: "Number" },
      { type: "input_value", name: "ROTATION_ANGLE" },
      { type: "input_value", name: "N_WIGGLES", check: "Number" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()");
    const scaleValue = value(generator, block, "SCALE_VALUE", "1.1");
    const rotationAngle = value(generator, block, "ROTATION_ANGLE", "0.01 * TAU");
    const nWiggles = value(generator, block, "N_WIGGLES", "6");
    const runTime = value(generator, block, "RUN_TIME", "2");
    return [`Wiggle(${target}, scale_value=${scaleValue}, rotation_angle=${rotationAngle}, n_wiggles=${nWiggles}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_apply_wave_animation",
    message0: "波浪 ApplyWave 对象 %1 方向 %2 振幅 %3 波纹数 %4 时间 %5",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "DIRECTION" },
      { type: "input_value", name: "AMPLITUDE", check: "Number" },
      { type: "input_value", name: "RIPPLES", check: "Number" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()");
    const direction = value(generator, block, "DIRECTION", "UP");
    const amplitude = value(generator, block, "AMPLITUDE", "0.2");
    const ripples = value(generator, block, "RIPPLES", "1");
    const runTime = value(generator, block, "RUN_TIME", "2");
    return [`ApplyWave(${target}, direction=${direction}, amplitude=${amplitude}, ripples=${ripples}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_show_passing_flash_animation",
    message0: "流光 ShowPassingFlash 对象 %1 光宽 %2 时间 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "TIME_WIDTH", check: "Number" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "Circle()");
    const timeWidth = value(generator, block, "TIME_WIDTH", "0.1");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`ShowPassingFlash(${target}, time_width=${timeWidth}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });
};
