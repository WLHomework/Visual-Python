import type { PythonCodeDiagnostic } from "./pythonSyntaxDiagnostics";

const stripTerminalFormatting = (value: string) => value
  .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
  .replace(/\r/g, "");

const quotedValue = (detail: string) => detail.match(/["']([^"']+)["']/)?.[1];

const friendlyRuntimeMessage = (type: string, detail: string) => {
  const name = detail.match(/name ["']([^"']+)["']/i)?.[1];
  const localName = detail.match(/local variable ["']([^"']+)["']/i)?.[1];
  const moduleName = detail.match(/No module named ["']([^"']+)["']/i)?.[1];
  const attribute = detail.match(/has no attribute ["']([^"']+)["']/i)?.[1];
  const missingArguments = detail.match(/missing \d+ required positional argument[s]?:?\s*(.+)$/i)?.[1];

  if (type === "NameError") return {
    message: `名字“${name || "这个名称"}”还没登场。`,
    suggestion: "先给它赋值或定义对应函数，并检查名称的拼写是否一致。",
  };
  if (type === "UnboundLocalError") return {
    message: `变量“${localName || "这个变量"}”还没拿到值就被使用了。`,
    suggestion: "把赋值语句移到首次读取之前，必要时检查 global 或 nonlocal。",
  };
  if (type === "ZeroDivisionError") return {
    message: "除数变成 0 了，这道除法走不通。",
    suggestion: "在除法、整除或取余前先判断除数是否为 0。",
  };
  if (type === "IndexError") return {
    message: "索引跑出了序列的边界。",
    suggestion: "索引从 0 开始，并且必须小于列表、元组或文本的长度。",
  };
  if (type === "KeyError") return {
    message: `字典里没有键“${quotedValue(detail) || "当前键"}”。`,
    suggestion: "检查键名，或者使用 dict.get() 并提供默认值。",
  };
  if (type === "AttributeError") return {
    message: `这个对象没有“${attribute || "该名称"}”属性或方法。`,
    suggestion: "检查对象类型和属性名，确认调用的是这个对象真正支持的方法。",
  };
  if (type === "ModuleNotFoundError") return {
    message: `当前 Python 环境找不到模块“${moduleName || "该模块"}”。`,
    suggestion: "检查模块名称，并确认它已经安装到当前选择的 Python 环境。",
  };
  if (type === "ImportError") return {
    message: "模块找到了，但要导入的名称不在里面。",
    suggestion: "检查 from ... import ... 中的名称以及当前库版本。",
  };
  if (type === "FileNotFoundError") return {
    message: `文件“${quotedValue(detail) || "目标文件"}”不在预期的位置。`,
    suggestion: "检查文件路径、当前工作目录，以及文件是否被移动或删除。",
  };
  if (type === "PermissionError") return {
    message: "这个文件或目录暂时不允许访问。",
    suggestion: "检查文件是否被占用，并确认当前用户具有读取或写入权限。",
  };
  if (type === "TypeError" && missingArguments) return {
    message: `函数调用漏带了参数 ${missingArguments}。`,
    suggestion: "按照函数定义补齐参数，并检查参数顺序和名称。",
  };
  if (type === "TypeError" && /unsupported operand|concatenate/i.test(detail)) return {
    message: "运算两边的值不在同一个频道。",
    suggestion: "检查是否混用了数字、文本、列表或其他对象，必要时先转换类型。",
  };
  if (type === "TypeError" && /not iterable/i.test(detail)) return {
    message: "这个值不能被循环或拆开使用。",
    suggestion: "这里需要列表、元组、集合、字典、文本或其他可迭代对象。",
  };
  if (type === "TypeError" && /not subscriptable/i.test(detail)) return {
    message: "这个对象不支持索引或切片。",
    suggestion: "确认当前值是列表、元组、字典、文本等支持下标的对象。",
  };
  if (type === "TypeError") return {
    message: "函数收到的值和它期待的类型对不上。",
    suggestion: "检查参数数量、参数名称和每个值的类型。",
  };
  if (type === "ValueError") return {
    message: "值的类型看着没问题，内容却不合要求。",
    suggestion: "检查数字转换、解包数量、取值范围和函数参数内容。",
  };
  if (type === "AssertionError") return {
    message: "断言没有通过，实际结果和预期不一致。",
    suggestion: "检查断言前的数据状态，或者修正断言条件。",
  };
  if (type === "RecursionError") return {
    message: "函数调用自己太多次，没能及时停下来。",
    suggestion: "给递归函数补上可靠的结束条件，并确保每次调用都更接近它。",
  };
  if (type === "OverflowError") return {
    message: "这个数值大得超出了当前运算的承受范围。",
    suggestion: "缩小输入范围，或改用能够处理更大数值的计算方式。",
  };
  return {
    message: "程序运行到这里时停下来了。",
    suggestion: "查看输出中的完整错误记录，并检查这一行使用的值和函数参数。",
  };
};

export function parsePythonRuntimeDiagnostic(traceback: string, source: string): PythonCodeDiagnostic | null {
  const clean = stripTerminalFormatting(traceback);
  const exception = [...clean.matchAll(/(?:^|\n)([A-Za-z_][A-Za-z0-9_.]*(?:Error|Exception))(?::\s*([^\n]*))?/g)].at(-1);
  const location = [...clean.matchAll(/File ["']<(?:string|visual-python)>["'], line (\d+)/g)].at(-1);
  if (!exception || !location || /^(?:SyntaxError|IndentationError|TabError)$/.test(exception[1])) return null;

  const line = Math.max(1, Number(location[1]) || 1);
  const sourceLine = source.split(/\r?\n/)[line - 1] ?? "";
  const firstCodeColumn = sourceLine.search(/\S/);
  const startColumn = firstCodeColumn >= 0 ? firstCodeColumn + 1 : 1;
  const friendly = friendlyRuntimeMessage(exception[1].split(".").at(-1) || exception[1], exception[2]?.trim() || "");
  return {
    line,
    startColumn,
    endColumn: Math.max(startColumn + 1, sourceLine.length + 1),
    ...friendly,
  };
}
