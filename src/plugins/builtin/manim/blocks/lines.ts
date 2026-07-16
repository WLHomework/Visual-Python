import type { PluginContext } from "../../../api/types";
import { registerArrowObjectBlocks } from "./arrow_objects";
import { registerGenericLineBlocks } from "./line_generic";
import { registerLineSegmentBlocks } from "./line_segments";

export const registerLineObjectBlocks = (context: PluginContext) => {
  registerGenericLineBlocks(context);
  registerLineSegmentBlocks(context);
  registerArrowObjectBlocks(context);
};
