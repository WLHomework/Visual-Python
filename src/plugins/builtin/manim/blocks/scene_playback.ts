import type { PluginContext } from "../../../api/types";
import { colour } from "../constants";
import { addManimImport, pythonCall, value } from "../helpers";

export const registerScenePlaybackBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_play",
    message0: "播放动画 %1",
    args0: [{ type: "input_value", name: "ANIMATION", check: "ManimAnimation" }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
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
};
