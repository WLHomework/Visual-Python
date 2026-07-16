import type { PluginContext } from "../../../api/types";
import { registerArcShapeBlocks } from "./arc_shapes";
import { registerGenericCurveShapeBlocks } from "./curved_shape_generic";
import { registerRoundedEllipseShapeBlocks } from "./rounded_ellipse_shapes";

export const registerCurveObjectBlocks = (context: PluginContext) => {
  registerGenericCurveShapeBlocks(context);
  registerRoundedEllipseShapeBlocks(context);
  registerArcShapeBlocks(context);
};
