import * as Blockly from "blockly/core";
import type { PluginContext } from "../../../api/types";
import { colour, sceneTypeOptions } from "../constants";
import { addManimImport, safeClassName, suite } from "../helpers";
import { nextUniqueManimSceneName } from "../sceneNames";

const uniqueSceneNameExtension = "visual_python_manim_scene_unique_name";

const registerUniqueSceneNameExtension = () => {
  if (Blockly.Extensions.isRegistered(uniqueSceneNameExtension)) return;
  Blockly.Extensions.register(uniqueSceneNameExtension, function (this: Blockly.Block & { renamingScene_?: boolean }) {
    this.setOnChange((event) => {
      if (this.renamingScene_ || !this.workspace) return;
      const createIds = event.type === Blockly.Events.BLOCK_CREATE ? (event as Blockly.Events.BlockCreate).ids : [];
      const isOwnCreate = createIds?.includes(this.id);
      const isOwnNameChange = event.type === Blockly.Events.BLOCK_CHANGE
        && (event as Blockly.Events.BlockChange).blockId === this.id
        && (event as Blockly.Events.BlockChange).name === "NAME";
      if (!isOwnCreate && !isOwnNameChange) return;
      const currentName = safeClassName(this.getFieldValue("NAME"), "MainScene");
      const usedNames = this.workspace.getAllBlocks(false)
        .filter((block) => block !== this && block.type === "visual_python_manim_scene")
        .map((block) => safeClassName(block.getFieldValue("NAME"), "MainScene"));
      const uniqueName = nextUniqueManimSceneName(currentName, usedNames);
      if (uniqueName === currentName && this.getFieldValue("NAME") === currentName) return;
      this.renamingScene_ = true;
      this.setFieldValue(uniqueName, "NAME");
      this.renamingScene_ = false;
    });
  });
};

export const registerSceneDefinitionBlocks = (context: PluginContext) => {
  registerUniqueSceneNameExtension();
  context.registerBlock({
    type: "visual_python_manim_scene",
    message0: "Manim 场景 %1 类型 %2 %3 %4",
    args0: [
      { type: "field_input", name: "NAME", text: "MainScene" },
      { type: "field_dropdown", name: "SCENE_TYPE", options: sceneTypeOptions },
      { type: "input_dummy" },
      { type: "input_statement", name: "BODY" },
    ],
    inputsInline: false,
    previousStatement: null,
    nextStatement: null,
    colour,
    extensions: [uniqueSceneNameExtension],
  }, (block, generator) => {
    addManimImport(generator);
    const name = safeClassName(block.getFieldValue("NAME"), "MainScene");
    const sceneType = String(block.getFieldValue("SCENE_TYPE") || "Scene");
    const body = suite(generator, block, "BODY").replace(/^/gm, generator.INDENT).trimEnd();
    return `class ${name}(${sceneType}):\n${generator.INDENT}def construct(self):\n${body}\n\n`;
  });
};
