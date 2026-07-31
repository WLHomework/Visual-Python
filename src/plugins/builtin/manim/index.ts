import { PLUGIN_API_VERSION, type VisualPythonPlugin } from "../../api/types";
import { registerAnimationBlocks } from "./blocks/animations";
import { registerDynamicBlocks } from "./blocks/dynamic";
import { registerMethodBlocks } from "./blocks/methods";
import { registerObjectExtraBlocks } from "./blocks/object_extras";
import { registerBasicObjectBlocks } from "./blocks/objects";
import { registerSceneBlocks } from "./blocks/scene";
import { registerValueBlocks } from "./blocks/values";
import { registerManimAngleField } from "./angleField";
import { registerManimColorField } from "./colorField";
import { registerManimFormulaField } from "./formulaField";
import { registerManimToolbox } from "./toolbox";
import { installFileBlockPickerFields } from "../../../fileBlockPicker";
import { colourForManimBlock } from "./constants";
import { getManimRenderConfig, isDefaultManimRenderConfig, loadManimRenderConfig, resetManimRenderConfig } from "./renderConfig";
import { clearProjectVoiceoverRoles, loadProjectVoiceoverRoles, saveProjectVoiceoverRoles } from "./voiceoverRoles";

export const manimPlugin: VisualPythonPlugin = {
  manifest: {
    id: "visual-python.manim",
    name: "Manim",
    version: "0.1.0",
    apiVersion: PLUGIN_API_VERSION,
    description: "通过图形化积木生成 Manim 场景代码。",
    builtin: true,
    python: { packages: ["manim"], minimumVersion: "3.11" },
  },
  activate(context) {
    registerManimAngleField();
    registerManimColorField();
    registerManimFormulaField();

    const colouredContext = new Proxy(context, {
      get(target, property, receiver) {
        if (property !== "registerBlock") return Reflect.get(target, property, receiver);
        return (definition: Parameters<typeof context.registerBlock>[0], generator: Parameters<typeof context.registerBlock>[1]) => {
          context.registerBlock({ ...definition, colour: colourForManimBlock(definition.type) }, generator);
        };
      },
    });

    registerSceneBlocks(colouredContext);
    installFileBlockPickerFields();
    registerBasicObjectBlocks(colouredContext);
    registerObjectExtraBlocks(colouredContext);
    registerAnimationBlocks(colouredContext);
    registerDynamicBlocks(colouredContext);
    registerValueBlocks(colouredContext);
    registerMethodBlocks(colouredContext);

    registerManimToolbox(colouredContext);
    context.registerProjectSerializer({
      id: "visual-python.manim.render-config",
      save: () => isDefaultManimRenderConfig() ? undefined : getManimRenderConfig(),
      load: loadManimRenderConfig,
      clear: resetManimRenderConfig,
    });
    context.registerProjectSerializer({
      id: "visual-python.manim.voiceover-roles",
      save: saveProjectVoiceoverRoles,
      load: loadProjectVoiceoverRoles,
      clear: clearProjectVoiceoverRoles,
    });
  },
};
