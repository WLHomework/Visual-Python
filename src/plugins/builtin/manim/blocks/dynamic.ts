import type { PluginContext } from "../../../api/types";
import { registerTrackerAnimationBlocks } from "./tracker_animations";
import { registerTrackerValueBlocks } from "./tracker_values";
import { registerUpdaterBlocks } from "./updaters";

export const registerDynamicBlocks = (context: PluginContext) => {
  registerTrackerValueBlocks(context);
  registerUpdaterBlocks(context);
  registerTrackerAnimationBlocks(context);
};
