import { Order } from "blockly/python";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, registerObjectReferenceBlockDefinition, safeIdentifier, value } from "../helpers";
import { registerAssignDefaultNameExtension } from "./object_assignment_names";

export const registerObjectAssignmentBlocks = (context: PluginContext) => {
  registerAssignDefaultNameExtension();

  context.registerBlock({
    type: "visual_python_manim_assign",
    message0: "创建 Manim 对象 %1 为 %2",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "field_input", name: "VAR", text: "obj" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
    extensions: ["visual_python_manim_assign_default_name"],
  }, (block, generator) => {
    addManimImport(generator);
    const name = safeIdentifier(block.getFieldValue("VAR"), "obj");
    return `${name} = ${value(generator, block, "MOBJECT", "Circle()")}\n`;
  });

  context.registerBlock({
    type: "visual_python_manim_assign_add",
    message0: "创建 Manim 对象 %1 为 %2 并添加到场景",
    args0: [
      { type: "input_value", name: "MOBJECT", check: "ManimObject" },
      { type: "field_input", name: "VAR", text: "obj" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
    extensions: ["visual_python_manim_assign_default_name"],
  }, (block, generator) => {
    addManimImport(generator);
    const name = safeIdentifier(block.getFieldValue("VAR"), "obj");
    return `${name} = ${value(generator, block, "MOBJECT", "Circle()")}\nself.add(${name})\n`;
  });

  context.registerBlock({
    type: "visual_python_manim_object_ref",
    message0: "Manim 对象 %1",
    args0: [{ type: "field_input", name: "VAR", text: "obj" }],
    inputsInline: true,
    output: "ManimObject",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return [safeIdentifier(block.getFieldValue("VAR"), "obj"), Order.ATOMIC];
  });

  registerObjectReferenceBlockDefinition();
};
