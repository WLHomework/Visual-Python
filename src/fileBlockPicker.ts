import * as Blockly from "blockly/core";

export type FileBlockPickerMode = "open-file" | "save-file" | "directory" | "audio-file";

export type FileBlockPickerConfig = {
  inputName: string;
  mode: FileBlockPickerMode | ((block: Blockly.Block) => FileBlockPickerMode);
  previewAudio?: boolean;
};

export type FileBlockPickerHandler = (
  block: Blockly.Block,
  mode: FileBlockPickerMode,
  inputName: string,
) => void | Promise<void>;

const pickerConfigs: Record<string, FileBlockPickerConfig[]> = {
  python_file_read_text: [{ inputName: "PATH", mode: "open-file" }],
  python_file_write_text: [{ inputName: "PATH", mode: "save-file" }],
  python_open_file: [{
    inputName: "PATH",
    mode: (block) => ["r", "rb"].includes(String(block.getFieldValue("MODE"))) ? "open-file" : "save-file",
  }],
  python_file_exists: [{ inputName: "PATH", mode: "open-file" }],
  python_directory_exists: [{ inputName: "PATH", mode: "directory" }],
  python_path_info: [{
    inputName: "PATH",
    mode: (block) => block.getFieldValue("PATH_KIND") === "directory" ? "directory" : "open-file",
  }],
  python_file_copy: [
    { inputName: "SOURCE", mode: "open-file" },
    { inputName: "TARGET", mode: "save-file" },
  ],
  python_file_move: [
    { inputName: "SOURCE", mode: (block) => block.getFieldValue("PATH_KIND") === "directory" ? "directory" : "open-file" },
    { inputName: "TARGET", mode: (block) => block.getFieldValue("PATH_KIND") === "directory" ? "directory" : "save-file" },
  ],
  python_file_delete: [{ inputName: "PATH", mode: "open-file" }],
  python_directory_copy: [
    { inputName: "SOURCE", mode: "directory" },
    { inputName: "TARGET", mode: "directory" },
  ],
  python_directory_move: [
    { inputName: "SOURCE", mode: "directory" },
    { inputName: "TARGET", mode: "directory" },
  ],
  python_directory_find: [{ inputName: "PATH", mode: "directory" }],
  python_directory_remove: [{ inputName: "PATH", mode: "directory" }],
  python_path_create: [{
    inputName: "VALUE",
    mode: (block) => block.getFieldValue("PATH_KIND") === "directory" ? "directory" : "open-file",
  }],
  python_path_check: [{
    inputName: "PATH",
    mode: (block) => block.getFieldValue("METHOD") === "is_dir" ? "directory" : "open-file",
  }],
  python_path_read_text: [{ inputName: "PATH", mode: "open-file" }],
  python_path_write_text: [{ inputName: "PATH", mode: "save-file" }],
  python_os_listdir: [{ inputName: "PATH", mode: "directory" }],
  python_os_makedirs: [{ inputName: "PATH", mode: "directory" }],
  visual_python_manim_play_local_audio: [{ inputName: "PATH", mode: "audio-file", previewAudio: true }],
  visual_python_manim_play_local_audio_with_animation: [{ inputName: "PATH", mode: "audio-file", previewAudio: true }],
};

let pickerHandler: FileBlockPickerHandler | null = null;
let audioPreviewHandler: ((block: Blockly.Block) => void | Promise<void>) | null = null;

export const setFileBlockPickerHandler = (handler: FileBlockPickerHandler | null) => {
  pickerHandler = handler;
};

export const setLocalAudioPreviewHandler = (handler: ((block: Blockly.Block) => void | Promise<void>) | null) => {
  audioPreviewHandler = handler;
};

export const getFileBlockPickerConfigs = (blockType: string) => pickerConfigs[blockType] ?? [];

const folderIcon = `data:image/svg+xml,${encodeURIComponent([
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  '<path d="m9 14 2 2 4-4"/>',
  '</svg>',
].join(""))}`;

const previewAudioIcon = `data:image/svg+xml,${encodeURIComponent([
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M11 5 6 9H2v6h4l5 4Z"/>',
  '<path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
  '<path d="M18 6a8 8 0 0 1 0 12"/>',
  '</svg>',
].join(""))}`;

const installedMarker = Symbol.for("visual-python.file-block-picker-installed");

export const installFileBlockPickerFields = () => {
  for (const [blockType, configs] of Object.entries(pickerConfigs)) {
    const definition = Blockly.Blocks[blockType] as (typeof Blockly.Blocks)[string] & { [installedMarker]?: boolean };
    if (!definition?.init || definition[installedMarker]) continue;
    const originalInit = definition.init;
    definition.init = function (this: Blockly.Block) {
      originalInit.call(this);
      for (const config of configs) {
        const input = this.getInput(config.inputName);
        if (!input) continue;
        input.appendField(new Blockly.FieldImage(folderIcon, 18, 18, "选择路径", () => {
          const mode = typeof config.mode === "function" ? config.mode(this) : config.mode;
          void pickerHandler?.(this, mode, config.inputName);
        }), `FILE_PICKER_${config.inputName}`);
        if (config.previewAudio) {
          input.appendField(new Blockly.FieldImage(previewAudioIcon, 18, 18, "试听或停止音频", () => {
            void audioPreviewHandler?.(this);
          }), "LOCAL_AUDIO_PREVIEW");
        }
      }
    };
    definition[installedMarker] = true;
  }
};

const normalizedAbsolutePath = (value: string) => value.trim().replace(/\\/g, "/").replace(/\/{2,}/g, (match, offset) => offset === 0 ? match : "/").replace(/\/$/, "");

const isWindowsLikePath = (value: string) => /^[A-Za-z]:\//.test(value) || value.startsWith("//");

export const projectRelativePath = (selectedPath: string, projectPath: string | null) => {
  const selected = normalizedAbsolutePath(selectedPath);
  if (!selected || !projectPath) return selected;
  const project = normalizedAbsolutePath(projectPath);
  const separator = project.lastIndexOf("/");
  if (separator < 0) return selected;
  const projectDirectory = project.slice(0, separator) || "/";
  const caseInsensitive = isWindowsLikePath(selected) || isWindowsLikePath(projectDirectory);
  const comparableSelected = caseInsensitive ? selected.toLocaleLowerCase("en-US") : selected;
  const comparableDirectory = caseInsensitive ? projectDirectory.toLocaleLowerCase("en-US") : projectDirectory;
  if (comparableSelected === comparableDirectory) return ".";
  const prefix = projectDirectory === "/" ? "/" : `${projectDirectory}/`;
  const comparablePrefix = caseInsensitive ? prefix.toLocaleLowerCase("en-US") : prefix;
  return comparableSelected.startsWith(comparablePrefix) ? selected.slice(prefix.length) : selected;
};
