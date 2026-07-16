import type { PluginContext } from "../../../api/types";
import { registerGenericGrowAnimationBlocks } from "./grow_generic_animations";
import { registerGrowFromAnimationBlocks } from "./grow_from_animations";
import { registerSpecialGrowAnimationBlocks } from "./grow_special_animations";

export const registerGrowAnimationBlocks = (context: PluginContext) => {
  registerGenericGrowAnimationBlocks(context);
  registerGrowFromAnimationBlocks(context);
  registerSpecialGrowAnimationBlocks(context);
};
