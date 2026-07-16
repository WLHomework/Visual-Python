import type { PluginContext } from "../../../api/types";
import { registerCoordinateObjectBlocks } from "./coordinate_objects";
import { registerCurveObjectBlocks } from "./curves";
import { registerLineObjectBlocks } from "./lines";
import { registerPolygonObjectBlocks } from "./polygons";
import { registerShapeObjectBlocks } from "./shapes";
import { registerTextObjectBlocks } from "./text";

export const registerBasicObjectBlocks = (context: PluginContext) => {
  registerTextObjectBlocks(context);
  registerShapeObjectBlocks(context);
  registerPolygonObjectBlocks(context);
  registerCurveObjectBlocks(context);
  registerLineObjectBlocks(context);
  registerCoordinateObjectBlocks(context);
};
