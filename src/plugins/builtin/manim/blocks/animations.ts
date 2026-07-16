import type { PluginContext } from "../../../api/types";
import { registerAnimatePropertyBlocks } from "./animate_property_animations";
import { registerCreationAnimationBlocks } from "./creation_animations";
import { registerFadeAnimationBlocks } from "./fade_animations";
import { registerGrowAnimationBlocks } from "./grow_animations";
import { registerIndicationAnimationBlocks } from "./indication_animations";
import { registerTransformAnimationBlocks } from "./transform_animations";

export const registerAnimationBlocks = (context: PluginContext) => {
  registerCreationAnimationBlocks(context);
  registerFadeAnimationBlocks(context);
  registerTransformAnimationBlocks(context);
  registerAnimatePropertyBlocks(context);
  registerGrowAnimationBlocks(context);
  registerIndicationAnimationBlocks(context);
};
