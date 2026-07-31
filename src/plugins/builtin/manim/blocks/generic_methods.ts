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
      { type: "field_dropdown", name: "METHOD", options: [["缩放", "scale"], ["相对移动", "shift"], ["移动到", "move_to"], ["移动到边缘", "to_edge"]] },
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

  context.registerBlock({
    type: "visual_python_manim_apply_matrix",
    message0: "对象 %1 应用矩阵 %2",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "MATRIX" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "MOBJECT", "NumberPlane()", Order.MEMBER);
    const matrix = value(generator, block, "MATRIX", "[[1, 0], [0, 1]]");
    return [`${target}.apply_matrix(${matrix})`, Order.FUNCTION_CALL];
  });
};
