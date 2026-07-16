import type { PluginContext } from "../../../api/types";
import { registerGenericIndicationAnimationBlocks } from "./indication_generic_animations";
import { registerHighlightAnimationBlocks } from "./highlight_animations";
import { registerWaveFlashAnimationBlocks } from "./wave_flash_animations";

export const registerIndicationAnimationBlocks = (context: PluginContext) => {
  registerGenericIndicationAnimationBlocks(context);
  registerHighlightAnimationBlocks(context);
  registerWaveFlashAnimationBlocks(context);
};
