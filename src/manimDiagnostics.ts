import type * as Blockly from "blockly/core";
import { isManimLatexFailure } from "./manimErrorClassification";

export type ManimDiagnosticMode = "code" | "blocks";
export type ManimDiagnosis = { message: string; suggestion: string };

type ManimDiagnosticOptions = {
  mode: ManimDiagnosticMode;
  block?: Blockly.Block;
};

export function localAudioErrorSuggestion(mode: ManimDiagnosticMode): string {
  return mode === "code"
    ? "请检查代码中的本地音频文件路径，并确认文件仍然存在且可以正常播放。"
    : "请点击该积木上的文件夹图标重新选择本地音频文件，并确认文件仍然存在且可以正常播放。";
}

const stripTerminalFormatting = (value: string) => value
  .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
  .replace(/[│╭╮╰╯─]+/g, " ")
  .trim();

const codeSuggestion = (traceback: string, errorType: string, detail: string) => {
  const missingModule = detail.match(/No module named ['"]([^'"]+)['"]/i);
  const named = detail.match(/name ['"]([^'"]+)['"] is not defined/i);
  const missingFile = detail.match(/(?:No such file or directory|cannot find)[^'"]*['"]([^'"]+)['"]/i);
  const attribute = detail.match(/object has no attribute ['"]([^'"]+)['"]/i);
  const keyword = detail.match(/keyword argument ['"]([^'"]+)['"]/i);
  const missingArgument = detail.match(/missing \d+ required positional argument[s]?: (.+)$/i);
  const unexpectedPlayArgument = detail.match(/Unexpected argument (.+?) passed to Scene\.play\(\)/i);

  if (errorType === "ModuleNotFoundError" && missingModule) {
    return missingModule[1].toLowerCase() === "manim"
      ? "当前 Python 环境未安装 Manim。请在当前环境中安装 Manim 后重新渲染。"
      : `当前 Python 环境找不到模块“${missingModule[1]}”。请安装该依赖后重新渲染。`;
  }
  if (named) return `名称“${named[1]}”尚未定义。请先在代码中创建该 Manim 对象或 Python 变量，并检查名称拼写是否一致。`;
  if (missingFile) return `找不到文件“${missingFile[1]}”。请检查代码中的文件路径，并确认文件没有被移动或删除。`;
  if (attribute) return `当前对象不支持“${attribute[1]}”方法。请检查报错行的对象类型和方法名称。`;
  if (keyword && /multiple values/i.test(detail)) return `参数“${keyword[1]}”被重复传入。请检查报错行的函数调用，避免同时使用位置参数和同名关键字参数。`;
  if (keyword) return `当前函数或 Manim 版本不支持参数“${keyword[1]}”。请检查报错行的参数名称和当前 Manim 版本。`;
  if (missingArgument) return `缺少必填参数 ${missingArgument[1]}。请在报错的函数或方法调用中补充该参数。`;
  if (errorType === "AttributeError") return "当前对象调用了不存在的属性或方法。请检查报错位置的对象类型和方法名；配音应通过 AI 专用配音工具插入，不能在 Scene 中调用 self.add_voiceover 或 self.add_synchronized_voiceover。";
  if (errorType === "ZeroDivisionError") return "除数不能为 0。请检查报错行附近的数值、比例或范围步长，并改为非零值。";
  if (errorType === "FileNotFoundError") return "代码引用的文件不存在。请检查文件路径，并确认文件仍然存在且可以访问。";
  if (isManimLatexFailure(traceback)) return "LaTeX 渲染失败。请检查公式语法、反斜杠和成对括号；如果语法正确，再确认本机已安装 LaTeX。";
  if (errorType === "ValueError") return "输入值不在允许范围内。请检查报错行的参数内容、取值范围和数据结构。";
  if (errorType === "TypeError" && unexpectedPlayArgument) return `Scene.play() 只能接收动画对象。“${unexpectedPlayArgument[1]}”是 Manim 图形对象，不能直接播放；请使用 Create(circle)、FadeIn(circle) 等动画，或使用 self.add(circle) 直接添加。`;
  if (errorType === "TypeError") return "参数类型不匹配。请检查报错行传入对象的类型、参数数量和关键字参数名称。";
  return "请检查报错行附近的 Manim 对象和函数调用，确认传入值符合对应 API 的要求。";
};

const blockSuggestion = (traceback: string, errorType: string, detail: string, block?: Blockly.Block) => {
  const blockLabel = block?.toString(54) || "当前积木";
  const named = detail.match(/name ['"]([^'"]+)['"] is not defined/i);
  const missingFile = detail.match(/(?:No such file or directory|cannot find)[^'"]*['"]([^'"]+)['"]/i);
  const attribute = detail.match(/object has no attribute ['"]([^'"]+)['"]/i);
  const keyword = detail.match(/keyword argument ['"]([^'"]+)['"]/i);
  const missingArgument = detail.match(/missing \d+ required positional argument[s]?: (.+)$/i);

  if (named) return `名称“${named[1]}”尚未创建。请先创建该 Manim 对象或 Python 变量，再在高亮积木中选择/填写相同名称。`;
  if (missingFile) return `找不到文件“${missingFile[1]}”。请改为存在的文件路径，并确认文件没有被移动或删除。`;
  if (attribute) return `当前对象不支持“${attribute[1]}”方法。请把高亮积木连接到支持该方法的 Manim 对象，或改用对应对象的方法积木。`;
  if (keyword && /multiple values/i.test(detail)) return `参数“${keyword[1]}”被重复传入。这通常是积木与当前 Manim 版本不兼容，请不要继续调整数值，记录该积木并反馈此错误。`;
  if (keyword) return `当前 Manim 版本不支持参数“${keyword[1]}”。请检查高亮积木的参数选择；如果该参数由积木固定生成，请反馈该积木的兼容性问题。`;
  if (missingArgument) return `缺少必填参数 ${missingArgument[1]}。请给高亮积木对应的空输入槽连接合适的数值或对象。`;
  if (errorType === "AttributeError") return "当前对象调用了不存在的属性或方法。请检查报错位置的方法名；配音必须通过 AI 专用配音工具插入，不能在 Scene 中调用 self.add_voiceover 或 self.add_synchronized_voiceover。";
  if (errorType === "ZeroDivisionError") return "除数不能为 0。请检查高亮积木中的数值、比例或范围步长，并改为非零值。";
  if (errorType === "FileNotFoundError") return "高亮积木引用的文件不存在。请重新选择有效文件，并避免使用已移动的绝对路径。";
  if (isManimLatexFailure(traceback)) return "LaTeX 渲染失败。请检查公式语法、反斜杠和成对括号；如果语法正确，再确认本机已安装 LaTeX。";
  if (errorType === "ValueError") return "输入值不在允许范围内。请检查高亮积木中的半径、尺寸、范围起止值和列表结构。";
  if (errorType === "TypeError") return "输入类型不匹配。请检查高亮积木的连接：对象槽连接 Manim 对象，数值槽连接数字，列表槽连接 Python 列表。";
  return `检查高亮的“${blockLabel}”积木：确认所有输入已连接，并且输入值类型符合该积木要求。`;
};

export function diagnoseManimError(traceback: string, options: ManimDiagnosticOptions): ManimDiagnosis {
  const cleanTraceback = stripTerminalFormatting(traceback);
  const exception = [...cleanTraceback.matchAll(/(?:^|\n)([A-Za-z]+(?:Error|Exception)):\s*([^\n]+)/g)].at(-1);
  const errorType = exception?.[1] || "ManimError";
  const detail = exception?.[2]?.trim() || cleanTraceback.split("\n").map((line) => line.trim()).filter(Boolean).at(-1) || "未知错误";
  const suggestion = options.mode === "code"
    ? codeSuggestion(cleanTraceback, errorType, detail)
    : blockSuggestion(cleanTraceback, errorType, detail, options.block);

  return { message: `${errorType}: ${detail}`, suggestion };
}

export function diagnoseManimStartupError(error: unknown): ManimDiagnosis {
  const detail = stripTerminalFormatting(String(error)).replace(/^Error:\s*/i, "") || "未知启动错误";
  if (/cannot start Manim/i.test(detail) && /not found|no such file|os error 2|cannot find the path|不是内部或外部命令/i.test(detail)) {
    return {
      message: "无法启动 Manim",
      suggestion: "找不到当前 Python 解释器或无法启动 Python 进程。请在设置中选择有效的 Python 环境，并确认 Manim 已安装。",
    };
  }
  if (/cannot create Manim work directory|cannot write Manim scene file|access is denied|permission denied/i.test(detail)) {
    return {
      message: "无法准备 Manim 工作目录",
      suggestion: "请检查渲染目录是否存在、具有写入权限，并确认没有被其他程序占用。",
    };
  }
  if (/cannot save final Manim output|cannot record final Manim output|cannot determine final Manim output name/i.test(detail)) {
    return {
      message: "无法保存 Manim 输出文件",
      suggestion: "请检查渲染输出目录权限、剩余磁盘空间以及输出文件名。",
    };
  }
  if (/已有 Manim 渲染任务正在运行/i.test(detail)) {
    return {
      message: "已有 Manim 渲染任务正在运行",
      suggestion: "请等待当前任务结束，或先停止当前渲染后再试。",
    };
  }
  if (/invalid Manim/i.test(detail)) {
    return {
      message: "Manim 渲染参数无效",
      suggestion: "请检查渲染类型、画面尺寸、质量、帧率和渲染器设置。",
    };
  }
  return {
    message: "无法启动 Manim 渲染",
    suggestion: "请查看输出面板中的详细错误，并检查 Python 环境、Manim 配置和渲染目录。",
  };
}
