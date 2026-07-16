import * as Blockly from "blockly/core";
import { growAnimationArgumentDefaults } from "../constants";

export const registerGrowAnimationDefaultExtension = () => {
  const extensionName = "visual_python_manim_grow_animation_defaults";
  if (Blockly.Extensions.isRegistered(extensionName)) return;
  Blockly.Extensions.register(extensionName, function (this: Blockly.Block) {
    const animationField = this.getField("ANIMATION");
    const argumentField = this.getField("ARG");
    if (!animationField || !argumentField) return;
    let previousDefault = growAnimationArgumentDefaults[String(this.getFieldValue("ANIMATION"))] ?? "";
    animationField.setValidator((newValue) => {
      const nextDefault = growAnimationArgumentDefaults[String(newValue)] ?? "";
      const currentArgument = String(argumentField.getValue() ?? "").trim();
      if (!currentArgument || currentArgument === previousDefault) argumentField.setValue(nextDefault);
      previousDefault = nextDefault;
      return newValue;
    });
  });
};
