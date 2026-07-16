import type { PluginContext } from "../../../api/types";
import { registerAxesObjectBlocks } from "./axes_objects";
import { registerGenericCoordinateObjectBlocks } from "./coordinate_generic";
import { registerPlaneObjectBlocks } from "./plane_objects";

export const registerCoordinateObjectBlocks = (context: PluginContext) => {
  registerGenericCoordinateObjectBlocks(context);
  registerAxesObjectBlocks(context);
  registerPlaneObjectBlocks(context);
};
