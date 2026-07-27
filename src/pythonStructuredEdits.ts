export type PythonStatementStructure = {
  kind: string;
  startLine: number;
  endLine: number;
  summary: string;
  isDocstring: boolean;
};

export type PythonFunctionStructure = {
  name: string;
  kind: "function" | "asyncFunction";
  startLine: number;
  endLine: number;
  bodyStartLine: number;
  bodyEndLine: number;
  column: number;
  statements: PythonStatementStructure[];
};

export type PythonStructure = {
  classes: Array<{ name: string; startLine: number; endLine: number; column: number; methods: PythonFunctionStructure[] }>;
  functions: PythonFunctionStructure[];
  imports: PythonStatementStructure[];
  statements: PythonStatementStructure[];
};

function findFunction(structure: PythonStructure, className: string | undefined, functionName: string) {
  const functions = className
    ? structure.classes.find((item) => item.name === className)?.methods
    : structure.functions;
  if (!functions) throw new Error(`找不到类 ${className}`);
  const target = functions.find((item) => item.name === functionName);
  if (!target) throw new Error(`找不到${className ? `类 ${className} 的` : "顶层"}函数 ${functionName}`);
  return target;
}

function normalizedBodyLines(value: string, indent: string): string[] {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines.at(-1)?.trim()) lines.pop();
  if (!lines.length) throw new Error("结构化编辑内容不能为空");
  const contentIndents = lines.filter((line) => line.trim()).map((line) => line.match(/^\s*/)?.[0].length ?? 0);
  const commonIndent = Math.min(...contentIndents);
  return lines.map((line) => line.trim() ? `${indent}${line.slice(commonIndent)}` : "");
}

function bodyIndent(sourceLines: string[], target: PythonFunctionStructure) {
  const existing = sourceLines[target.bodyStartLine - 1]?.match(/^\s*/)?.[0];
  return existing && existing.length > target.column ? existing : `${" ".repeat(target.column)}    `;
}

export function insertPythonStatements(
  source: string,
  structure: PythonStructure,
  options: { className?: string; functionName: string; position: "start" | "end"; statements: string[] },
): string {
  if (!options.statements.length) throw new Error("statements 不能为空");
  const target = findFunction(structure, options.className, options.functionName);
  const sourceLines = source.split("\n");
  const inserted = normalizedBodyLines(options.statements.join("\n"), bodyIndent(sourceLines, target));
  const onlyPass = target.statements.length === 1 && target.statements[0].kind === "Pass";
  if (onlyPass) sourceLines.splice(target.bodyStartLine - 1, 1, ...inserted);
  else {
    const first = target.statements[0];
    const insertionIndex = options.position === "start"
      ? first?.isDocstring ? first.endLine : target.bodyStartLine - 1
      : target.bodyEndLine;
    sourceLines.splice(insertionIndex, 0, ...inserted);
  }
  return sourceLines.join("\n");
}

export function replacePythonFunctionBody(
  source: string,
  structure: PythonStructure,
  options: { className?: string; functionName: string; body: string },
): string {
  const target = findFunction(structure, options.className, options.functionName);
  const sourceLines = source.split("\n");
  const replacement = normalizedBodyLines(options.body, bodyIndent(sourceLines, target));
  sourceLines.splice(target.bodyStartLine - 1, target.bodyEndLine - target.bodyStartLine + 1, ...replacement);
  return sourceLines.join("\n");
}

export function addPythonImport(source: string, structure: PythonStructure, moduleName: string, names: string[] = []): string {
  if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(moduleName)) throw new Error("module 必须是有效的 Python 模块名");
  if (names.some((name) => !/^[A-Za-z_]\w*$/.test(name))) throw new Error("names 包含无效的 Python 标识符");
  const statement = names.length ? `from ${moduleName} import ${[...new Set(names)].join(", ")}` : `import ${moduleName}`;
  if (source.split("\n").some((line) => line.trim() === statement)) return source;
  const lines = source.split("\n");
  const moduleDocstring = structure.statements[0]?.isDocstring ? structure.statements[0] : undefined;
  const insertionIndex = structure.imports.length
    ? Math.max(...structure.imports.map((item) => item.endLine))
    : moduleDocstring?.endLine ?? 0;
  lines.splice(insertionIndex, 0, statement);
  return lines.join("\n");
}
