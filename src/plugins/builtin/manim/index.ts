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
import { registerManimAgentTools } from "./agentTools";
import { extractManimSceneNames } from "./sceneNames";
import { manimSceneDocumentName } from "./sceneDocuments";

export const manimPlugin: VisualPythonPlugin = {
  manifest: {
    id: "visual-python.manim",
    name: "Manim",
    version: "0.1.0",
    apiVersion: PLUGIN_API_VERSION,
    description: "通过图形化积木生成 Manim 场景代码。",
    builtin: true,
    python: { packages: ["manim"], minimumVersion: "3.11" },
    agent: {
      description: "创建、检查和渲染 Manim 动画，并管理 Manim 配音与资源。",
      tools: ["validate_scene", "render_manim", "inspect_rendered_output", "get_voiceover_context", "add_voiceover", "add_synchronized_voiceover", "check_voiceover"],
      fileTypes: [".py", ".vpy"],
      detect: "imports",
    },
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
    registerManimAgentTools(context);
    context.registerCodeDocumentHandler({
      id: "visual-python.manim.code-documents",
      matches: (code) => extractManimSceneNames(code).length > 0,
      name: manimSceneDocumentName,
    });
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
