import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, pythonCall, suite, value } from "../helpers";
import { createLocalAudioBeginMarker, createLocalAudioCueMarker, createLocalAudioEndMarker } from "../localAudioMarkers";

export const registerScenePlaybackBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_play",
    message0: "播放动画 %1",
    args0: [{ type: "input_value", name: "ANIMATION", check: "ManimAnimation" }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
    tooltip: "执行一个动画效果。创建、淡入和变形等效果需要连接到这里才能播放。",
  }, (block, generator) => {
    addManimImport(generator);
    return `self.play(${value(generator, block, "ANIMATION", "Create(Circle())")})\n`;
  });

  context.registerBlock({
    type: "visual_python_manim_play_with_options",
    message0: "播放动画 %1 时间 %2 延迟比例 %3",
    args0: [
      { type: "input_value", name: "ANIMATION", check: "ManimAnimation" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
      { type: "input_value", name: "LAG_RATIO", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
    tooltip: "播放一个动画，并统一设置播放时间和动画内部对象的延迟比例。",
  }, (block, generator) => {
    addManimImport(generator);
    const animation = value(generator, block, "ANIMATION", "Create(Circle())");
    const runTime = value(generator, block, "RUN_TIME", "1");
    const lagRatio = value(generator, block, "LAG_RATIO", "0");
    return `${pythonCall("self.play", [animation, `run_time=${runTime}`, `lag_ratio=${lagRatio}`], { multiline: true, indent: generator.INDENT })}\n`;
  });

  context.registerBlock({
    type: "visual_python_manim_play_two",
    message0: "同时播放动画 %1 和 %2 时间 %3 延迟比例 %4",
    args0: [
      { type: "input_value", name: "FIRST", check: "ManimAnimation" },
      { type: "input_value", name: "SECOND", check: "ManimAnimation" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
      { type: "input_value", name: "LAG_RATIO", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
    tooltip: "同时播放两个动画效果。延迟比例为零时同步开始。",
  }, (block, generator) => {
    addManimImport(generator);
    const first = value(generator, block, "FIRST", "Create(Circle())");
    const second = value(generator, block, "SECOND", "FadeIn(Square())");
    const runTime = value(generator, block, "RUN_TIME", "1");
    const lagRatio = value(generator, block, "LAG_RATIO", "0");
    return `${pythonCall("self.play", [first, second, `run_time=${runTime}`, `lag_ratio=${lagRatio}`], { multiline: true, indent: generator.INDENT })}\n`;
  });

  context.registerBlock({
    type: "visual_python_manim_play_list",
    message0: "播放动画列表 %1 时间 %2 延迟比例 %3",
    args0: [
      { type: "input_value", name: "ANIMATIONS" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
      { type: "input_value", name: "LAG_RATIO", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
    tooltip: "批量播放动画列表。适合同时处理三个或更多动画。",
  }, (block, generator) => {
    addManimImport(generator);
    const animations = value(generator, block, "ANIMATIONS", "[Create(Circle())]");
    const runTime = value(generator, block, "RUN_TIME", "1");
    const lagRatio = value(generator, block, "LAG_RATIO", "0");
    return `${pythonCall("self.play", [`*${animations}`, `run_time=${runTime}`, `lag_ratio=${lagRatio}`], { multiline: true, indent: generator.INDENT })}\n`;
  });

  context.registerBlock({
    type: "visual_python_manim_wait",
    message0: "等待 %1 秒",
    args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    return `self.wait(${value(generator, block, "SECONDS", "1")})\n`;
  });

  context.registerBlock({
    type: "visual_python_manim_play_local_audio",
    message0: "播放本地音频 %1 开始偏移 %2 秒 音量增益 %3 分贝",
    args0: [
      { type: "input_value", name: "PATH", check: "String" },
      { type: "input_value", name: "TIME_OFFSET", check: "Number" },
      { type: "input_value", name: "GAIN", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
    tooltip: "播放本地音乐、音效或录音。点击路径旁的文件夹图标可选择音频文件；路径也可以手动填写。需要等待音频结束时，请在后面连接等待积木。",
  }, (block, generator) => {
    addManimImport(generator);
    const pathBlock = block.getInputTargetBlock("PATH");
    const offsetBlock = block.getInputTargetBlock("TIME_OFFSET");
    const gainBlock = block.getInputTargetBlock("GAIN");
    const pathExpression = value(generator, block, "PATH", "'audio.wav'");
    const path = pathBlock?.type === "text" ? String(pathBlock.getFieldValue("TEXT") ?? "") : undefined;
    const timeOffset = offsetBlock?.type === "math_number" ? Number(offsetBlock.getFieldValue("NUM")) : undefined;
    const gain = gainBlock?.type === "math_number" ? Number(gainBlock.getFieldValue("NUM")) : undefined;
    return `${createLocalAudioCueMarker({ version: 1, pathExpression, ...(path === undefined ? {} : { path }), ...(timeOffset === undefined ? {} : { timeOffset }), ...(gain === undefined ? {} : { gain }), blockId: block.id })}\n`;
  });

  context.registerBlock({
    type: "visual_python_manim_play_local_audio_with_animation",
    message0: "播放本地音频 %1 开始偏移 %2 秒 音量增益 %3 分贝 同时执行 %4 %5",
    args0: [
      { type: "input_value", name: "PATH", check: "String" },
      { type: "input_value", name: "TIME_OFFSET", check: "Number" },
      { type: "input_value", name: "GAIN", check: "Number" },
      { type: "input_dummy" },
      { type: "input_statement", name: "BODY" },
    ],
    inputsInline: false,
    previousStatement: null,
    nextStatement: null,
    colour,
    tooltip: "播放本地音频并同时执行内部动画。动画较短时，渲染前会根据音频时长自动补足等待。",
  }, (block, generator) => {
    addManimImport(generator);
    const pathBlock = block.getInputTargetBlock("PATH");
    const offsetBlock = block.getInputTargetBlock("TIME_OFFSET");
    const gainBlock = block.getInputTargetBlock("GAIN");
    const pathExpression = value(generator, block, "PATH", "'audio.wav'");
    const path = pathBlock?.type === "text" ? String(pathBlock.getFieldValue("TEXT") ?? "") : undefined;
    const timeOffset = offsetBlock?.type === "math_number" ? Number(offsetBlock.getFieldValue("NUM")) : undefined;
    const gain = gainBlock?.type === "math_number" ? Number(gainBlock.getFieldValue("NUM")) : undefined;
    const body = suite(generator, block, "BODY").replace(new RegExp(`^${generator.INDENT}`), "").replace(new RegExp(`\\n${generator.INDENT}`, "g"), "\n");
    const marker = createLocalAudioBeginMarker({ version: 1, pathExpression, ...(path === undefined ? {} : { path }), ...(timeOffset === undefined ? {} : { timeOffset }), ...(gain === undefined ? {} : { gain }), blockId: block.id });
    return `${marker}\n${body}${createLocalAudioEndMarker()}\n`;
  });
};
