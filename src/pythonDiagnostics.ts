import type * as Blockly from "blockly/core";

export type PythonDiagnosis = { message: string; suggestion: string };

const stripTerminalFormatting = (value: string) => value
  .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
  .replace(/\r/g, "")
  .trim();

const extractException = (traceback: string) => {
  const clean = stripTerminalFormatting(traceback);
  const match = [...clean.matchAll(/(?:^|\n)([A-Za-z_][A-Za-z0-9_.]*(?:Error|Exception))(?::\s*([^\n]*))?/g)].at(-1);
  const fallback = clean.split("\n").map((line) => line.trim()).filter(Boolean).at(-1) || "未知错误";
  return {
    type: match?.[1]?.split(".").at(-1) || "PythonError",
    detail: match?.[2]?.trim() || fallback,
  };
};

export function diagnosePythonError(traceback: string, block?: Blockly.Block): PythonDiagnosis {
  const { type, detail } = extractException(traceback);
  const blockLabel = block?.toString(54) || "相关积木";
  const undefinedName = detail.match(/name ['"]([^'"]+)['"] is not defined/i);
  const localName = detail.match(/local variable ['"]([^'"]+)['"]/i);
  const missingModule = detail.match(/No module named ['"]([^'"]+)['"]/i);
  const missingFile = detail.match(/(?:No such file or directory|cannot find)[^'"]*['"]([^'"]+)['"]/i);
  const attribute = detail.match(/has no attribute ['"]([^'"]+)['"]/i);
  const missingArgument = detail.match(/missing \d+ required positional argument[s]?:?\s*(.+)$/i);
  const unexpectedKeyword = detail.match(/unexpected keyword argument ['"]([^'"]+)['"]/i);
  const key = type === "KeyError" ? detail.replace(/^['"]|['"]$/g, "") : "";

  let suggestion = `检查“${blockLabel}”的输入连接和生成代码，确认传入值符合该操作的要求。`;
  if (type === "NameError" && undefinedName) {
    suggestion = `名称“${undefinedName[1]}”尚未定义。请先创建并赋值该变量或函数，并检查名称拼写是否一致。`;
  } else if (type === "UnboundLocalError") {
    suggestion = `局部变量“${localName?.[1] || "该变量"}”在赋值前被使用。请把赋值积木移到首次读取之前；若要修改外层变量，请使用 global 或 nonlocal。`;
  } else if (type === "IndexError") {
    suggestion = "索引超出了序列范围。列表索引从 0 开始，请确保索引小于列表长度；空列表不能按索引读取。";
  } else if (type === "KeyError") {
    suggestion = `字典中不存在键“${key || "当前键"}”。请检查键名，或改用“字典获取键并提供默认值”积木。`;
  } else if (type === "ZeroDivisionError") {
    suggestion = "除数不能为 0。请检查除法、整除或取余积木右侧的值，并在运算前判断它是否为零。";
  } else if (type === "ModuleNotFoundError" && missingModule) {
    suggestion = `找不到模块“${missingModule[1]}”。请检查模块名称；第三方模块需要先在当前 Python 环境中安装。`;
  } else if (type === "ImportError") {
    suggestion = "模块存在，但无法导入指定名称。请检查“从模块导入”积木中的名称和当前库版本。";
  } else if (type === "FileNotFoundError") {
    suggestion = `找不到文件${missingFile ? `“${missingFile[1]}”` : ""}。请检查路径、工作目录和文件是否已被移动或删除。`;
  } else if (type === "PermissionError") {
    suggestion = "当前用户没有访问权限，或文件正被其他程序占用。请关闭占用程序，并检查文件或目录权限。";
  } else if (type === "IsADirectoryError") {
    suggestion = "这里需要文件路径，但当前路径指向目录。请重新选择文件，或改用对应的目录操作积木。";
  } else if (type === "NotADirectoryError") {
    suggestion = "这里需要目录路径，但当前路径指向文件。请重新选择目录，或改用对应的文件操作积木。";
  } else if (type === "FileExistsError") {
    suggestion = "目标文件或目录已经存在。请更换名称，或把“已存在时”选项设置为忽略或合并。";
  } else if (type === "OSError" && /directory not empty/i.test(detail)) {
    suggestion = "目录中仍有文件或子目录。确认确实需要全部删除后，将删除方式改为“连同全部内容”。";
  } else if (type === "AttributeError") {
    suggestion = `当前对象没有属性或方法“${attribute?.[1] || "该名称"}”。请检查对象类型和属性/方法名称。`;
  } else if (type === "TypeError" && missingArgument) {
    suggestion = `函数调用缺少参数 ${missingArgument[1]}。请打开调用积木的齿轮，添加并连接对应参数。`;
  } else if (type === "TypeError" && unexpectedKeyword) {
    suggestion = `函数不接受关键字参数“${unexpectedKeyword[1]}”。请修改参数名称，或把它改为位置参数。`;
  } else if (type === "TypeError" && /not iterable/i.test(detail)) {
    suggestion = "当前值不可迭代。循环、解包或成员判断需要列表、元组、集合、字典、文本或其他可迭代对象。";
  } else if (type === "TypeError" && /not subscriptable/i.test(detail)) {
    suggestion = "当前对象不能使用索引或切片。请连接列表、元组、字典或文本等支持下标的对象。";
  } else if (type === "TypeError" && /unsupported operand|concatenate/i.test(detail)) {
    suggestion = "运算两侧的类型不兼容。请检查是否混用了文本、数字、列表或 Manim 对象，并在需要时先进行类型转换。";
  } else if (type === "TypeError") {
    suggestion = "输入类型或函数参数不匹配。请检查积木连接的值类型、参数数量和关键字参数名称。";
  } else if (type === "ValueError" && /invalid literal for int|could not convert string to float/i.test(detail)) {
    suggestion = "文本不能转换为目标数字类型。请确保输入只包含合法数字，并在转换前处理空文本和其他字符。";
  } else if (type === "ValueError") {
    suggestion = "值的类型正确，但内容或范围无效。请检查转换内容、解包数量、范围和方法参数。";
  } else if (type === "RecursionError") {
    suggestion = "函数递归次数过多。请确认递归函数存在能够停止递归的条件，并且每次调用都更接近该条件。";
  } else if (type === "AssertionError") {
    suggestion = "断言条件为假。请检查断言前的数据状态，或修改断言条件和提示消息。";
  } else if (type === "SyntaxError" || type === "IndentationError" || type === "TabError") {
    if (/return.*outside function/i.test(detail)) suggestion = "return 只能放在函数或方法的函数体内部，不能连接在函数定义块下方。";
    else if (/await.*outside async/i.test(detail)) suggestion = "await 只能放在异步函数的函数体内部。";
    else if (/(break|continue).*outside loop/i.test(detail)) suggestion = "break 和 continue 只能放在循环的执行区域内部。";
    else if (/expected an indented block/i.test(detail)) suggestion = "复合语句缺少执行内容。请在函数、条件、循环、异常或上下文积木的内部连接至少一条语句。";
    else suggestion = "生成的 Python 语法无效。请检查定位积木附近的名称、参数顺序、表达式和结构连接。";
  }

  return { message: `${type}: ${detail}`, suggestion };
}
