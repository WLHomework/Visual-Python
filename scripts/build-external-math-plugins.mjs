import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(root, "src", "plugins", "externalSources");
const outputRoot = path.join(root, "examples", "external-plugins");

const plugins = {
  numpy: {
    exportName: "numpyPlugin",
    manifest: {
      id: "visual-python.numpy",
      name: "NumPy",
      version: "1.1.0",
      apiVersion: "1",
      entry: "index.js",
      targets: ["python"],
      description: "使用 NumPy 数组进行创建、变形、拼接、筛选、统计、数学计算和随机数处理。",
      python: { packages: ["numpy"] },
      agent: {
        description: "使用 NumPy 积木创建、整理、拼接、筛选和计算数组，并生成常用数学函数与随机数代码。",
        fileTypes: [".py", ".vpy"],
        detect: "imports",
      },
    },
  },
  pandas: {
    exportName: "pandasPlugin",
    manifest: {
      id: "visual-python.pandas",
      name: "Pandas",
      version: "1.0.0",
      apiVersion: "1",
      entry: "index.js",
      targets: ["python"],
      description: "使用 Pandas 创建、读取、查看、筛选、排序和导出表格数据。",
      python: { packages: ["pandas", "openpyxl", "xlrd"] },
      agent: {
        description: "使用 Pandas 进行表格数据创建、读取、查看、筛选、排序、统计和 CSV 导出。",
        fileTypes: [".py", ".vpy"],
        detect: "imports",
      },
    },
  },
  matplotlib: {
    exportName: "matplotlibPlugin",
    manifest: {
      id: "visual-python.matplotlib",
      name: "Matplotlib",
      version: "1.0.0",
      apiVersion: "1",
      entry: "index.js",
      targets: ["python"],
      description: "使用 Matplotlib 绘制和保存常见统计图、函数图像与数据图表。",
      python: { packages: ["matplotlib"] },
      agent: {
        description: "使用 Matplotlib 创建图形、绘制常见图表、配置坐标轴和样式，并显示或保存结果。",
        fileTypes: [".py", ".vpy"],
        detect: "imports",
      },
    },
  },
};

const prologue = String.raw`const PLUGIN_API_VERSION = "1";
const Order = {
  ATOMIC: 0, COLLECTION: 1, STRING_CONVERSION: 1, MEMBER: 2.1, FUNCTION_CALL: 2.2,
  EXPONENTIATION: 3, UNARY_SIGN: 4, BITWISE_NOT: 4, MULTIPLICATIVE: 5, ADDITIVE: 6,
  BITWISE_SHIFT: 7, BITWISE_AND: 8, BITWISE_XOR: 9, BITWISE_OR: 10, RELATIONAL: 11,
  LOGICAL_NOT: 12, LOGICAL_AND: 13, LOGICAL_OR: 14, CONDITIONAL: 15, LAMBDA: 16, NONE: 99,
};
const pythonIdentifierSource = "[_\\p{ID_Start}][_\\p{ID_Continue}]*";
const pythonIdentifierPattern = new RegExp("^" + pythonIdentifierSource + "$", "u");
const pythonKeywords = new Set(["False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield"]);
const normalizePythonIdentifier = (value) => String(value || "").trim().normalize("NFKC");
const isPythonIdentifier = (value) => {
  const normalized = normalizePythonIdentifier(value);
  return pythonIdentifierPattern.test(normalized) && !pythonKeywords.has(normalized);
};
const isDottedPythonIdentifier = (value) => {
  const normalized = normalizePythonIdentifier(value);
  return Boolean(normalized) && normalized.split(".").every(isPythonIdentifier);
};
const pythonIdentifierOrFallback = (value, fallback) => {
  const normalized = normalizePythonIdentifier(value);
  return isDottedPythonIdentifier(normalized) ? normalized : fallback;
};
const installFileBlockPickerFields = () => {};
`;

const stripImports = (source) =>
  source
    .replace(/^import[^\n]*;\s*$/gm, "")
    .replace(/^export\s+\{[^}]*\};\s*$/gm, "")
    .trim();

const transpile = (source, file) => {
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      removeComments: false,
      newLine: ts.NewLineKind.LineFeed,
    },
  });
  const errors = (result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    const text = errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n");
    throw new Error(`${file}: ${text}`);
  }
  return result.outputText;
};

const validate = async (pluginPath, expected) => {
  const module = await import(`${pathToFileURL(pluginPath).href}?v=${Date.now()}`);
  const plugin = module.default;
  if (!plugin || typeof plugin.activate !== "function") throw new Error(`${pluginPath}: missing default plugin`);
  const blocks = [];
  const categories = [];
  const generators = new Map();
  const context = {
    pluginId: expected.manifest.id,
    registerBlock(definition, generator) {
      if (!String(definition.type).startsWith(`visual_python_${expected.manifest.id.split(".")[1]}_`)) {
        throw new Error(`${pluginPath}: block ${definition.type} is outside the plugin namespace`);
      }
      blocks.push(definition.type);
      generators.set(definition.type, generator);
    },
    registerToolboxCategory(category) {
      categories.push(category);
    },
    registerSetting() {},
    registerProjectSerializer() {},
    registerCodeDocumentHandler() {},
    registerCommand() {},
    registerAgentTool() {},
    registerWorkspaceValidator() {},
    reportProblem(message) {
      throw new Error(`${pluginPath}: ${message}`);
    },
  };
  await plugin.activate(context);
  if (plugin.manifest.id !== expected.manifest.id) throw new Error(`${pluginPath}: manifest id mismatch`);
  if (blocks.length === 0) throw new Error(`${pluginPath}: no blocks registered`);
  if (categories.length === 0) throw new Error(`${pluginPath}: no toolbox categories registered`);
  if (plugin.manifest.builtin) throw new Error(`${pluginPath}: external plugin must not be builtin`);
  return { blocks: blocks.length, categories: categories.length };
};

for (const [name, config] of Object.entries(plugins)) {
  const sourcePath = path.join(sourceRoot, name, "index.ts");
  const pluginDir = path.join(outputRoot, name);
  await mkdir(pluginDir, { recursive: true });

  const source = await readFile(sourcePath, "utf8");
  let output = stripImports(transpile(source, sourcePath));
  output = output.replace(`export const ${config.exportName}`, `const ${config.exportName}`);
  output = output.replace(/^\s*builtin:\s*(?:true|false),\s*$/gm, "");
  output += `\n\nexport default ${config.exportName};\n`;

  const banner = `// Generated by scripts/build-external-math-plugins.mjs from src/plugins/externalSources/${name}/index.ts.\n// Do not edit by hand; edit the source and rerun the script.\n\n`;
  const entryPath = path.join(pluginDir, "index.js");
  await writeFile(entryPath, banner + prologue + "\n" + output, "utf8");
  await writeFile(path.join(pluginDir, "plugin.json"), `${JSON.stringify(config.manifest, null, 2)}\n`, "utf8");

  const stats = await validate(entryPath, config);
  console.log(`${name}: ${stats.blocks} blocks, ${stats.categories} toolbox categories`);
}
