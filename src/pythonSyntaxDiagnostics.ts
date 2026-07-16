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
    message: "这一行少了收尾的冒号 `:`。",
    suggestion: "在 if、for、while、def、class、try 等语句的末尾补上冒号。",
  };
  if (/was never closed|unclosed/i.test(detail)) return {
    message: "有个左括号还在等它的另一半。",
    suggestion: "检查这一行和前面的括号，在合适的位置补上右括号。",
  };
  if (/unmatched ['"][)\]}]['"]/i.test(detail)) return {
    message: "这个右括号没有找到对应的左括号。",
    suggestion: "删除多余的右括号，或者在前面补上与它配对的左括号。",
  };
  if (/unterminated string|string literal/i.test(detail)) return {
    message: "这段文字忘记关引号了。",
    suggestion: "在文本末尾补上与开头相同的单引号或双引号。",
  };
  if (/expected an indented block/i.test(detail)) return {
    message: "下一行该往里站一格了。",
    suggestion: "给函数、条件、循环或类的内部代码增加 4 个空格缩进。",
  };
  if (/unexpected indent/i.test(detail)) return {
    message: "这行缩进得有点抢跑。",
    suggestion: "减少行首空格，让它和当前代码层级保持一致。",
  };
  if (/unindent does not match|inconsistent use of tabs and spaces/i.test(detail)) return {
    message: "缩进队伍没有站整齐。",
    suggestion: "统一使用 4 个空格缩进，不要混用 Tab 和空格。",
  };
  if (/return.*outside function/i.test(detail)) return {
    message: "return 走出了函数的活动范围。",
    suggestion: "把 return 放进 def 或 async def 定义的函数体内。",
  };
  if (/(break|continue).*outside loop/i.test(detail)) return {
    message: "循环控制语句跑到了循环外面。",
    suggestion: "把 break 或 continue 放进 for 或 while 循环体内。",
  };
  if (/await.*outside async/i.test(detail)) return {
    message: "await 离开异步函数就无法工作。",
    suggestion: "把 await 放进 async def 定义的异步函数体内。",
  };
  if (/cannot assign to|assignment to/i.test(detail)) return {
    message: "等号左边需要一个能存值的名字。",
    suggestion: "把变量、属性或索引放在等号左边，不要给计算结果直接赋值。",
  };
  if (/leading zeros|invalid decimal literal|invalid digit/i.test(detail)) return {
    message: "这个数字的写法让 Python 犹豫了。",
    suggestion: "检查数字中的字母、小数点和前导零，改成合法的 Python 数字。",
  };
  if (/invalid character|non-printable character/i.test(detail)) return {
    message: "这里混进了 Python 不认识的字符。",
    suggestion: "删除异常字符，并检查是否误用了中文标点或全角空格。",
  };
  if (/f-string/i.test(detail)) return {
    message: "这个 f-string 的括号或引号没配对。",
    suggestion: "检查 f-string 中的花括号、引号和表达式是否完整。",
  };
  if (/unexpected eof|incomplete input|eof while scanning/i.test(detail)) return {
    message: "代码像是说到一半停住了。",
    suggestion: "检查前面是否缺少右括号、结束引号或代码块内容。",
  };
  return {
    message: "Python 读到这里时卡了一下。",
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
