import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerSceneObjectBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_add",
    message0: "添加对象 %1",
    args0: [{ type: "input_value", name: "MOBJECT", check: "ManimObject" }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return `self.add(${value(generator, block, "MOBJECT", "Text('Hello Manim')")})\n`;
  });

  context.registerBlock({
    type: "visual_python_manim_add_two",
    message0: "添加对象 %1 和 %2",
    args0: [
      { type: "input_value", name: "FIRST", check: "ManimObject" },
      { type: "input_value", name: "SECOND", check: "ManimObject" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const first = value(generator, block, "FIRST", "Text('A')");
    const second = value(generator, block, "SECOND", "Text('B')");
    return `${pythonCall("self.add", [first, second], { multiline: true, indent: generator.INDENT })}\n`;
  });

  context.registerBlock({
    type: "visual_python_manim_remove",
    message0: "移除对象 %1",
    args0: [{ type: "input_value", name: "MOBJECT", check: "ManimObject" }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return `self.remove(${value(generator, block, "MOBJECT", "Text('Hello Manim')")})\n`;
  });

  context.registerBlock({
    type: "visual_python_manim_remove_two",
    message0: "移除对象 %1 和 %2",
    args0: [
      { type: "input_value", name: "FIRST", check: "ManimObject" },
      { type: "input_value", name: "SECOND", check: "ManimObject" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const first = value(generator, block, "FIRST", "Text('A')");
    const second = value(generator, block, "SECOND", "Text('B')");
    return `${pythonCall("self.remove", [first, second], { multiline: true, indent: generator.INDENT })}\n`;
  });

  context.registerBlock({
    type: "visual_python_manim_clear",
    message0: "清空场景",
    previousStatement: null,
    nextStatement: null,
    colour,
  }, (_block, generator) => {
    addManimImport(generator);
    return "self.clear()\n";
  });
};
