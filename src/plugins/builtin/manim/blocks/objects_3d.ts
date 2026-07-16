import type { PluginContext } from "../../../api/types";
import { registerThreeDArrowBlocks } from "./objects_3d_arrows";
import { registerGenericThreeDObjectBlocks } from "./objects_3d_generic";
import { registerThreeDSolidBlocks } from "./objects_3d_solids";
import { registerParametricSurfaceBlock } from "./parametric_surface";

export const registerThreeDObjectBlocks = (context: PluginContext) => {
  registerGenericThreeDObjectBlocks(context);
  registerThreeDSolidBlocks(context);
  registerThreeDArrowBlocks(context);
  registerParametricSurfaceBlock(context);
};
