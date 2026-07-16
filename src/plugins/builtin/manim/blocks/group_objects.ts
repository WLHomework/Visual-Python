import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerGroupObjectBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_group_object",
    message0: "组合对象 VGroup %1 和 %2",
    args0: [
      { type: "input_value", name: "FIRST", check: "ManimObject" },
      { type: "input_value", name: "SECOND", check: "ManimObject" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const first = value(generator, block, "FIRST", "Text('A')");
    const second = value(generator, block, "SECOND", "Text('B')");
    return [`VGroup(${first}, ${second})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_group_from_list_object",
    message0: "组合对象 VGroup 对象列表 %1",
    args0: [
      { type: "input_value", name: "OBJECTS" },
    ],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const objects = value(generator, block, "OBJECTS", "[Text('A'), Text('B')]");
    return [`VGroup(*${objects})`, Order.FUNCTION_CALL];
  });
};
