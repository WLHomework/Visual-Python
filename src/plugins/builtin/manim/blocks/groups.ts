import type { PluginContext } from "../../../api/types";
import { registerGroupObjectBlocks } from "./group_objects";
import { registerObjectAssignmentBlocks } from "./object_assignments";

export const registerGroupBlocks = (context: PluginContext) => {
  registerGroupObjectBlocks(context);
  registerObjectAssignmentBlocks(context);
};
