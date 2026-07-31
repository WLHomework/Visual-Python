import { isPythonIdentifier, pythonIdentifierSource } from "./pythonIdentifiers";

export type PythonCompletionKind = "function" | "class" | "variable" | "builtin" | "keyword" | "snippet";

export type PythonCompletion = {
  label: string;
  kind: PythonCompletionKind;
  insertText: string;
  detail: string;
  documentation?: string;
  sortText: string;
  snippet?: boolean;
  signature?: string;
  parameters?: string[];
  definition?: { lineNumber: number; column: number };
  renameable?: boolean;
};

export type PythonSignature = { label: string; parameters: string[]; documentation?: string };
export type PythonCallContext = { name: string; activeParameter: number };
export type PythonOutlineItem = { label: string; kind: "function" | "class"; lineNumber: number; column: number; signature?: string };

const identifierPattern = new RegExp(`^${pythonIdentifierSource}$`, "u");
const identifierStartPattern = /^[_\p{ID_Start}]$/u;
const identifierContinuePattern = /^[_\p{ID_Continue}]$/u;
const ignoredParameters = new Set(["self", "cls"]);

const positionAtOffset = (source: string, offset: number) => {
  const before = source.slice(0, Math.max(0, offset));
  return {
    lineNumber: before.split("\n").length,
    column: offset - before.lastIndexOf("\n"),
  };
};

export function splitPythonParameters(value: string) {
  const parameters: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  let depth = 0;
  for (const character of value) {
    if (escaped) { current += character; escaped = false; continue; }
    if (character === "\\" && quote) { current += character; escaped = true; continue; }
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') { quote = character; current += character; continue; }
    if (character === "(" || character === "[" || character === "{") depth += 1;
    else if (")]}".includes(character)) depth = Math.max(0, depth - 1);
    if (character === "," && depth === 0) {
      if (current.trim()) parameters.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) parameters.push(current.trim());
  return parameters;
}

const normalizeParameter = (value: string) => {
  const name = value.trim().replace(/^\*{1,2}/, "").split(/[=:]/, 1)[0].trim();
  return identifierPattern.test(name) && !ignoredParameters.has(name) ? name : null;
};

const addVariable = (symbols: Map<string, PythonCompletion>, name: string, detail = "当前代码中的变量", definition?: PythonCompletion["definition"]) => {
  if (!identifierPattern.test(name) || symbols.has(name)) return;
  symbols.set(name, { label: name, kind: "variable", insertText: name, detail, sortText: `0-variable-${name}`, definition });
};

export function collectPythonDocumentSymbols(source: string): PythonCompletion[] {
  const symbols = new Map<string, PythonCompletion>();
  const functionPattern = new RegExp(`^\\s*(?:async\\s+)?def\\s+(${pythonIdentifierSource})\\s*\\((.*)\\)\\s*(?:->\\s*.*?)?:\\s*$`, "gmu");
  for (const match of source.matchAll(functionPattern)) {
    const [, name, rawParameters] = match;
    const matchOffset = match.index ?? 0;
    const nameOffset = matchOffset + match[0].indexOf(name);
    const signatureParameters = splitPythonParameters(rawParameters)
      .filter((parameter) => parameter !== "*" && parameter !== "/" && Boolean(normalizeParameter(parameter)));
    const parameters = signatureParameters.map(normalizeParameter).filter((item): item is string => Boolean(item));
    const placeholders = parameters.map((parameter, index) => `\${${index + 1}:${parameter}}`).join(", ");
    symbols.set(name, {
      label: name,
      kind: "function",
      insertText: `${name}(${placeholders})`,
      detail: `当前代码中的函数 (${parameters.join(", ")})`,
      documentation: parameters.length ? `调用 ${name}，参数：${parameters.join("、")}` : `调用 ${name}`,
      sortText: `0-function-${name}`,
      snippet: true,
      signature: `${name}(${signatureParameters.join(", ")})`,
      parameters: signatureParameters,
      definition: positionAtOffset(source, nameOffset),
    });
    const parameterListOffset = match[0].indexOf("(") + 1;
    let parameterSearchOffset = parameterListOffset;
    for (const parameter of signatureParameters) {
      const parameterName = normalizeParameter(parameter);
      if (!parameterName) continue;
      const parameterOffset = match[0].indexOf(parameter, parameterSearchOffset);
      const parameterNameOffset = match[0].indexOf(parameterName, Math.max(parameterListOffset, parameterOffset));
      addVariable(symbols, parameterName, `函数 ${name} 的参数`, positionAtOffset(source, matchOffset + parameterNameOffset));
      const parameterSymbol = symbols.get(parameterName);
      if (parameterSymbol) parameterSymbol.renameable = false;
      parameterSearchOffset = Math.max(parameterSearchOffset, parameterOffset + parameter.length);
    }
  }

  const classPattern = new RegExp(`^\\s*class\\s+(${pythonIdentifierSource})(?=\\s|\\(|:)`, "gmu");
  for (const match of source.matchAll(classPattern)) {
    const name = match[1];
    const nameOffset = (match.index ?? 0) + match[0].indexOf(name);
    if (!symbols.has(name)) symbols.set(name, { label: name, kind: "class", insertText: name, detail: "当前代码中的类", sortText: `0-class-${name}`, definition: positionAtOffset(source, nameOffset) });
  }

  for (const [lineIndex, line] of source.split(/\r?\n/).entries()) {
    const definitionFor = (name: string) => ({ lineNumber: lineIndex + 1, column: Math.max(1, line.indexOf(name) + 1) });
    const assignment = line.match(new RegExp(`^\\s*(${pythonIdentifierSource})\\s*(?::[^=]+)?\\s*(?:=(?!=)|:=)`, "u"));
    if (assignment) addVariable(symbols, assignment[1], "当前代码中的变量", definitionFor(assignment[1]));

    const annotation = line.match(new RegExp(`^\\s*(${pythonIdentifierSource})\\s*:\\s*[^=]+$`, "u"));
    if (annotation) addVariable(symbols, annotation[1], "当前代码中声明的变量", definitionFor(annotation[1]));

    const loopTargets = line.match(/^\s*(?:async\s+)?for\s+(.+?)\s+in\s+/)?.[1];
    if (loopTargets) {
      for (const name of loopTargets.match(new RegExp(pythonIdentifierSource, "gu")) ?? []) addVariable(symbols, name, "循环变量", definitionFor(name));
    }

    const alias = line.match(new RegExp(`^\\s*(?:with\\s+.+?|except\\s+.*?)\\s+as\\s+(${pythonIdentifierSource})\\s*:?$`, "u"))?.[1];
    if (alias) addVariable(symbols, alias, "上下文变量", definitionFor(alias));

    const importStatement = line.match(/^\s*import\s+(.+)$/)?.[1];
    if (importStatement) {
      for (const item of importStatement.split(",")) {
        const parts = item.trim().split(/\s+as\s+/);
        const name = parts[1] || parts[0].split(".")[0];
        addVariable(symbols, name, "已导入的模块", definitionFor(name));
      }
    }

    const fromImport = line.match(/^\s*from\s+\S+\s+import\s+(.+)$/)?.[1];
    if (fromImport) {
      for (const item of fromImport.split(",")) {
        const parts = item.trim().split(/\s+as\s+/);
        const name = parts[1] || parts[0];
        addVariable(symbols, name, "已导入的名称", definitionFor(name));
      }
    }
  }

  return [...symbols.values()];
}

const builtinDefinitions: Array<[string, string, string, string?]> = [
  ["abs", "abs(number)", "返回数字的绝对值", "abs(${1:number})"],
  ["aiter", "aiter(async_iterable)", "创建异步迭代器", "aiter(${1:async_iterable})"],
  ["all", "all(iterable)", "所有元素都为真时返回 True", "all(${1:iterable})"],
  ["anext", "anext(async_iterator, default?)", "读取异步迭代器的下一项", "anext(${1:async_iterator})"],
  ["any", "any(iterable)", "任一元素为真时返回 True", "any(${1:iterable})"],
  ["ascii", "ascii(value)", "返回仅包含 ASCII 字符的文本表示", "ascii(${1:value})"],
  ["bin", "bin(number)", "把整数转换为二进制文本", "bin(${1:number})"],
  ["bool", "bool(value)", "转换为布尔值", "bool(${1:value})"],
  ["breakpoint", "breakpoint(...)", "进入调试断点", "breakpoint()"],
  ["bytearray", "bytearray(source=...)", "创建可变字节序列", "bytearray(${1:source})"],
  ["bytes", "bytes(source=...)", "创建不可变字节序列", "bytes(${1:source})"],
  ["callable", "callable(value)", "判断对象能否被调用", "callable(${1:value})"],
  ["chr", "chr(number)", "把 Unicode 编码转换为字符", "chr(${1:number})"],
  ["classmethod", "classmethod(function)", "把方法转换为类方法", "classmethod(${1:function})"],
  ["compile", "compile(source, filename, mode)", "编译 Python 源码", "compile(${1:source}, ${2:filename}, ${3:mode})"],
  ["complex", "complex(real, imag=0)", "创建复数", "complex(${1:real}, ${2:imag})"],
  ["delattr", "delattr(object, name)", "删除对象属性", "delattr(${1:object}, ${2:name})"],
  ["dict", "dict(...)", "创建字典", "dict(${1})"],
  ["dir", "dir(value)", "查看对象可用的名称", "dir(${1:value})"],
  ["divmod", "divmod(a, b)", "同时返回商和余数", "divmod(${1:a}, ${2:b})"],
  ["enumerate", "enumerate(iterable, start=0)", "为迭代内容附加序号", "enumerate(${1:iterable})"],
  ["eval", "eval(expression, globals?, locals?)", "计算 Python 表达式", "eval(${1:expression})"],
  ["exec", "exec(code, globals?, locals?)", "执行 Python 代码", "exec(${1:code})"],
  ["filter", "filter(function, iterable)", "筛选迭代内容", "filter(${1:function}, ${2:iterable})"],
  ["float", "float(value)", "转换为浮点数", "float(${1:value})"],
  ["format", "format(value, spec='')", "按格式转换文本", "format(${1:value}, ${2:spec})"],
  ["frozenset", "frozenset(iterable)", "创建不可变集合", "frozenset(${1:iterable})"],
  ["getattr", "getattr(object, name, default?)", "读取对象属性", "getattr(${1:object}, ${2:name})"],
  ["globals", "globals()", "返回全局命名空间字典", "globals()"],
  ["hasattr", "hasattr(object, name)", "判断对象是否有指定属性", "hasattr(${1:object}, ${2:name})"],
  ["hash", "hash(value)", "返回对象的哈希值", "hash(${1:value})"],
  ["help", "help(value)", "显示对象的帮助信息", "help(${1:value})"],
  ["hex", "hex(number)", "把整数转换为十六进制文本", "hex(${1:number})"],
  ["id", "id(value)", "返回对象的唯一标识", "id(${1:value})"],
  ["input", "input(prompt='')", "读取用户输入", "input(${1:prompt})"],
  ["int", "int(value, base=10)", "转换为整数", "int(${1:value})"],
  ["isinstance", "isinstance(value, type)", "判断对象是否属于指定类型", "isinstance(${1:value}, ${2:type})"],
  ["issubclass", "issubclass(class, type)", "判断类是否为指定类型的子类", "issubclass(${1:class}, ${2:type})"],
  ["iter", "iter(value)", "创建迭代器", "iter(${1:value})"],
  ["len", "len(value)", "返回对象长度", "len(${1:value})"],
  ["list", "list(iterable=())", "创建列表", "list(${1:iterable})"],
  ["locals", "locals()", "返回当前局部命名空间字典", "locals()"],
  ["map", "map(function, iterable)", "对每个元素应用函数", "map(${1:function}, ${2:iterable})"],
  ["max", "max(iterable)", "返回最大值", "max(${1:iterable})"],
  ["memoryview", "memoryview(object)", "创建内存视图", "memoryview(${1:object})"],
  ["min", "min(iterable)", "返回最小值", "min(${1:iterable})"],
  ["next", "next(iterator, default?)", "读取迭代器的下一项", "next(${1:iterator})"],
  ["object", "object()", "创建基础对象", "object()"],
  ["oct", "oct(number)", "把整数转换为八进制文本", "oct(${1:number})"],
  ["open", "open(file, mode='r', ...)", "打开文件", "open(${1:file}, ${2:\"r\"})"],
  ["ord", "ord(character)", "返回字符的 Unicode 编码", "ord(${1:character})"],
  ["pow", "pow(base, exponent)", "计算幂", "pow(${1:base}, ${2:exponent})"],
  ["print", "print(value, ..., sep=' ', end='\\n')", "输出内容", "print(${1:value})"],
  ["property", "property(getter, setter?, deleter?)", "创建托管属性", "property(${1:getter})"],
  ["range", "range(start, stop, step=1)", "创建整数序列", "range(${1:stop})"],
  ["repr", "repr(value)", "返回适合调试的文本表示", "repr(${1:value})"],
  ["reversed", "reversed(sequence)", "反向迭代序列", "reversed(${1:sequence})"],
  ["round", "round(number, digits?)", "对数字进行四舍五入", "round(${1:number})"],
  ["set", "set(iterable=())", "创建集合", "set(${1:iterable})"],
  ["setattr", "setattr(object, name, value)", "设置对象属性", "setattr(${1:object}, ${2:name}, ${3:value})"],
  ["slice", "slice(start, stop, step)", "创建切片对象", "slice(${1:start}, ${2:stop}, ${3:step})"],
  ["sorted", "sorted(iterable, key=None, reverse=False)", "返回排序后的列表", "sorted(${1:iterable})"],
  ["staticmethod", "staticmethod(function)", "把方法转换为静态方法", "staticmethod(${1:function})"],
  ["str", "str(value)", "转换为文本", "str(${1:value})"],
  ["sum", "sum(iterable, start=0)", "计算元素总和", "sum(${1:iterable})"],
  ["super", "super(type?, object?)", "访问父类实现", "super()"],
  ["tuple", "tuple(iterable=())", "创建元组", "tuple(${1:iterable})"],
  ["type", "type(value)", "返回对象类型", "type(${1:value})"],
  ["vars", "vars(value?)", "返回对象的属性字典", "vars(${1:value})"],
  ["zip", "zip(*iterables)", "并行组合多个迭代内容", "zip(${1:iterable})"],
  ["__import__", "__import__(name, ...)", "动态导入模块", "__import__(${1:name})"],
];

const builtinCompletions: PythonCompletion[] = builtinDefinitions.map(([label, signature, documentation, insertText]) => ({
  label,
  kind: "builtin",
  insertText: insertText || label,
  detail: `Python 内置函数 · ${signature}`,
  documentation,
  sortText: `2-builtin-${label}`,
  snippet: Boolean(insertText),
  signature,
  parameters: splitPythonParameters(signature.slice(signature.indexOf("(") + 1, signature.lastIndexOf(")"))),
}));

const keywordSnippets: PythonCompletion[] = [
  { label: "if", kind: "snippet", insertText: "if ${1:condition}:\n\t${0:pass}", detail: "条件语句", sortText: "1-snippet-if", snippet: true },
  { label: "for", kind: "snippet", insertText: "for ${1:item} in ${2:iterable}:\n\t${0:pass}", detail: "for 循环", sortText: "1-snippet-for", snippet: true },
  { label: "while", kind: "snippet", insertText: "while ${1:condition}:\n\t${0:pass}", detail: "while 循环", sortText: "1-snippet-while", snippet: true },
  { label: "def", kind: "snippet", insertText: "def ${1:function_name}(${2}):\n\t${0:pass}", detail: "定义函数", sortText: "1-snippet-def", snippet: true },
  { label: "async def", kind: "snippet", insertText: "async def ${1:function_name}(${2}):\n\t${0:pass}", detail: "定义异步函数", sortText: "1-snippet-async-def", snippet: true },
  { label: "class", kind: "snippet", insertText: "class ${1:ClassName}:\n\t${0:pass}", detail: "定义类", sortText: "1-snippet-class", snippet: true },
  { label: "try", kind: "snippet", insertText: "try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:error}:\n\t${0:pass}", detail: "异常处理", sortText: "1-snippet-try", snippet: true },
  { label: "with", kind: "snippet", insertText: "with ${1:expression} as ${2:value}:\n\t${0:pass}", detail: "上下文管理", sortText: "1-snippet-with", snippet: true },
  { label: "match", kind: "snippet", insertText: "match ${1:value}:\n\tcase ${2:pattern}:\n\t\t${0:pass}", detail: "模式匹配", sortText: "1-snippet-match", snippet: true },
];

const snippetLabels = new Set(keywordSnippets.map((item) => item.label));
const pythonKeywords = [
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "case", "continue", "del", "elif", "else", "except", "finally", "from", "global", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "type", "yield",
];
const reservedPythonNames = new Set([...pythonKeywords, ...keywordSnippets.map((item) => item.label)]);
const keywordCompletions: PythonCompletion[] = pythonKeywords
  .filter((label) => !snippetLabels.has(label))
  .map((label) => ({ label, kind: "keyword", insertText: label, detail: "Python 关键字", sortText: `3-keyword-${label}` }));

export function getPythonCompletions(source: string): PythonCompletion[] {
  const completions = new Map<string, PythonCompletion>();
  for (const item of [...collectPythonDocumentSymbols(source), ...keywordSnippets, ...builtinCompletions, ...keywordCompletions]) {
    if (!completions.has(item.label)) completions.set(item.label, item);
  }
  return [...completions.values()];
}

export function getPythonSignatures(source: string) {
  const signatures = new Map<string, PythonSignature[]>();
  for (const item of getPythonCompletions(source)) {
    if (!item.signature || !item.parameters || (item.kind !== "function" && item.kind !== "builtin")) continue;
    signatures.set(item.label, [{ label: item.signature, parameters: item.parameters, documentation: item.documentation }]);
  }
  signatures.set("range", [
    { label: "range(stop)", parameters: ["stop"], documentation: "创建从 0 开始、到 stop 之前结束的整数序列" },
    { label: "range(start, stop, step=1)", parameters: ["start", "stop", "step=1"], documentation: "创建指定起点、终点和步长的整数序列" },
  ]);
  return signatures;
}

export function getPythonOutline(source: string): PythonOutlineItem[] {
  return collectPythonDocumentSymbols(source)
    .filter((item): item is PythonCompletion & { kind: "function" | "class"; definition: NonNullable<PythonCompletion["definition"]> } =>
      (item.kind === "function" || item.kind === "class") && Boolean(item.definition))
    .map((item) => ({
      label: item.label,
      kind: item.kind,
      lineNumber: item.definition.lineNumber,
      column: item.definition.column,
      signature: item.signature,
    }))
    .sort((left, right) => left.lineNumber - right.lineNumber || left.column - right.column);
}

const scanCallText = (value: string, onTopLevelComma?: () => void) => {
  const stack: Array<{ bracket: string; index: number }> = [];
  let quote: "'" | '"' | "'''" | '\"\"\"' | null = null;
  let escaped = false;
  let comment = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (comment) {
      if (character === "\n") comment = false;
      continue;
    }
    if (quote) {
      if (quote.length === 3 && value.slice(index, index + 3) === quote) { quote = null; index += 2; continue; }
      if (escaped) { escaped = false; continue; }
      if (character === "\\") { escaped = true; continue; }
      if (quote.length === 1 && character === quote) quote = null;
      continue;
    }
    if (character === "#") { comment = true; continue; }
    if (value.slice(index, index + 3) === "'''" || value.slice(index, index + 3) === '\"\"\"') {
      quote = value.slice(index, index + 3) as "'''" | '\"\"\"';
      index += 2;
      continue;
    }
    if (character === "'" || character === '"') { quote = character; continue; }
    if (character === "(" || character === "[" || character === "{") { stack.push({ bracket: character, index }); continue; }
    if (")]}".includes(character)) {
      const expected = character === ")" ? "(" : character === "]" ? "[" : "{";
      const matchingIndex = stack.findLastIndex((item) => item.bracket === expected);
      if (matchingIndex >= 0) stack.splice(matchingIndex, 1);
      continue;
    }
    if (character === "," && stack.length === 0) onTopLevelComma?.();
  }
  return stack;
};

export function findPythonCallContext(source: string, offset = source.length): PythonCallContext | null {
  const beforeCursor = source.slice(0, Math.max(0, offset));
  const stack = scanCallText(beforeCursor);
  const call = stack.findLast((item) => item.bracket === "(");
  if (!call) return null;
  const beforeCall = beforeCursor.slice(0, call.index);
  const nameMatch = beforeCall.match(new RegExp(`(${pythonIdentifierSource})\\s*$`, "u"));
  if (!nameMatch) return null;
  const nameStart = beforeCall.length - nameMatch[0].length;
  if (beforeCall.slice(0, nameStart).trimEnd().endsWith(".")) return null;
  let activeParameter = 0;
  scanCallText(beforeCursor.slice(call.index + 1), () => { activeParameter += 1; });
  return { name: nameMatch[1], activeParameter };
}

export function isPythonCompletionContext(textBeforeWord: string) {
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (const character of textBeforeWord) {
    if (escaped) { escaped = false; continue; }
    if (character === "\\" && quote) { escaped = true; continue; }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') { quote = character; continue; }
    if (character === "#") return false;
  }
  if (quote) return false;
  return !textBeforeWord.trimEnd().endsWith(".");
}

export function isValidPythonIdentifier(value: string) {
  return isPythonIdentifier(value) && !reservedPythonNames.has(value);
}

export type PythonIdentifierOccurrence = { lineNumber: number; startColumn: number; endColumn: number };

export function findPythonIdentifierOccurrences(source: string, name: string): PythonIdentifierOccurrence[] {
  if (!identifierPattern.test(name)) return [];
  const occurrences: PythonIdentifierOccurrence[] = [];
  let quote: "'" | '"' | "'''" | '\"\"\"' | null = null;
  let escaped = false;
  let comment = false;
  let lineNumber = 1;
  let lineStart = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\n") {
      lineNumber += 1;
      lineStart = index + 1;
      comment = false;
      if (!quote || quote.length === 1) quote = null;
      continue;
    }
    if (comment) continue;
    if (quote) {
      if (quote.length === 3 && source.slice(index, index + 3) === quote) { quote = null; index += 2; continue; }
      if (escaped) { escaped = false; continue; }
      if (character === "\\") { escaped = true; continue; }
      if (quote.length === 1 && character === quote) quote = null;
      continue;
    }
    if (character === "#") { comment = true; continue; }
    if (source.slice(index, index + 3) === "'''" || source.slice(index, index + 3) === '\"\"\"') {
      quote = source.slice(index, index + 3) as "'''" | '\"\"\"';
      index += 2;
      continue;
    }
    if (character === "'" || character === '"') { quote = character; continue; }
    if (!identifierStartPattern.test(character)) continue;
    let end = index + 1;
    while (end < source.length && identifierContinuePattern.test(source[end])) end += 1;
    const token = source.slice(index, end);
    if (token === name) {
      const previousText = source.slice(lineStart, index).trimEnd();
      const afterToken = source.slice(end).match(/^\s*/)?.[0].length ?? 0;
      const nextCharacter = source[end + afterToken];
      const nextNextCharacter = source[end + afterToken + 1];
      const keywordArgument = nextCharacter === "=" && nextNextCharacter !== "=" && Boolean(findPythonCallContext(source, index));
      if (!previousText.endsWith(".") && !keywordArgument) {
        occurrences.push({ lineNumber, startColumn: index - lineStart + 1, endColumn: end - lineStart + 1 });
      }
    }
    index = end - 1;
  }
  return occurrences;
}
