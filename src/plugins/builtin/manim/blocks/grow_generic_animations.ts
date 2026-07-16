import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, growAnimationArgumentDefaults, growAnimationOptions } from "../constants";
import { addManimImport, joinArguments, value } from "../helpers";
import { registerGrowAnimationDefaultExtension } from "./grow_animation_extension";

export const registerGenericGrowAnimationBlocks = (context: PluginContext) => {
  registerGrowAnimationDefaultExtension();

  context.registerBlock({
    type: "visual_python_manim_grow_animation",
    message0: "生长/缩小动画 %1 对象 %2 参数 %3",
    args0: [
      { type: "field_dropdown", name: "ANIMATION", options: growAnimationOptions },
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "field_input", name: "ARG", text: growAnimationArgumentDefaults.GrowFromCenter },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
    extensions: ["visual_python_manim_grow_animation_defaults"],
  }, (block, generator) => {
    addManimImport(generator);
    const animation = String(block.getFieldValue("ANIMATION") || "GrowFromCenter");
    const target = value(generator, block, "MOBJECT", "Circle()");
    const argument = String(block.getFieldValue("ARG") || growAnimationArgumentDefaults[animation] || "").trim();
    return [`${animation}(${joinArguments(target, argument)})`, Order.FUNCTION_CALL];
  });
};
