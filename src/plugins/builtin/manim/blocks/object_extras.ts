import type { PluginContext } from "../../../api/types";
import { registerAnnotationBlocks } from "./annotations";
import { registerCoordinateExtraBlocks } from "./coordinates";
import { registerGroupBlocks } from "./groups";
import { registerThreeDObjectBlocks } from "./objects_3d";
import { registerTableBlocks } from "./tables";

export const registerObjectExtraBlocks = (context: PluginContext) => {
  registerCoordinateExtraBlocks(context);
  registerAnnotationBlocks(context);
  registerTableBlocks(context);
  registerThreeDObjectBlocks(context);
  registerGroupBlocks(context);
};
