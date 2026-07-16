import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerTrackerAnimationBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_tracker_set_value_animation",
    message0: "追踪器动画 %1 设置值为 %2",
    args0: [
      { type: "input_value", name: "TRACKER", check: "ManimObject" },
      { type: "input_value", name: "VALUE", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const tracker = value(generator, block, "TRACKER", "ValueTracker(0)", Order.MEMBER);
    return [`${tracker}.animate.set_value(${value(generator, block, "VALUE", "1")})`, Order.FUNCTION_CALL];
  });
};
