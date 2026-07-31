import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerSpecialGrowAnimationBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_spin_in_from_nothing_animation",
    message0: "旋转出现 对象 %1 角度 %2 时间 %3",
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
    const target = value(generator, block, "MOBJECT", "Circle()");
    const angle = value(generator, block, "ANGLE", "PI / 2");
    const runTime = value(generator, block, "RUN_TIME", "1");
    return [`SpinInFromNothing(${target}, angle=${angle}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_shrink_to_center_animation",
    message0: "缩小到中心 对象 %1 时间 %2",
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
    return [`ShrinkToCenter(${target}, run_time=${runTime})`, Order.FUNCTION_CALL];
  });
};
