import * as Blockly from "blockly/core";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { suite, value } from "../helpers";
import { createVoiceoverEndMarker, createVoiceoverMarker } from "../voiceoverMarkers";
import { voiceoverRoleOptions } from "../voiceoverRoles";

export const registerVoiceoverBlocks = (context: PluginContext) => {
  const roleDropdownExtension = "visual_python_manim_voiceover_role_dropdown";
  if (!Blockly.Extensions.isRegistered(roleDropdownExtension)) {
    Blockly.Extensions.register(roleDropdownExtension, function (this: Blockly.Block) {
      const field = this.getField("ROLE");
      if (field instanceof Blockly.FieldDropdown) field.setOptions(() => voiceoverRoleOptions());
    });
  }

  const staticText = (block: any) => {
    const target = block.getInputTargetBlock("TEXT");
    return target?.type === "text" ? String(target.getFieldValue("TEXT") ?? "") : undefined;
  };

  context.registerBlock({
    type: "visual_python_manim_voiceover",
    message0: "播放配音 %1 角色 %2",
    args0: [{ type: "input_value", name: "TEXT", check: "String" }, { type: "field_dropdown", name: "ROLE", options: voiceoverRoleOptions() }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
    extensions: [roleDropdownExtension],
  }, (block, generator) => {
    const textExpression = value(generator, block, "TEXT", "''");
    return `${createVoiceoverMarker("cue", textExpression, staticText(block), String(block.getFieldValue("ROLE") || "default"), block.id)}\n`;
  });

  context.registerBlock({
    type: "visual_python_manim_voiceover_with_animation",
    message0: "播放配音 %1 角色 %2 同时执行 %3 %4",
    args0: [
      { type: "input_value", name: "TEXT", check: "String" },
      { type: "field_dropdown", name: "ROLE", options: voiceoverRoleOptions() },
      { type: "input_dummy" },
      { type: "input_statement", name: "BODY" },
    ],
    inputsInline: false,
    previousStatement: null,
    nextStatement: null,
    colour,
    extensions: [roleDropdownExtension],
  }, (block, generator) => {
    const textExpression = value(generator, block, "TEXT", "''");
    const body = suite(generator, block, "BODY").replace(new RegExp(`^${generator.INDENT}`), "").replace(new RegExp(`\\n${generator.INDENT}`, "g"), "\n");
    return `${createVoiceoverMarker("begin", textExpression, staticText(block), String(block.getFieldValue("ROLE") || "default"), block.id)}\n${body}${createVoiceoverEndMarker()}\n`;
  });
};
