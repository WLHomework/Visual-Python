import * as Blockly from "blockly/core";
import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { suite, value } from "../helpers";
import { createVoiceoverEndMarker, createVoiceoverMarker } from "../voiceoverMarkers";
import { previewVoiceoverBlock } from "../voiceoverBlockPreview";
import { voiceoverRoleOptions } from "../voiceoverRoles";

const previewAudioIcon = `data:image/svg+xml,${encodeURIComponent([
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M11 5 6 9H2v6h4l5 4Z"/>',
  '<path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
  '<path d="M18 6a8 8 0 0 1 0 12"/>',
  '</svg>',
].join(""))}`;

export const registerVoiceoverBlocks = (context: PluginContext) => {
  const roleDropdownExtension = "visual_python_manim_voiceover_role_dropdown";
  if (!Blockly.Extensions.isRegistered(roleDropdownExtension)) {
    Blockly.Extensions.register(roleDropdownExtension, function (this: Blockly.Block) {
      const field = this.getField("ROLE");
      if (field instanceof Blockly.FieldDropdown) field.setOptions(() => voiceoverRoleOptions());
      this.getInput("TEXT")?.appendField(new Blockly.FieldImage(
        previewAudioIcon,
        18,
        18,
        "试听或停止此段配音",
        () => previewVoiceoverBlock(this),
      ), "VOICEOVER_PREVIEW");
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
