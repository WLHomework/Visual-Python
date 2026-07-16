import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour, indicationAnimationOptions } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerGenericIndicationAnimationBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_indication_animation",
    message0: "强调动画 %1 对象 %2",
    args0: [
      { type: "field_dropdown", name: "ANIMATION", options: indicationAnimationOptions },
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const animation = String(block.getFieldValue("ANIMATION") || "Indicate");
    return [`${animation}(${value(generator, block, "MOBJECT", "Circle()")})`, Order.FUNCTION_CALL];
  });
};
