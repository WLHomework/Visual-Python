import * as Blockly from "blockly/core";

type VoiceoverBlockPreviewHandler = (block: Blockly.Block) => void | Promise<void>;

let previewHandler: VoiceoverBlockPreviewHandler | null = null;

export const setVoiceoverBlockPreviewHandler = (handler: VoiceoverBlockPreviewHandler | null) => {
  previewHandler = handler;
};

export const previewVoiceoverBlock = (block: Blockly.Block) => {
  void previewHandler?.(block);
};

