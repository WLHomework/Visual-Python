import type { LspDiagnostic } from "./pyrightClient";

export type FriendlyPyrightDiagnostic = {
  message: string;
  suggestion: string;
};

const diagnosticCode = (diagnostic: LspDiagnostic) => {
  const code = diagnostic.code;
  if (code && typeof code === "object") return String(code.value);
  return code === undefined ? "" : String(code);
};

const quotedValues = (message: string) => [...message.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);

export function formatPyrightDiagnostic(diagnostic: LspDiagnostic): FriendlyPyrightDiagnostic {
  const code = diagnosticCode(diagnostic);
  const values = quotedValues(diagnostic.message);
  const first = values[0];
  const second = values[1];

  if (code === "reportUndefinedVariable") return {
    message: first ? `这个名字还没登场：${first}。` : "这里使用了一个尚未定义的名称。",
    suggestion: "请先创建或导入它，并检查名称的大小写和拼写。",
  };
  if (code === "reportPossiblyUnboundVariable") return {
    message: first ? `${first} 可能还没有拿到值。` : "这个变量在某些分支中可能还没有赋值。",
    suggestion: "请在所有可能执行的分支中为它赋值，或者先提供一个默认值。",
  };
  if (code === "reportMissingImports" || code === "reportMissingModuleSource") return {
    message: first ? `当前 Python 环境里找不到模块 ${first}。` : "当前 Python 环境里找不到这个模块。",
    suggestion: "请确认选中了正确的 Python 解释器，并在该环境中安装对应依赖。",
  };
  if (code === "reportAttributeAccessIssue" || code === "reportOptionalMemberAccess") return {
    message: first ? `这个对象没有可用的 ${first} 属性或方法。` : "这个对象不支持正在访问的属性或方法。",
    suggestion: "请检查对象类型和成员名称；如果对象可能是 None，请先判断它是否存在。",
  };
  if (code === "reportArgumentType") return {
    message: second ? `传给参数 ${second} 的值类型不合适。` : "传入的参数类型和函数要求不一致。",
    suggestion: "请查看函数参数提示，并换成符合要求的字符串、数字、列表或对象。",
  };
  if (code === "reportCallIssue") return {
    message: first ? `调用这里时，参数 ${first} 没有放对位置。` : "这次函数调用的参数数量或名称不正确。",
    suggestion: "请查看参数提示，补齐必填参数，并删除多余或拼错名称的参数。",
  };
  if (code === "reportAssignmentType") return {
    message: first ? `这个值不能直接交给 ${first}。` : "赋值两边的类型对不上。",
    suggestion: "请调整变量类型，或者先把右侧的值转换成目标类型。",
  };
  if (code === "reportReturnType") return {
    message: "函数返回的值和声明的返回类型不一致。",
    suggestion: "请修改 return 后面的值，或者调整函数的返回类型标注。",
  };
  if (code === "reportOperatorIssue") return {
    message: "这个运算符无法处理两边的值。",
    suggestion: "请检查参与运算的类型，例如不要直接把字符串和数字相加。",
  };
  if (code === "reportIndexIssue" || code === "reportOptionalSubscript") return {
    message: "这个值不能按当前方式读取下标。",
    suggestion: "请确认它是列表、元组、字典等可索引对象，并使用正确的下标类型。",
  };
  if (code === "reportOptionalCall") return {
    message: "这个值可能是 None，现在还不能直接调用。",
    suggestion: "请先判断它是否存在，再把它当作函数或方法调用。",
  };
  if (code === "reportRedeclaration") return {
    message: first ? `${first} 在当前范围内被重复声明了。` : "这里出现了重复声明。",
    suggestion: "请删除重复定义，或者为其中一个声明换一个清楚的新名称。",
  };
  if (code === "reportUnusedImport") return {
    message: first ? `导入的 ${first} 还没有被使用。` : "这个导入目前没有被使用。",
    suggestion: "如果后面用不到它，可以删除这条导入，让代码更干净。",
  };
  if (code === "reportUnusedVariable") return {
    message: first ? `变量 ${first} 创建后还没有被使用。` : "这个变量目前没有被使用。",
    suggestion: "请使用这个变量，或者删除不再需要的赋值。",
  };

  return {
    message: "这里的写法和当前类型信息对不上。",
    suggestion: "请检查附近的变量类型、函数参数和成员名称，悬停到相关名称上可以查看 Pyright 推断出的类型。",
  };
}
