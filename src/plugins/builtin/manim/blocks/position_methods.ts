import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerPositionMethodBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_move_to",
    message0: "对象 %1 移动到 %2",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "POINT" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`${value(generator, block, "MOBJECT", "Circle()", Order.MEMBER)}.move_to(${value(generator, block, "POINT", "ORIGIN")})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_shift",
    message0: "对象 %1 相对移动 %2",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "VECTOR" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`${value(generator, block, "MOBJECT", "Circle()", Order.MEMBER)}.shift(${value(generator, block, "VECTOR", "RIGHT")})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_scale",
    message0: "对象 %1 缩放 %2",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "FACTOR", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`${value(generator, block, "MOBJECT", "Circle()", Order.MEMBER)}.scale(${value(generator, block, "FACTOR", "1")})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_rotate",
    message0: "对象 %1 旋转角度 %2",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "ANGLE" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [`${value(generator, block, "MOBJECT", "Circle()", Order.MEMBER)}.rotate(${value(generator, block, "ANGLE", "PI / 2")})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_to_edge",
    message0: "对象 %1 移到边缘 %2 间距 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "DIRECTION" },
      { type: "input_value", name: "BUFF", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const direction = value(generator, block, "DIRECTION", "UP");
    const buff = value(generator, block, "BUFF", "0.5");
    return [`${value(generator, block, "MOBJECT", "Circle()", Order.MEMBER)}.to_edge(${direction}, buff=${buff})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_to_corner",
    message0: "对象 %1 移到角落 %2 间距 %3",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "DIRECTION" },
      { type: "input_value", name: "BUFF", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const direction = value(generator, block, "DIRECTION", "UR");
    const buff = value(generator, block, "BUFF", "0.5");
    return [`${value(generator, block, "MOBJECT", "Circle()", Order.MEMBER)}.to_corner(${direction}, buff=${buff})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_next_to",
    message0: "对象 %1 放在 %2 的 %3 间距 %4",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "TARGET", check: "ManimObject" },
      { type: "input_value", name: "DIRECTION" },
      { type: "input_value", name: "BUFF", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "TARGET", "Text('target')");
    const direction = value(generator, block, "DIRECTION", "RIGHT");
    const buff = value(generator, block, "BUFF", "0.25");
    const mobject = value(generator, block, "MOBJECT", "Circle()", Order.MEMBER);
    return [pythonCall(`${mobject}.next_to`, [target, direction, `buff=${buff}`], { multiline: true }), Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_arrange",
    message0: "群组 %1 沿 %2 排列 间距 %3 居中 %4",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "input_value", name: "DIRECTION" },
      { type: "input_value", name: "BUFF", check: "Number" },
      { type: "field_checkbox", name: "CENTER", checked: true },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const group = value(generator, block, "MOBJECT", "VGroup()", Order.MEMBER);
    const direction = value(generator, block, "DIRECTION", "RIGHT");
    const buff = value(generator, block, "BUFF", "0.5");
    const center = block.getFieldValue("CENTER") === "TRUE" ? "True" : "False";
    return [pythonCall(`${group}.arrange`, [direction, `buff=${buff}`, `center=${center}`], { multiline: true }), Order.FUNCTION_CALL];
  });
};
