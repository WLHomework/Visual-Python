import type { PluginContext } from "../../../api/types";
import { registerBasicThreeDSolidBlocks } from "./objects_3d_basic_solids";
import { registerPrismTorusBlocks } from "./objects_3d_prism_torus";
import { registerRoundThreeDSolidBlocks } from "./objects_3d_round_solids";

export const registerThreeDSolidBlocks = (context: PluginContext) => {
  registerBasicThreeDSolidBlocks(context);
  registerRoundThreeDSolidBlocks(context);
  registerPrismTorusBlocks(context);
};
