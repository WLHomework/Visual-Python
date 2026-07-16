import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerGenericMethodBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_transform_method",
    message0: "对象 %1 调用 %2 参数 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "field_dropdown", name: "METHOD", options: [["scale", "scale"], ["shift", "shift"], ["move_to", "move_to"], ["to_edge", "to_edge"]] },
      { type: "input_value", name: "ARG" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const method = String(block.getFieldValue("METHOD") || "scale");
    const fallback = method === "scale" ? "1" : method === "shift" ? "RIGHT" : method === "to_edge" ? "UP" : "ORIGIN";
    return [`${value(generator, block, "MOBJECT", "Circle()", Order.MEMBER)}.${method}(${value(generator, block, "ARG", fallback)})`, Order.FUNCTION_CALL];
  });
};
