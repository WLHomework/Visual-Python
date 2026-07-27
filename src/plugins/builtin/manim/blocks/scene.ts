import type { PluginContext } from "../../../api/types";
import { registerSceneCameraBlocks } from "./scene_camera";
import { registerSceneDefinitionBlocks } from "./scene_definition";
import { registerSceneObjectBlocks } from "./scene_objects";
import { registerScenePlaybackBlocks } from "./scene_playback";
import { registerVoiceoverBlocks } from "./voiceover";

export const registerSceneBlocks = (context: PluginContext) => {
  registerSceneDefinitionBlocks(context);
  registerSceneCameraBlocks(context);
  registerScenePlaybackBlocks(context);
  registerSceneObjectBlocks(context);
  registerVoiceoverBlocks(context);
};
