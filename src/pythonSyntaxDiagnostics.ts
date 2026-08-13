export type PythonCodeDiagnostic = {
  line: number;
  startColumn: number;
  endColumn: number;
  message: string;
  suggestion: string;
};

export type PythonSyntaxDiagnostic = PythonCodeDiagnostic;

const stripTerminalFormatting = (value: string) => value
  .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
  .replace(/\r/g, "");

const friendlySyntaxMessage = (detail: string) => {
  if (/expected ['"]?:['"]?/i.test(detail)) return {
    message: "语句末尾缺少冒号 `:`。",
    suggestion: "在 if、for、while、def、class、try 等语句的末尾补上冒号。",
  };
  if (/was never closed|unclosed/i.test(detail)) return {
    message: "存在未闭合的左括号。",
    suggestion: "检查这一行和前面的括号，在合适的位置补上右括号。",
  };
  if (/unmatched ['"][)\]}]['"]/i.test(detail)) return {
    message: "右括号没有对应的左括号。",
    suggestion: "删除多余的右括号，或者在前面补上与它配对的左括号。",
  };
  if (/unterminated string|string literal/i.test(detail)) return {
    message: "字符串缺少结束引号。",
    suggestion: "在文本末尾补上与开头相同的单引号或双引号。",
  };
  if (/expected an indented block/i.test(detail)) return {
    message: "复合语句后缺少缩进代码块。",
    suggestion: "给函数、条件、循环或类的内部代码增加 4 个空格缩进。",
  };
  if (/unexpected indent/i.test(detail)) return {
    message: "当前行存在意外缩进。",
    suggestion: "减少行首空格，让它和当前代码层级保持一致。",
  };
  if (/unindent does not match|inconsistent use of tabs and spaces/i.test(detail)) return {
    message: "代码缩进不一致。",
    suggestion: "统一使用 4 个空格缩进，不要混用 Tab 和空格。",
  };
  if (/return.*outside function/i.test(detail)) return {
    message: "return 位于函数外部。",
    suggestion: "把 return 放进 def 或 async def 定义的函数体内。",
  };
  if (/(break|continue).*outside loop/i.test(detail)) return {
    message: "循环控制语句位于循环外部。",
    suggestion: "把 break 或 continue 放进 for 或 while 循环体内。",
  };
  if (/await.*outside async/i.test(detail)) return {
    message: "await 位于异步函数外部。",
    suggestion: "把 await 放进 async def 定义的异步函数体内。",
  };
  if (/cannot assign to|assignment to/i.test(detail)) return {
    message: "等号左边需要一个能存值的名字。",
    suggestion: "把变量、属性或索引放在等号左边，不要给计算结果直接赋值。",
  };
  if (/leading zeros|invalid decimal literal|invalid digit/i.test(detail)) return {
    message: "数字格式不符合 Python 语法。",
    suggestion: "检查数字中的字母、小数点和前导零，改成合法的 Python 数字。",
  };
  if (/invalid character|non-printable character/i.test(detail)) return {
    message: "代码中包含 Python 无法识别的字符。",
    suggestion: "删除异常字符，并检查是否误用了中文标点或全角空格。",
  };
  if (/f-string/i.test(detail)) return {
    message: "f-string 中的括号或引号不匹配。",
    suggestion: "检查 f-string 中的花括号、引号和表达式是否完整。",
  };
  if (/unexpected eof|incomplete input|eof while scanning/i.test(detail)) return {
    message: "代码输入不完整。",
    suggestion: "检查前面是否缺少右括号、结束引号或代码块内容。",
  };
  return {
    message: "Python 无法解析当前语句。",
    suggestion: "检查附近的括号、引号、逗号、冒号和运算符是否完整。",
  };
};

export function parsePythonSyntaxDiagnostic(traceback: string, source: string): PythonSyntaxDiagnostic | null {
  const clean = stripTerminalFormatting(traceback);
  const exception = [...clean.matchAll(/(?:^|\n)(SyntaxError|IndentationError|TabError):\s*([^\n]*)/g)].at(-1);
  const location = [...clean.matchAll(/File ["'][^"']+["'], line (\d+)/g)].at(-1);
  if (!exception || !location) return null;

  const line = Math.max(1, Number(location[1]) || 1);
  const sourceLine = source.split(/\r?\n/)[line - 1] ?? "";
  const tracebackLines = clean.split("\n");
  const locationIndex = tracebackLines.findIndex((entry) => entry.includes(location[0]));
  const renderedSourceLine = locationIndex >= 0 ? tracebackLines[locationIndex + 1] ?? "" : "";
  const caretLine = locationIndex >= 0 ? tracebackLines.slice(locationIndex + 1).find((entry) => entry.includes("^")) ?? "" : "";
  const sourceOffset = sourceLine && renderedSourceLine.endsWith(sourceLine)
    ? renderedSourceLine.length - sourceLine.length
    : 4;
  const caretOffset = caretLine.indexOf("^");
  const startColumn = caretOffset >= 0 ? Math.max(1, caretOffset - sourceOffset + 1) : 1;
  const caretWidth = caretOffset >= 0 ? Math.max(1, caretLine.slice(caretOffset).match(/^\^+/)?.[0].length ?? 1) : 1;
  const friendly = friendlySyntaxMessage(exception[2].trim());

  return {
    line,
    startColumn,
    endColumn: startColumn + caretWidth,
    ...friendly,
  };
}
