import type { PluginContext } from "../../../api/types";
import { registerGenericMethodBlocks } from "./generic_methods";
import { registerPositionMethodBlocks } from "./position_methods";
import { registerStyleMethodBlocks } from "./style_methods";

export const registerMethodBlocks = (context: PluginContext) => {
  registerStyleMethodBlocks(context);
  registerGenericMethodBlocks(context);
  registerPositionMethodBlocks(context);
};
