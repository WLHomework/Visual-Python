import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as Blockly from "blockly/core";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { OnMount } from "@monaco-editor/react";
import type { CancellationToken as MonacoCancellationToken, editor as MonacoEditor, IRange as MonacoRange, languages as MonacoLanguages, Position as MonacoPosition } from "monaco-editor";
import { AlignLeft, Blocks, BookOpen, Box, Braces, Check, ChevronDown, ChevronRight, Code2, Columns2, Copy, Download, ExternalLink, FileCode2, FilePlus2, Film, FolderOpen, Keyboard, ListOrdered, ListTree, Minimize2, Minus, PanelBottomClose, PanelBottomOpen, Play, Plug, Power, RefreshCw, Replace, Save, SaveAll, Search, Send, Settings, Square, Terminal, Trash2, Undo2, Redo2, X } from "lucide-react";
import { defaultVisualThemeId, generateWorkspacePython, generateWorkspacePythonWithBlockMap, registerUsedVariablesToolbox, starterState, toolbox, visualPythonThemes, type VisualThemeId } from "./pythonBlocks";
import { validatePythonBlockContexts, type PythonContextIssue } from "./pythonSyntaxBlocks";
import { diagnosePythonError } from "./pythonDiagnostics";
import { findPythonCallContext, findPythonIdentifierOccurrences, getPythonCompletions, getPythonOutline, getPythonSignatures, isPythonCompletionContext, isValidPythonIdentifier, type PythonCompletionKind, type PythonOutlineItem } from "./pythonCompletions";
import { parsePythonRuntimeDiagnostic } from "./pythonRuntimeDiagnostics";
import { parsePythonSyntaxDiagnostic, type PythonCodeDiagnostic } from "./pythonSyntaxDiagnostics";
import { formatPythonSource } from "./pythonFormatter";
import { editorFontSizeMax, editorFontSizeMin, editorIndentSizes, normalizeEditorFontSize, normalizeEditorIndentSize, type EditorFontSize, type EditorIndentSize } from "./editorPreferences";
import { PyrightClient, type LspCompletionItem, type LspDiagnostic, type LspHover, type LspLocation, type LspLocationLink, type LspRange, type LspSignatureHelp, type LspWorkspaceEdit } from "./pyrightClient";
import { formatPyrightDiagnostic } from "./pyrightDiagnostics";
import type { ExampleProject } from "./examples/types";
import { ensureProjectPlugins, getPluginEnabledPreference, pluginRegistry, setPluginEnabled } from "./plugins";
import type { ExternalPluginDiscovery, ExternalPluginDiscoveryResponse, ExternalPluginEntry, PluginProjectState, PluginRecord, VisualPythonPlugin } from "./plugins/api/types";
import { getManimRenderConfig, setManimRenderConfig, subscribeManimRenderConfig, type ManimRenderConfig } from "./plugins/builtin/manim/renderConfig";
import { formatRenderElapsed, initialManimRenderProgress, parseManimRenderProgress, type ManimRenderProgress } from "./plugins/builtin/manim/renderProgress";
import { extractManimSceneNames } from "./plugins/builtin/manim/sceneNames";
import { isBlockWorkspaceMode, normalizeWorkspaceMode, type WorkspaceMode } from "./workspaceMode";
import { getWorkbenchShortcutAction } from "./workbenchShortcuts";
import { blockSearchFlyout, createBlockSearchIndex, searchBlockIndex } from "./blockSearch";
import { buildBlockOutline, filterBlockOutline, type BlockOutlineNode } from "./blockOutline";
import { subscribeFormulaEditor, type FormulaEditorRequest } from "./formulaEditorBridge";

type ProjectFile = { version: 1; name: string; workspace: object; plugins?: PluginProjectState; sourceCode?: string; workspaceMode?: WorkspaceMode };
type DraftProject = ProjectFile & { path: string | null; savedAt: number };
type RecentProject = { path: string; name: string; openedAt: number };
type ManimVideoPreview = { scene: string; path: string; url: string; workDir: string };
type OutputEntry = { id: number; stream: "stdout" | "stderr" | "system" | "input"; data: string };
type PythonOutputEvent = { task_id: number; stream: OutputEntry["stream"]; data: string };
type PythonFinishedEvent = { task_id: number; exit_code: number; stopped: boolean; timed_out: boolean };
type PackageInstallOutputEvent = { stream: OutputEntry["stream"]; data: string };
type PackageInstallFinishedEvent = { success: boolean; stopped: boolean; error?: string | null; packages: string[] };
type ManimOutputEvent = { stream: OutputEntry["stream"]; data: string };
type ManimFinishedEvent = { success: boolean; stopped: boolean; scene: string; work_dir: string; video_path?: string | null; error?: string | null };
type ManimStorageInfo = { path: string; sizeBytes: number; renderCount: number };
type OpenProjectEvent = { path: string };
type CloseBehavior = "ask" | "tray" | "exit";
type SettingsSection = "appearance" | "editor" | "python" | "behavior";
type ManimSettingsSection = "output" | "renderer" | "storage";
type ConsolePanel = "output" | "problems" | "video";
type ConsoleContextMenuState = { x: number; y: number; panel: ConsolePanel; problemId?: string; selectedText: string };
type PythonEnvironment = { path: string; version: string; implementation: string; virtual_env: boolean };
type PythonPackageStatus = { name: string; installed: boolean };
type ProblemKind = "context" | "syntax" | "runtime" | "timeout" | "environment" | "plugin";
type CodeProblem = { id: number | string; kind: ProblemKind; line: number; message: string; blockId?: string; suggestion?: string };
const contextIssuesToProblems = (issues: PythonContextIssue[]): CodeProblem[] => issues.map((issue) => ({
  id: `context-${issue.blockId}`,
  kind: "context",
  line: 0,
  message: issue.message,
  blockId: issue.blockId,
}));
const themeOptions: Array<{ id: VisualThemeId; label: string; description: string }> = [
  { id: "visual-dark", label: "Visual Dark", description: "深色环境" },
  { id: "visual-light", label: "Visual Light", description: "默认明亮" },
  { id: "one-dark", label: "One Dark", description: "柔和深色" },
  { id: "high-contrast", label: "High Contrast", description: "高对比度" },
];
const monacoThemes: Record<VisualThemeId, "vs" | "vs-dark" | "hc-black"> = {
  "visual-dark": "vs-dark", "visual-light": "vs", "one-dark": "vs-dark", "high-contrast": "hc-black",
};
const appWindow = getCurrentWindow();
const pluginStateLabels = { discovered: "已发现", disabled: "已禁用", loading: "加载中", active: "已启用", error: "加载失败" } as const;
const pipMirrorUrl = "https://pypi.tuna.tsinghua.edu.cn/simple";
const outputEntryLimit = 1800;
const Editor = lazy(() => import("@monaco-editor/react"));
const FormulaEditorDialog = lazy(() => import("./FormulaEditorDialog"));
const codeDiagnosticMarkerOwner = "visual-python-code-diagnostic";
const pyrightDiagnosticMarkerOwner = "visual-python-pyright-diagnostic";

const renderCodeDiagnostic = (
  editor: Parameters<OnMount>[0],
  monaco: Parameters<OnMount>[1],
  decorations: MonacoEditor.IEditorDecorationsCollection,
  diagnostic: PythonCodeDiagnostic | null,
) => {
  const model = editor.getModel();
  if (!model) return;
  if (!diagnostic) {
    monaco.editor.setModelMarkers(model, codeDiagnosticMarkerOwner, []);
    decorations.clear();
    return;
  }
  const line = Math.min(Math.max(1, diagnostic.line), model.getLineCount());
  const maxColumn = model.getLineMaxColumn(line);
  const startColumn = Math.min(Math.max(1, diagnostic.startColumn), maxColumn);
  const endColumn = Math.min(Math.max(startColumn, diagnostic.endColumn), maxColumn);
  monaco.editor.setModelMarkers(model, codeDiagnosticMarkerOwner, [{
    severity: monaco.MarkerSeverity.Error,
    source: "Python 语法检查",
    message: `${diagnostic.message}\n${diagnostic.suggestion}`,
    startLineNumber: line,
    startColumn,
    endLineNumber: line,
    endColumn,
  }]);
  decorations.set([{
    range: new monaco.Range(line, maxColumn, line, maxColumn),
    options: {
      isWholeLine: true,
      className: "code-line-diagnostic",
      after: { content: `  ${diagnostic.message}`, inlineClassName: "code-inline-diagnostic", cursorStops: monaco.editor.InjectedTextCursorStops.None },
    },
  }]);
};
const renderPyrightDiagnostics = (
  editor: Parameters<OnMount>[0],
  monaco: Parameters<OnMount>[1],
  decorations: MonacoEditor.IEditorDecorationsCollection,
  diagnostics: LspDiagnostic[],
) => {
  const model = editor.getModel();
  if (!model) return;
  const markerSeverity = (severity?: LspDiagnostic["severity"]) => ({
    1: monaco.MarkerSeverity.Error,
    2: monaco.MarkerSeverity.Warning,
    3: monaco.MarkerSeverity.Info,
    4: monaco.MarkerSeverity.Hint,
  })[severity ?? 1];
  const positioned = diagnostics.map((diagnostic) => {
    const startLineNumber = Math.min(Math.max(1, diagnostic.range.start.line + 1), model.getLineCount());
    const endLineNumber = Math.min(Math.max(startLineNumber, diagnostic.range.end.line + 1), model.getLineCount());
    const startColumn = Math.min(Math.max(1, diagnostic.range.start.character + 1), model.getLineMaxColumn(startLineNumber));
    const endColumn = Math.min(
      Math.max(endLineNumber === startLineNumber ? startColumn : 1, diagnostic.range.end.character + 1),
      model.getLineMaxColumn(endLineNumber),
    );
    return { diagnostic, startLineNumber, startColumn, endLineNumber, endColumn };
  });
  monaco.editor.setModelMarkers(model, pyrightDiagnosticMarkerOwner, positioned.map((item) => {
    const friendly = formatPyrightDiagnostic(item.diagnostic);
    return {
      severity: markerSeverity(item.diagnostic.severity),
      source: "Pyright",
      code: typeof item.diagnostic.code === "object" ? String(item.diagnostic.code.value) : item.diagnostic.code,
      message: `${friendly.message}\n${friendly.suggestion}`,
      startLineNumber: item.startLineNumber,
      startColumn: item.startColumn,
      endLineNumber: item.endLineNumber,
      endColumn: item.endColumn,
    };
  }));
  const inlineByLine = new Map<number, typeof positioned[number]>();
  for (const item of positioned) {
    if ((item.diagnostic.severity ?? 1) > 2) continue;
    const current = inlineByLine.get(item.startLineNumber);
    if (!current || (item.diagnostic.severity ?? 1) < (current.diagnostic.severity ?? 1)) inlineByLine.set(item.startLineNumber, item);
  }
  decorations.set([...inlineByLine.values()].map((item) => {
    const friendly = formatPyrightDiagnostic(item.diagnostic);
    const maxColumn = model.getLineMaxColumn(item.startLineNumber);
    return {
      range: new monaco.Range(item.startLineNumber, maxColumn, item.startLineNumber, maxColumn),
      options: {
        isWholeLine: true,
        className: "code-line-diagnostic",
        after: { content: `  ${friendly.message}`, inlineClassName: "code-inline-diagnostic", cursorStops: monaco.editor.InjectedTextCursorStops.None },
      },
    };
  }));
};

type PyrightMonacoCompletionItem = MonacoLanguages.CompletionItem & { pyrightItem?: LspCompletionItem; pyrightDefaultRange?: MonacoRange };

const lspRangeToMonaco = (monaco: Parameters<OnMount>[1], range: LspRange) => new monaco.Range(
  range.start.line + 1,
  range.start.character + 1,
  range.end.line + 1,
  range.end.character + 1,
);

const pyrightCompletionKind = (monaco: Parameters<OnMount>[1], kind?: number) => ({
  1: monaco.languages.CompletionItemKind.Text,
  2: monaco.languages.CompletionItemKind.Method,
  3: monaco.languages.CompletionItemKind.Function,
  4: monaco.languages.CompletionItemKind.Constructor,
  5: monaco.languages.CompletionItemKind.Field,
  6: monaco.languages.CompletionItemKind.Variable,
  7: monaco.languages.CompletionItemKind.Class,
  8: monaco.languages.CompletionItemKind.Interface,
  9: monaco.languages.CompletionItemKind.Module,
  10: monaco.languages.CompletionItemKind.Property,
  11: monaco.languages.CompletionItemKind.Unit,
  12: monaco.languages.CompletionItemKind.Value,
  13: monaco.languages.CompletionItemKind.Enum,
  14: monaco.languages.CompletionItemKind.Keyword,
  15: monaco.languages.CompletionItemKind.Snippet,
  17: monaco.languages.CompletionItemKind.File,
  18: monaco.languages.CompletionItemKind.Reference,
  21: monaco.languages.CompletionItemKind.Constant,
  22: monaco.languages.CompletionItemKind.Struct,
  23: monaco.languages.CompletionItemKind.Event,
  24: monaco.languages.CompletionItemKind.Operator,
  25: monaco.languages.CompletionItemKind.TypeParameter,
}[kind || 1] ?? monaco.languages.CompletionItemKind.Text);

const mapPyrightCompletionItem = (
  monaco: Parameters<OnMount>[1],
  item: LspCompletionItem,
  defaultRange: MonacoRange,
): PyrightMonacoCompletionItem => {
  const textEdit = item.textEdit;
  const editRange = textEdit ? ("range" in textEdit ? textEdit.range : textEdit.replace) : undefined;
  const documentation = typeof item.documentation === "string" ? item.documentation : item.documentation?.value;
  return {
    label: item.label,
    kind: pyrightCompletionKind(monaco, item.kind),
    detail: item.detail,
    documentation: documentation ? { value: documentation } : undefined,
    sortText: item.sortText,
    filterText: item.filterText,
    insertText: textEdit?.newText ?? item.insertText ?? item.label,
    insertTextRules: item.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : monaco.languages.CompletionItemInsertTextRule.None,
    range: editRange ? lspRangeToMonaco(monaco, editRange) : defaultRange,
    additionalTextEdits: item.additionalTextEdits?.map((edit) => ({ range: lspRangeToMonaco(monaco, edit.range), text: edit.newText })),
    commitCharacters: item.commitCharacters,
    pyrightItem: item,
    pyrightDefaultRange: defaultRange,
  };
};

const registerPythonCompletionProvider = (monaco: Parameters<OnMount>[1], getPyrightClient: () => PyrightClient | null) => {
  let cachedModel: MonacoEditor.ITextModel | null = null;
  let cachedVersion = -1;
  let cachedCompletions = getPythonCompletions("");
  return monaco.languages.registerCompletionItemProvider("python", {
    triggerCharacters: ["."],
    async provideCompletionItems(model: MonacoEditor.ITextModel, position: MonacoPosition, _context: MonacoLanguages.CompletionContext, token: MonacoCancellationToken) {
      const word = model.getWordUntilPosition(position);
      const textBeforeWord = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
      const staticContext = isPythonCompletionContext(textBeforeWord);
      const memberContext = textBeforeWord.trimEnd().endsWith(".") && isPythonCompletionContext(textBeforeWord.replace(/\.\s*$/, ""));
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };
      const pyright = getPyrightClient();
      if (pyright?.isReady() && (staticContext || memberContext)) {
        try {
          const completion = await pyright.complete(model.getValue(), position.lineNumber - 1, position.column - 1);
          if (completion && !token.isCancellationRequested) {
            return { suggestions: completion.items.map((item) => mapPyrightCompletionItem(monaco, item, range)), incomplete: completion.isIncomplete };
          }
        } catch {
          // Keep the editor usable while the language server restarts.
        }
      }
      if (!staticContext) return { suggestions: [] };
      if (cachedModel !== model || cachedVersion !== model.getVersionId()) {
        cachedModel = model;
        cachedVersion = model.getVersionId();
        cachedCompletions = getPythonCompletions(model.getValue());
      }
      const kinds: Record<PythonCompletionKind, number> = {
        function: monaco.languages.CompletionItemKind.Function,
        class: monaco.languages.CompletionItemKind.Class,
        variable: monaco.languages.CompletionItemKind.Variable,
        builtin: monaco.languages.CompletionItemKind.Function,
        keyword: monaco.languages.CompletionItemKind.Keyword,
        snippet: monaco.languages.CompletionItemKind.Snippet,
      };
      return {
        suggestions: cachedCompletions.map((item) => ({
          label: item.label,
          kind: kinds[item.kind],
          insertText: item.insertText,
          insertTextRules: item.snippet
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet | monaco.languages.CompletionItemInsertTextRule.KeepWhitespace
            : monaco.languages.CompletionItemInsertTextRule.None,
          detail: item.detail,
          documentation: item.documentation,
          sortText: item.sortText,
          range,
        })),
      };
    },
    async resolveCompletionItem(item: MonacoLanguages.CompletionItem, token: MonacoCancellationToken) {
      const semanticItem = item as PyrightMonacoCompletionItem;
      const pyright = getPyrightClient();
      if (!semanticItem.pyrightItem || !semanticItem.pyrightDefaultRange || !pyright?.isReady()) return item;
      try {
        const resolved = await pyright.resolveCompletion(semanticItem.pyrightItem);
        return token.isCancellationRequested ? item : mapPyrightCompletionItem(monaco, resolved, semanticItem.pyrightDefaultRange);
      } catch {
        return item;
      }
    },
  });
};

const lspDocumentation = (documentation?: string | { kind: "markdown" | "plaintext"; value: string }) => {
  if (!documentation) return undefined;
  return typeof documentation === "string" ? documentation : { value: documentation.value };
};

const mapPyrightSignatureHelp = (help: LspSignatureHelp): MonacoLanguages.SignatureHelpResult => {
  const activeSignature = Math.min(Math.max(0, help.activeSignature ?? 0), Math.max(0, help.signatures.length - 1));
  const activeParameters = help.signatures[activeSignature]?.parameters ?? [];
  const activeParameter = activeParameters.length
    ? Math.min(Math.max(0, help.activeParameter ?? 0), activeParameters.length - 1)
    : 0;
  return {
    value: {
      signatures: help.signatures.map((signature, index) => ({
        label: signature.label,
        documentation: lspDocumentation(signature.documentation),
        parameters: (signature.parameters ?? []).map((parameter) => ({
          label: parameter.label,
          documentation: lspDocumentation(parameter.documentation),
        })),
        activeParameter: index === activeSignature ? activeParameter : signature.activeParameter,
      })),
      activeSignature,
      activeParameter,
    },
    dispose() {},
  };
};

const lspHoverContents = (hover: LspHover) => {
  const contents = Array.isArray(hover.contents) ? hover.contents : [hover.contents];
  return contents.map((content) => {
    if (typeof content === "string") return { value: content };
    if ("kind" in content) return { value: content.value };
    return { value: `\`\`\`${content.language}\n${content.value}\n\`\`\`` };
  });
};

const lspDefinitionLocations = (result: LspLocation | LspLocationLink | Array<LspLocation | LspLocationLink>) => (
  Array.isArray(result) ? result : [result]
);

const isLspLocationLink = (location: LspLocation | LspLocationLink): location is LspLocationLink => "targetUri" in location;

const currentDocumentWorkspaceEdits = (
  monaco: Parameters<OnMount>[1],
  model: MonacoEditor.ITextModel,
  documentUri: string,
  edit: LspWorkspaceEdit,
) => {
  const textEdits: Array<{ range: LspRange; newText: string }> = [];
  let hasExternalEdits = false;
  for (const [uri, edits] of Object.entries(edit.changes ?? {})) {
    if (uri === documentUri) textEdits.push(...edits);
    else if (edits.length) hasExternalEdits = true;
  }
  for (const change of edit.documentChanges ?? []) {
    if (!("textDocument" in change)) {
      hasExternalEdits = true;
      continue;
    }
    if (change.textDocument.uri === documentUri) textEdits.push(...change.edits);
    else if (change.edits.length) hasExternalEdits = true;
  }
  return {
    hasExternalEdits,
    edits: textEdits.map((textEdit) => ({
      resource: model.uri,
      versionId: model.getVersionId(),
      textEdit: { range: lspRangeToMonaco(monaco, textEdit.range), text: textEdit.newText },
    })),
  };
};

const registerPythonSignatureHelpProvider = (monaco: Parameters<OnMount>[1], getPyrightClient: () => PyrightClient | null) => {
  let cachedModel: MonacoEditor.ITextModel | null = null;
  let cachedVersion = -1;
  let cachedSignatures = getPythonSignatures("");
  return monaco.languages.registerSignatureHelpProvider("python", {
    signatureHelpTriggerCharacters: ["(", ","],
    signatureHelpRetriggerCharacters: [",", ")"],
    async provideSignatureHelp(model: MonacoEditor.ITextModel, position: MonacoPosition, token: MonacoCancellationToken, context: MonacoLanguages.SignatureHelpContext) {
      const source = model.getValue();
      const pyright = getPyrightClient();
      if (pyright?.isReady()) {
        try {
          const help = await pyright.signatureHelp(source, position.lineNumber - 1, position.column - 1, {
            triggerKind: context.triggerKind,
            triggerCharacter: context.triggerCharacter,
            isRetrigger: context.isRetrigger,
          });
          if (help?.signatures.length && !token.isCancellationRequested) return mapPyrightSignatureHelp(help);
        } catch {
          // Fall back to local signatures while Pyright restarts.
        }
      }
      const fallbackContext = findPythonCallContext(source, model.getOffsetAt(position));
      if (!fallbackContext) return null;
      if (cachedModel !== model || cachedVersion !== model.getVersionId()) {
        cachedModel = model;
        cachedVersion = model.getVersionId();
        cachedSignatures = getPythonSignatures(source);
      }
      const signatures = cachedSignatures.get(fallbackContext.name);
      if (!signatures?.length) return null;
      const matchingSignature = signatures.findIndex((signature) => fallbackContext.activeParameter < signature.parameters.length);
      const activeSignature = matchingSignature >= 0 ? matchingSignature : signatures.length - 1;
      const selectedSignature = signatures[activeSignature];
      const activeParameter = selectedSignature.parameters.length
        ? Math.min(fallbackContext.activeParameter, selectedSignature.parameters.length - 1)
        : 0;
      return {
        value: {
          signatures: signatures.map((signature) => ({
            label: signature.label,
            documentation: signature.documentation,
            parameters: signature.parameters.map((label) => ({ label })),
          })),
          activeSignature,
          activeParameter,
        },
        dispose() {},
      };
    },
  });
};

const registerPythonNavigationProviders = (monaco: Parameters<OnMount>[1], getPyrightClient: () => PyrightClient | null) => {
  let cachedModel: MonacoEditor.ITextModel | null = null;
  let cachedVersion = -1;
  let cachedItems = new Map(getPythonCompletions("").map((item) => [item.label, item]));
  const itemsFor = (model: MonacoEditor.ITextModel) => {
    if (cachedModel !== model || cachedVersion !== model.getVersionId()) {
      cachedModel = model;
      cachedVersion = model.getVersionId();
      cachedItems = new Map(getPythonCompletions(model.getValue()).map((item) => [item.label, item]));
    }
    return cachedItems;
  };
  const wordAt = (model: MonacoEditor.ITextModel, position: MonacoPosition) => {
    const word = model.getWordAtPosition(position);
    if (!word) return null;
    const textBeforeWord = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
    return isPythonCompletionContext(textBeforeWord) ? word : null;
  };
  const hoverProvider = monaco.languages.registerHoverProvider("python", {
    async provideHover(model: MonacoEditor.ITextModel, position: MonacoPosition, token: MonacoCancellationToken) {
      const pyright = getPyrightClient();
      if (pyright?.isReady()) {
        try {
          const hover = await pyright.hover(model.getValue(), position.lineNumber - 1, position.column - 1);
          if (token.isCancellationRequested) return null;
          return hover ? {
            range: hover.range ? lspRangeToMonaco(monaco, hover.range) : undefined,
            contents: lspHoverContents(hover),
          } : null;
        } catch {
          // Fall back to the local index while Pyright restarts.
        }
      }
      const word = wordAt(model, position);
      if (!word) return null;
      const item = itemsFor(model).get(word.word);
      if (!item) return null;
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [
          { value: `\`\`\`python\n${item.signature || item.label}\n\`\`\`` },
          { value: item.documentation ? `${item.detail}\n\n${item.documentation}` : item.detail },
        ],
      };
    },
  });
  const definitionProvider = monaco.languages.registerDefinitionProvider("python", {
    async provideDefinition(model: MonacoEditor.ITextModel, position: MonacoPosition, token: MonacoCancellationToken) {
      const pyright = getPyrightClient();
      if (pyright?.isReady()) {
        try {
          const result = await pyright.definition(model.getValue(), position.lineNumber - 1, position.column - 1);
          if (token.isCancellationRequested) return null;
          if (!result) return null;
          const locations = lspDefinitionLocations(result).flatMap((location) => {
            const uri = isLspLocationLink(location) ? location.targetUri : location.uri;
            if (uri !== pyright.getDocumentUri()) return [];
            const range = isLspLocationLink(location) ? location.targetSelectionRange : location.range;
            return [{ uri: model.uri, range: lspRangeToMonaco(monaco, range) }];
          });
          return locations.length ? locations : null;
        } catch {
          // Fall back to the local index while Pyright restarts.
        }
      }
      const word = wordAt(model, position);
      if (!word) return null;
      const item = itemsFor(model).get(word.word);
      if (!item?.definition) return null;
      return {
        uri: model.uri,
        range: new monaco.Range(item.definition.lineNumber, item.definition.column, item.definition.lineNumber, item.definition.column + item.label.length),
      };
    },
  });
  const referenceProvider = monaco.languages.registerReferenceProvider("python", {
    async provideReferences(model: MonacoEditor.ITextModel, position: MonacoPosition, context: MonacoLanguages.ReferenceContext, token: MonacoCancellationToken) {
      const pyright = getPyrightClient();
      if (pyright?.isReady()) {
        try {
          const references = await pyright.references(model.getValue(), position.lineNumber - 1, position.column - 1, context.includeDeclaration);
          if (token.isCancellationRequested) return null;
          if (!references) return null;
          const locations = references
            .filter((location) => location.uri === pyright.getDocumentUri())
            .map((location) => ({ uri: model.uri, range: lspRangeToMonaco(monaco, location.range) }));
          return locations.length ? locations : null;
        } catch {
          // Fall back to the local index while Pyright restarts.
        }
      }
      const word = wordAt(model, position);
      if (!word) return null;
      const item = itemsFor(model).get(word.word);
      if (!item?.definition) return null;
      const occurrences = findPythonIdentifierOccurrences(model.getValue(), word.word);
      if (context.includeDeclaration && !occurrences.some((occurrence) => occurrence.lineNumber === item.definition?.lineNumber && occurrence.startColumn === item.definition.column)) {
        occurrences.unshift({ lineNumber: item.definition.lineNumber, startColumn: item.definition.column, endColumn: item.definition.column + item.label.length });
      }
      return occurrences
        .filter((occurrence) => context.includeDeclaration || occurrence.lineNumber !== item.definition?.lineNumber || occurrence.startColumn !== item.definition.column)
        .map((occurrence) => ({
          uri: model.uri,
          range: new monaco.Range(occurrence.lineNumber, occurrence.startColumn, occurrence.lineNumber, occurrence.endColumn),
        }));
    },
  });
  const renameProvider = monaco.languages.registerRenameProvider("python", {
    async resolveRenameLocation(model: MonacoEditor.ITextModel, position: MonacoPosition, token: MonacoCancellationToken) {
      const pyright = getPyrightClient();
      if (pyright?.isReady()) {
        try {
          const prepared = await pyright.prepareRename(model.getValue(), position.lineNumber - 1, position.column - 1);
          if (token.isCancellationRequested) return null;
          if (prepared) {
            const range = "range" in prepared ? prepared.range : prepared;
            const monacoRange = lspRangeToMonaco(monaco, range);
            return {
              range: monacoRange,
              text: "placeholder" in prepared ? prepared.placeholder : model.getValueInRange(monacoRange),
            };
          }
        } catch {
          // Fall back to the local index while Pyright restarts.
        }
      }
      const word = wordAt(model, position);
      if (!word) return null;
      const item = itemsFor(model).get(word.word);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      if (!item?.definition) return { range, text: word.word, rejectReason: "只能重命名当前代码中已经定义的名称。" };
      if (item.renameable === false) return { range, text: word.word, rejectReason: "函数参数暂不支持自动重命名，请手动确认关键字参数调用。" };
      return { range, text: word.word };
    },
    async provideRenameEdits(model: MonacoEditor.ITextModel, position: MonacoPosition, newName: string, token: MonacoCancellationToken) {
      const word = wordAt(model, position);
      const pyright = getPyrightClient();
      if (word && pyright?.isReady() && isValidPythonIdentifier(newName)) {
        try {
          const edit = await pyright.rename(model.getValue(), position.lineNumber - 1, position.column - 1, newName);
          if (token.isCancellationRequested) return { edits: [] };
          if (edit) {
            const mapped = currentDocumentWorkspaceEdits(monaco, model, pyright.getDocumentUri(), edit);
            if (!mapped.hasExternalEdits && mapped.edits.length) return { edits: mapped.edits };
          }
        } catch {
          // Fall back to the local index while Pyright restarts.
        }
      }
      if (!word) return { edits: [], rejectReason: "这里没有可以重命名的名称。" };
      const items = itemsFor(model);
      const item = items.get(word.word);
      if (!item?.definition || item.renameable === false) return { edits: [], rejectReason: "这个名称暂不支持自动重命名。" };
      if (!isValidPythonIdentifier(newName)) return { edits: [], rejectReason: "新名称需要是合法的 Python 标识符，并且不能使用关键字。" };
      const collision = items.get(newName);
      if (newName !== word.word && collision) return { edits: [], rejectReason: `名称“${newName}”已经被当前代码或 Python 内置功能使用。` };
      const occurrences = findPythonIdentifierOccurrences(model.getValue(), word.word);
      if (!occurrences.length) return { edits: [], rejectReason: "没有找到可以安全修改的引用。" };
      return {
        edits: occurrences.map((occurrence) => ({
          resource: model.uri,
          versionId: model.getVersionId(),
          textEdit: {
            range: new monaco.Range(occurrence.lineNumber, occurrence.startColumn, occurrence.lineNumber, occurrence.endColumn),
            text: newName,
          },
        })),
      };
    },
  });
  return {
    dispose() {
      hoverProvider.dispose();
      definitionProvider.dispose();
      referenceProvider.dispose();
      renameProvider.dispose();
    },
  };
};

const formatStorageSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) { value /= 1024; unitIndex += 1; }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[unitIndex]}`;
};
type ExampleLibrary = typeof import("./examples");

const stripTerminalFormatting = (value: string) => value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[│╭╮╰╯─]+/g, " ").trim();

const diagnoseManimError = (traceback: string, block?: Blockly.Block) => {
  const cleanTraceback = stripTerminalFormatting(traceback);
  const exception = [...cleanTraceback.matchAll(/(?:^|\n)([A-Za-z]+(?:Error|Exception)):\s*([^\n]+)/g)].at(-1);
  const errorType = exception?.[1] || "ManimError";
  const detail = exception?.[2]?.trim() || cleanTraceback.split("\n").map((line) => line.trim()).filter(Boolean).at(-1) || "未知错误";
  const blockLabel = block?.toString(54) || "当前积木";
  const named = detail.match(/name ['"]([^'"]+)['"] is not defined/i);
  const missingFile = detail.match(/(?:No such file or directory|cannot find)[^'"]*['"]([^'"]+)['"]/i);
  const attribute = detail.match(/object has no attribute ['"]([^'"]+)['"]/i);
  const keyword = detail.match(/keyword argument ['"]([^'"]+)['"]/i);
  const missingArgument = detail.match(/missing \d+ required positional argument[s]?: (.+)$/i);

  let suggestion = `检查高亮的“${blockLabel}”积木：确认所有输入已连接，并且输入值类型符合该积木要求。`;
  if (named) suggestion = `名称“${named[1]}”尚未创建。请先创建该 Manim 对象或 Python 变量，再在高亮积木中选择/填写相同名称。`;
  else if (missingFile) suggestion = `找不到文件“${missingFile[1]}”。请改为存在的文件路径，并确认文件没有被移动或删除。`;
  else if (attribute) suggestion = `当前对象不支持“${attribute[1]}”方法。请把高亮积木连接到支持该方法的 Manim 对象，或改用对应对象的方法积木。`;
  else if (keyword && /multiple values/i.test(detail)) suggestion = `参数“${keyword[1]}”被重复传入。这通常是积木与当前 Manim 版本不兼容，请不要继续调整数值，记录该积木并反馈此错误。`;
  else if (keyword) suggestion = `当前 Manim 版本不支持参数“${keyword[1]}”。请检查高亮积木的参数选择；如果该参数由积木固定生成，请反馈该积木的兼容性问题。`;
  else if (missingArgument) suggestion = `缺少必填参数 ${missingArgument[1]}。请给高亮积木对应的空输入槽连接合适的数值或对象。`;
  else if (errorType === "ZeroDivisionError") suggestion = `除数不能为 0。请检查高亮积木中的数值、比例或范围步长，并改为非零值。`;
  else if (errorType === "FileNotFoundError") suggestion = `高亮积木引用的文件不存在。请重新选择有效文件，并避免使用已移动的绝对路径。`;
  else if (/latex|tex/i.test(cleanTraceback)) suggestion = `LaTeX 渲染失败。请检查公式语法、反斜杠和成对括号；如果语法正确，再确认本机已安装 LaTeX。`;
  else if (errorType === "ValueError") suggestion = `输入值不在允许范围内。请检查高亮积木中的半径、尺寸、范围起止值和列表结构。`;
  else if (errorType === "TypeError") suggestion = `输入类型不匹配。请检查高亮积木的连接：对象槽连接 Manim 对象，数值槽连接数字，列表槽连接 Python 列表。`;

  return { message: `${errorType}: ${detail}`, suggestion };
};

const extractLegacyAngleValue = (input: unknown) => {
  const candidate = (input as { block?: unknown; shadow?: unknown } | null)?.block
    ?? (input as { block?: unknown; shadow?: unknown } | null)?.shadow;
  const block = candidate as { type?: unknown; fields?: Record<string, unknown> } | null;
  if (block?.type !== "math_number") return undefined;
  const value = Number(block.fields?.NUM);
  return Number.isFinite(value) ? value : undefined;
};

const migrateWorkspaceState = <T,>(state: T): T => {
  const cloned = typeof structuredClone === "function" ? structuredClone(state) : JSON.parse(JSON.stringify(state));
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;

    const block = node as { type?: unknown; fields?: Record<string, unknown>; inputs?: Record<string, unknown> };
    if (block.type === "visual_python_manim_degrees") {
      const legacyValue = block.inputs?.VALUE ? extractLegacyAngleValue(block.inputs.VALUE) : undefined;
      block.fields = { ...block.fields, VALUE: legacyValue ?? block.fields?.VALUE ?? 90 };
      if (block.inputs?.VALUE) {
        delete block.inputs.VALUE;
        if (!Object.keys(block.inputs).length) delete block.inputs;
      }
    }

    Object.values(node).forEach(visit);
  };
  visit(cloned);
  return cloned as T;
};

const validateWorkspaceState = <T extends object>(state: T): T => {
  const migrated = migrateWorkspaceState(state);
  const validationWorkspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(migrated, validationWorkspace);
    return migrated;
  } finally {
    validationWorkspace.dispose();
  }
};

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const topMenuRef = useRef<HTMLDivElement>(null);
  const manimSceneMenuRef = useRef<HTMLDivElement>(null);
  const codeOutlineRef = useRef<HTMLDivElement>(null);
  const codeOutlineTriggerRef = useRef<HTMLButtonElement>(null);
  const blockOutlineRef = useRef<HTMLDivElement>(null);
  const blockOutlineTriggerRef = useRef<HTMLButtonElement>(null);
  const consolePanelRef = useRef<HTMLDivElement>(null);
  const consoleContextMenuRef = useRef<HTMLDivElement>(null);
  const workspace = useRef<Blockly.WorkspaceSvg | null>(null);
  const blockSearchDefinition = useRef<Blockly.utils.toolbox.ToolboxDefinition>(toolbox);
  const blockSearchLabelCache = useRef(new Map<string, string>());
  const blockSearchPreviewWorkspace = useRef<Blockly.Workspace | null>(null);
  const blockSearchQueryRef = useRef("");
  const blockViewport = useRef<{ x: number; y: number; scale: number } | null>(null);
  const restoreBlockViewport = useRef(false);
  const [code, setCode] = useState("");
  const [sourceCode, setSourceCode] = useState("");
  const [sourceCodeInitialized, setSourceCodeInitialized] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() => normalizeWorkspaceMode(localStorage.getItem("visual-python:workspace-mode")));
  const [codeOutlineOpen, setCodeOutlineOpen] = useState(false);
  const [blockOutlineOpen, setBlockOutlineOpen] = useState(false);
  const [blockOutlineQuery, setBlockOutlineQuery] = useState("");
  const codeEditor = useRef<Parameters<OnMount>[0] | null>(null);
  const codeEditorMonaco = useRef<Parameters<OnMount>[1] | null>(null);
  const codeEditorStatusListeners = useRef<Array<{ dispose: () => void }>>([]);
  const [codeCursorPosition, setCodeCursorPosition] = useState({ lineNumber: 1, column: 1 });
  const [codeIndentSize, setCodeIndentSize] = useState(4);
  const codeDiagnosticDecorations = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null);
  const pyrightDiagnosticDecorations = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null);
  const codeCompletionProvider = useRef<{ dispose: () => void } | null>(null);
  const codeSignatureHelpProvider = useRef<{ dispose: () => void } | null>(null);
  const codeNavigationProviders = useRef<{ dispose: () => void } | null>(null);
  const pyrightClient = useRef<PyrightClient | null>(null);
  const formatCodeAction = useRef<() => Promise<void>>(async () => {});
  const formattingPromiseRef = useRef<Promise<string | null> | null>(null);
  const [formattingCode, setFormattingCode] = useState(false);
  const [autoFormatOnSave, setAutoFormatOnSave] = useState(() => localStorage.getItem("visual-python:auto-format-on-save") === "true");
  const [editorFontSize, setEditorFontSize] = useState<EditorFontSize>(() => normalizeEditorFontSize(localStorage.getItem("visual-python:editor-font-size")));
  const [editorIndentSize, setEditorIndentSize] = useState<EditorIndentSize>(() => normalizeEditorIndentSize(localStorage.getItem("visual-python:editor-indent-size")));
  const codeValidationVersion = useRef(0);
  const sourceCodeRef = useRef("");
  const pythonRunUsesCodeSource = useRef(false);
  const pythonRunSourceCode = useRef("");
  const [codeSyntaxDiagnostic, setCodeSyntaxDiagnostic] = useState<PythonCodeDiagnostic | null>(null);
  const [codeRuntimeDiagnostic, setCodeRuntimeDiagnostic] = useState<PythonCodeDiagnostic | null>(null);
  const [pyrightDiagnostics, setPyrightDiagnostics] = useState<LspDiagnostic[]>([]);
  const [output, setOutput] = useState<OutputEntry[]>([{ id: 0, stream: "system", data: "准备就绪。运行项目后，输出将显示在这里。\n" }]);
  const [running, setRunning] = useState(false);
  const [renderingManim, setRenderingManim] = useState(false);
  const [manimRenderProgress, setManimRenderProgress] = useState<ManimRenderProgress | null>(null);
  const [manimRenderElapsed, setManimRenderElapsed] = useState(0);
  const [manimRenderSettingsOpen, setManimRenderSettingsOpen] = useState(false);
  const [manimSettingsSection, setManimSettingsSection] = useState<ManimSettingsSection>("output");
  const [formulaEditorRequest, setFormulaEditorRequest] = useState<FormulaEditorRequest | null>(null);
  const [manimSceneMenuOpen, setManimSceneMenuOpen] = useState(false);
  const [manimRenderConfig, setManimRenderConfigState] = useState<ManimRenderConfig>(() => getManimRenderConfig());
  const [manimStorageInfo, setManimStorageInfo] = useState<ManimStorageInfo | null>(null);
  const [manimStoragePath, setManimStoragePath] = useState(() => localStorage.getItem("visual-python:manim-storage-path") || "");
  const [loadingManimStorage, setLoadingManimStorage] = useState(false);
  const [clearingManimStorage, setClearingManimStorage] = useState(false);
  const [stdinValue, setStdinValue] = useState("");
  const taskId = useRef<number | null>(null);
  const outputId = useRef(1);
  const [projectName, setProjectName] = useState("hello-python.vpy");
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [blockSearchQuery, setBlockSearchQuery] = useState("");
  const [blockToolboxWidth, setBlockToolboxWidth] = useState(0);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [exampleMenuOpen, setExampleMenuOpen] = useState(false);
  const [shortcutMenuOpen, setShortcutMenuOpen] = useState(false);
  const [exampleLibrary, setExampleLibrary] = useState<ExampleLibrary | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(() => JSON.parse(localStorage.getItem("visual-python:recent") || "[]"));
  const loadingWorkspace = useRef(false);
  const autosaveTimer = useRef<number | null>(null);
  const suppressToolboxAutoHide = useRef(false);
  const toolboxAutoHideTimer = useRef<number | null>(null);
  const startupProjectRequest = useRef<Promise<string | null> | null>(null);
  const startupProjectOpened = useRef(false);
  const externalRestoreStarted = useRef(false);
  const packageInstallStopping = useRef(false);
  const [activePanel, setActivePanel] = useState<ConsolePanel>("output");
  const [consoleContextMenu, setConsoleContextMenu] = useState<ConsoleContextMenuState | null>(null);
  const [manimVideo, setManimVideo] = useState<ManimVideoPreview | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [rememberCloseChoice, setRememberCloseChoice] = useState(false);
  const [closeBehavior, setCloseBehavior] = useState<CloseBehavior>(() => {
    const saved = localStorage.getItem("visual-python:close-behavior");
    return saved === "tray" || saved === "exit" ? saved : "ask";
  });
  const [windowMaximized, setWindowMaximized] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(() => localStorage.getItem("visual-python:right-panel-open") !== "false");
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const saved = Number(localStorage.getItem("visual-python:right-panel-width"));
    return Number.isFinite(saved) && saved >= 360 && saved <= 720 ? saved : 480;
  });
  const [bottomPanelOpen, setBottomPanelOpen] = useState(() => localStorage.getItem("visual-python:bottom-panel-open") !== "false");
  const [bottomPanelHeight, setBottomPanelHeight] = useState(() => {
    const saved = Number(localStorage.getItem("visual-python:bottom-panel-height"));
    return Number.isFinite(saved) && saved >= 160 && saved <= 600 ? saved : 260;
  });
  const [visualThemeId, setVisualThemeId] = useState<VisualThemeId>(() => {
    const saved = localStorage.getItem("visual-python:theme") as VisualThemeId | null;
    return saved && saved in visualPythonThemes ? saved : defaultVisualThemeId;
  });
  const [pluginRecords, setPluginRecords] = useState<PluginRecord[]>(() => pluginRegistry.getRecords());
  const [externalPlugins, setExternalPlugins] = useState<ExternalPluginDiscovery[]>([]);
  const [discoveringPlugins, setDiscoveringPlugins] = useState(false);
  const [externalPluginErrors, setExternalPluginErrors] = useState<Record<string, string>>({});
  const [trustedExternalPlugins, setTrustedExternalPlugins] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("visual-python:trusted-external-plugins") || "{}"); } catch { return {}; }
  });
  const [packageStatus, setPackageStatus] = useState<Record<string, boolean>>({});
  const [checkingPackages, setCheckingPackages] = useState(false);
  const [installingPackages, setInstallingPackages] = useState(false);
  const [usePipMirror, setUsePipMirror] = useState(() => localStorage.getItem("visual-python:use-pip-mirror") === "true");
  const [pythonEnvironments, setPythonEnvironments] = useState<PythonEnvironment[]>([]);
  const [pythonEnvironment, setPythonEnvironment] = useState<PythonEnvironment | null>(() => {
    try { return JSON.parse(localStorage.getItem("visual-python:environment") || "null"); } catch { return null; }
  });
  const [detectingPython, setDetectingPython] = useState(false);
  const [problems, setProblems] = useState<CodeProblem[]>([]);
  const [contextProblems, setContextProblems] = useState<CodeProblem[]>([]);
  const problemId = useRef(1);
  const stderrBuffer = useRef("");
  const pythonBlockIdByLine = useRef(new Map<number, string>());
  const manimStderrBuffer = useRef("");
  const manimProgressBuffer = useRef("");
  const manimRenderStartedAt = useRef(0);
  const manimBlockIdByLine = useRef(new Map<number, string>());
  const pendingOutput = useRef<OutputEntry[]>([]);
  const outputFlushTimer = useRef<number | null>(null);

  const flushPendingOutput = useCallback(() => {
    outputFlushTimer.current = null;
    const batch = pendingOutput.current;
    if (!batch.length) return;
    pendingOutput.current = [];
    setOutput((entries) => [...entries, ...batch].slice(-outputEntryLimit));
  }, []);

  const enqueueOutput = useCallback((stream: OutputEntry["stream"], data: string) => {
    pendingOutput.current.push({ id: outputId.current++, stream, data });
    if (outputFlushTimer.current === null) {
      outputFlushTimer.current = window.setTimeout(flushPendingOutput, 80);
    }
  }, [flushPendingOutput]);

  const clearConsole = useCallback(() => {
    pendingOutput.current = [];
    if (outputFlushTimer.current !== null) {
      window.clearTimeout(outputFlushTimer.current);
      outputFlushTimer.current = null;
    }
    setOutput([]);
    setProblems([]);
  }, []);

  const cancelAutosave = useCallback(() => {
    if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = null;
  }, []);

  const focusBlock = useCallback((blockId: string) => {
    const ws = workspace.current;
    const block = ws?.getBlockById(blockId);
    if (!ws || !block) return;
    let parent = block.getSurroundParent();
    while (parent) {
      if (parent.isCollapsed()) parent.setCollapsed(false);
      parent = parent.getSurroundParent();
    }
    ws.getToolbox()?.setSelectedItem(null);
    Blockly.common.setSelected(block);
    ws.centerOnBlock(blockId, true);
  }, []);

  useEffect(() => subscribeFormulaEditor(setFormulaEditorRequest), []);

  const focusProblem = useCallback((problem: CodeProblem) => {
    if (problem.blockId) {
      focusBlock(problem.blockId);
      return;
    }
    if (workspaceMode !== "code" || problem.line <= 0) return;
    codeEditor.current?.revealLineInCenter(problem.line);
    codeEditor.current?.setPosition({ lineNumber: problem.line, column: 1 });
    codeEditor.current?.focus();
  }, [focusBlock, workspaceMode]);

  useEffect(() => () => {
    if (outputFlushTimer.current !== null) window.clearTimeout(outputFlushTimer.current);
    if (toolboxAutoHideTimer.current !== null) window.clearTimeout(toolboxAutoHideTimer.current);
    codeCompletionProvider.current?.dispose();
    codeCompletionProvider.current = null;
    codeSignatureHelpProvider.current?.dispose();
    codeSignatureHelpProvider.current = null;
    codeNavigationProviders.current?.dispose();
    codeNavigationProviders.current = null;
    blockSearchPreviewWorkspace.current?.dispose();
    blockSearchPreviewWorkspace.current = null;
    codeEditorStatusListeners.current.forEach((listener) => listener.dispose());
    codeEditorStatusListeners.current = [];
  }, []);

  const prepareNativeWindowDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (event.button !== 0 || !target.hasAttribute("data-tauri-drag-region")) return;
    suppressToolboxAutoHide.current = true;
    if (toolboxAutoHideTimer.current !== null) window.clearTimeout(toolboxAutoHideTimer.current);
    toolboxAutoHideTimer.current = window.setTimeout(() => {
      suppressToolboxAutoHide.current = false;
      toolboxAutoHideTimer.current = null;
    }, 250);
  }, []);

  useEffect(() => {
    if (!projectMenuOpen && !exampleMenuOpen && !shortcutMenuOpen) return;
    const closeTopMenus = (event: PointerEvent) => {
      if (topMenuRef.current?.contains(event.target as Node)) return;
      setProjectMenuOpen(false);
      setExampleMenuOpen(false);
      setShortcutMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeTopMenus);
    return () => document.removeEventListener("pointerdown", closeTopMenus);
  }, [exampleMenuOpen, projectMenuOpen, shortcutMenuOpen]);

  useEffect(() => {
    if (!manimSceneMenuOpen) return;
    const closeSceneMenu = (event: PointerEvent) => {
      if (!manimSceneMenuRef.current?.contains(event.target as Node)) setManimSceneMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeSceneMenu);
    return () => document.removeEventListener("pointerdown", closeSceneMenu);
  }, [manimSceneMenuOpen]);

  useEffect(() => {
    if (!consoleContextMenu) return;
    const closeMenu = (event: PointerEvent) => {
      if (!consoleContextMenuRef.current?.contains(event.target as Node)) setConsoleContextMenu(null);
    };
    const closeMenuWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConsoleContextMenu(null);
    };
    const closeMenuWithoutEvent = () => setConsoleContextMenu(null);
    const focusFrame = requestAnimationFrame(() => consoleContextMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeMenuWithKeyboard);
    window.addEventListener("resize", closeMenuWithoutEvent);
    window.addEventListener("blur", closeMenuWithoutEvent);
    document.addEventListener("scroll", closeMenuWithoutEvent, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeMenuWithKeyboard);
      window.removeEventListener("resize", closeMenuWithoutEvent);
      window.removeEventListener("blur", closeMenuWithoutEvent);
      document.removeEventListener("scroll", closeMenuWithoutEvent, true);
    };
  }, [consoleContextMenu]);

  useEffect(() => {
    if (!codeOutlineOpen) return;
    const closeOutline = (event: PointerEvent) => {
      if (!codeOutlineRef.current?.contains(event.target as Node)) setCodeOutlineOpen(false);
    };
    const closeOutlineWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCodeOutlineOpen(false);
      codeOutlineTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutline);
    document.addEventListener("keydown", closeOutlineWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeOutline);
      document.removeEventListener("keydown", closeOutlineWithKeyboard);
    };
  }, [codeOutlineOpen]);

  useEffect(() => {
    if (!blockOutlineOpen) return;
    const closeOutline = (event: PointerEvent) => {
      if (!blockOutlineRef.current?.contains(event.target as Node)) setBlockOutlineOpen(false);
    };
    const closeOutlineWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setBlockOutlineOpen(false);
      blockOutlineTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutline);
    document.addEventListener("keydown", closeOutlineWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeOutline);
      document.removeEventListener("keydown", closeOutlineWithKeyboard);
    };
  }, [blockOutlineOpen]);

  const blockSearchLabelForType = useCallback((type: string) => {
    const cached = blockSearchLabelCache.current.get(type);
    if (cached) return cached;
    let label = type.replace(/^visual_python_manim_|^python_/, "").replaceAll("_", " ");
    let previewBlock: Blockly.Block | null = null;
    try {
      const previewWorkspace = blockSearchPreviewWorkspace.current ?? new Blockly.Workspace();
      blockSearchPreviewWorkspace.current = previewWorkspace;
      previewBlock = previewWorkspace.newBlock(type);
      label = previewBlock.toString(140, "").replace(/\s+/g, " ").trim() || label;
    } catch {
      // The block type remains searchable even if it requires a rendered workspace.
    } finally {
      previewBlock?.dispose(false);
    }
    blockSearchLabelCache.current.set(type, label);
    return label;
  }, []);

  const showBlockSearchResults = useCallback((value: string) => {
    const query = value.trimStart();
    blockSearchQueryRef.current = query;
    setBlockSearchQuery(query);
    const ws = workspace.current;
    const workspaceToolbox = ws?.getToolbox();
    const flyout = workspaceToolbox?.getFlyout();
    if (!ws || !workspaceToolbox || !flyout) return;
    if (!query.trim()) {
      workspaceToolbox.setSelectedItem(null);
      flyout.hide();
      return;
    }
    const index = createBlockSearchIndex(
      blockSearchDefinition.current,
      blockSearchLabelForType,
      (custom) => ws.getToolboxCategoryCallback(custom)?.(ws) ?? null,
    );
    const results = searchBlockIndex(index, query);
    suppressToolboxAutoHide.current = true;
    workspaceToolbox.setSelectedItem(null);
    flyout.show(blockSearchFlyout(results));
    requestAnimationFrame(() => { suppressToolboxAutoHide.current = false; });
  }, [blockSearchLabelForType]);

  const closeBlockSearch = useCallback(() => {
    showBlockSearchResults("");
  }, [showBlockSearchResults]);

  useEffect(() => {
    if (!host.current) return;
    const initialToolbox = pluginRegistry.extendToolbox(toolbox);
    blockSearchDefinition.current = initialToolbox;
    const ws = Blockly.inject(host.current, {
      toolbox: initialToolbox, renderer: "zelos", theme: visualPythonThemes[visualThemeId], trashcan: true,
      grid: { spacing: 24, length: 2, colour: "#3a424d", snap: true },
      zoom: { controls: true, wheel: true, startScale: .88, maxScale: 1.4, minScale: .45, scaleSpeed: 1.1 },
      move: { scrollbars: true, drag: true, wheel: true },
    });
    const workspaceWithResizeHandler = ws as unknown as { resizeHandlerWrapper: Blockly.browserEvents.Data | null };
    if (workspaceWithResizeHandler.resizeHandlerWrapper) {
      Blockly.browserEvents.unbind(workspaceWithResizeHandler.resizeHandlerWrapper);
      workspaceWithResizeHandler.resizeHandlerWrapper = null;
    }
    const workspaceToolbox = ws.getToolbox() as unknown as { autoHide: (onlyClosePopups: boolean) => void } | null;
    if (workspaceToolbox) {
      const autoHide = workspaceToolbox.autoHide.bind(workspaceToolbox);
      workspaceToolbox.autoHide = (onlyClosePopups) => {
        if (!onlyClosePopups && suppressToolboxAutoHide.current) return;
        autoHide(onlyClosePopups);
      };
    }
    const toolboxElement = (ws.getToolbox() as unknown as { HtmlDiv?: HTMLDivElement | null } | null)?.HtmlDiv;
    const clearSearchForCategory = (event: PointerEvent) => {
      if (!blockSearchQueryRef.current || !(event.target as Element).closest(".blocklyToolboxCategory,.blocklyTreeRow")) return;
      blockSearchQueryRef.current = "";
      setBlockSearchQuery("");
    };
    toolboxElement?.addEventListener("pointerdown", clearSearchForCategory);
    setBlockToolboxWidth(ws.getToolbox()?.getWidth() ?? 0);
    requestAnimationFrame(() => {
      if (workspace.current === ws) setBlockToolboxWidth(ws.getToolbox()?.getWidth() ?? 0);
    });
    registerUsedVariablesToolbox(ws);
    let variablePruneScheduled = false;
    let pruningVariables = false;
    const pruneUnusedVariables = () => {
      if (pruningVariables) return;
      pruningVariables = true;
      const usedIds = new Set(Blockly.Variables.allUsedVarModels(ws).map((variable) => variable.getId()));
      const variableMap = ws.getVariableMap();
      for (const variable of variableMap.getAllVariables()) {
        if (!usedIds.has(variable.getId())) variableMap.deleteVariable(variable);
      }
      ws.getToolbox()?.refreshSelection();
      pruningVariables = false;
    };
    const scheduleVariablePrune = () => {
      if (variablePruneScheduled) return;
      variablePruneScheduled = true;
      queueMicrotask(() => {
        variablePruneScheduled = false;
        pruneUnusedVariables();
      });
    };
    const savedDraft = localStorage.getItem("visual-python:draft");
    let draft: DraftProject | null = null;
    try { draft = savedDraft ? JSON.parse(savedDraft) as DraftProject : null; } catch { localStorage.removeItem("visual-python:draft"); }
    loadingWorkspace.current = true;
    let restoredDraft = false;
    if (draft) {
      try {
        pluginRegistry.loadProjectData(draft.plugins);
        Blockly.serialization.workspaces.load(migrateWorkspaceState(draft.workspace), ws);
        restoredDraft = true;
      } catch {
        draft = null;
        pluginRegistry.clearProjectData();
        localStorage.removeItem("visual-python:draft");
      }
    }
    if (!restoredDraft) Blockly.serialization.workspaces.load(starterState, ws);
    pruneUnusedVariables();
    setContextProblems(contextIssuesToProblems(validatePythonBlockContexts(ws)));
    ws.clearUndo();
    if (draft) { setProjectName(draft.name); setProjectPath(draft.path); setDirty(true); }
    queueMicrotask(() => { loadingWorkspace.current = false; });
    const update = (event: Blockly.Events.Abstract) => {
      if (event.isUiEvent) return;
      scheduleVariablePrune();
      setCode(generateWorkspacePython(ws));
      if (!loadingWorkspace.current) {
        setDirty(true);
        setWorkspaceRevision((revision) => revision + 1);
      }
      if (blockSearchQueryRef.current) queueMicrotask(() => showBlockSearchResults(blockSearchQueryRef.current));
    };
    ws.addChangeListener(update);
    const unsubscribePlugins = pluginRegistry.subscribe(() => {
      const nextToolbox = pluginRegistry.extendToolbox(toolbox);
      blockSearchDefinition.current = nextToolbox;
      blockSearchLabelCache.current.clear();
      ws.updateToolbox(nextToolbox);
      requestAnimationFrame(() => {
        if (workspace.current !== ws) return;
        setBlockToolboxWidth(ws.getToolbox()?.getWidth() ?? 0);
        if (blockSearchQueryRef.current) showBlockSearchResults(blockSearchQueryRef.current);
      });
    });
    const generatedCode = generateWorkspacePython(ws);
    const restoredMode = normalizeWorkspaceMode(draft?.workspaceMode, normalizeWorkspaceMode(localStorage.getItem("visual-python:workspace-mode")));
    const restoredSourceCode = typeof draft?.sourceCode === "string" ? draft.sourceCode : restoredMode === "code" ? generatedCode : "";
    setCode(generatedCode);
    setSourceCode(restoredSourceCode);
    setSourceCodeInitialized(typeof draft?.sourceCode === "string" || restoredMode === "code");
    setWorkspaceMode(restoredMode);
    workspace.current = ws;
    let resizeFrame: number | null = null;
    let lastWidth = host.current.clientWidth;
    let lastHeight = host.current.clientHeight;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;
      if (width < 1 || height < 1) return;
      if (Math.abs(width - lastWidth) < 0.5 && Math.abs(height - lastHeight) < 0.5) return;
      lastWidth = width;
      lastHeight = height;
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        if (workspace.current === ws) Blockly.svgResize(ws);
      });
    });
    observer.observe(host.current);
    return () => { unsubscribePlugins(); toolboxElement?.removeEventListener("pointerdown", clearSearchForCategory); observer.disconnect(); if (resizeFrame !== null) cancelAnimationFrame(resizeFrame); ws.dispose(); };
  }, [showBlockSearchResults]);

  useEffect(() => {
    const ws = workspace.current;
    if (!ws) return;
    const frame = requestAnimationFrame(() => {
      if (workspace.current !== ws) return;
      setContextProblems(contextIssuesToProblems(validatePythonBlockContexts(ws)));
    });
    return () => cancelAnimationFrame(frame);
  }, [code, workspaceRevision]);

  useEffect(() => { localStorage.setItem("visual-python:right-panel-open", String(rightPanelOpen)); }, [rightPanelOpen]);
  useEffect(() => { localStorage.setItem("visual-python:right-panel-width", String(rightPanelWidth)); }, [rightPanelWidth]);
  useEffect(() => { localStorage.setItem("visual-python:bottom-panel-open", String(bottomPanelOpen)); }, [bottomPanelOpen]);
  useEffect(() => { localStorage.setItem("visual-python:bottom-panel-height", String(bottomPanelHeight)); }, [bottomPanelHeight]);
  useEffect(() => { localStorage.setItem("visual-python:workspace-mode", workspaceMode); }, [workspaceMode]);
  useEffect(() => { localStorage.setItem("visual-python:use-pip-mirror", String(usePipMirror)); }, [usePipMirror]);
  useEffect(() => { localStorage.setItem("visual-python:auto-format-on-save", String(autoFormatOnSave)); }, [autoFormatOnSave]);
  useEffect(() => { localStorage.setItem("visual-python:editor-font-size", String(editorFontSize)); }, [editorFontSize]);
  useEffect(() => { localStorage.setItem("visual-python:editor-indent-size", String(editorIndentSize)); }, [editorIndentSize]);
  useEffect(() => {
    if (manimStoragePath) localStorage.setItem("visual-python:manim-storage-path", manimStoragePath);
    else localStorage.removeItem("visual-python:manim-storage-path");
  }, [manimStoragePath]);

  useEffect(() => {
    const editor = codeEditor.current;
    editor?.updateOptions({ fontSize: editorFontSize, lineHeight: editorFontSize + 9, tabSize: editorIndentSize, insertSpaces: true, detectIndentation: false });
    editor?.getModel()?.updateOptions({ tabSize: editorIndentSize, insertSpaces: true });
    setCodeIndentSize(editorIndentSize);
  }, [editorFontSize, editorIndentSize]);

  useEffect(() => {
    document.documentElement.dataset.theme = visualThemeId;
    localStorage.setItem("visual-python:theme", visualThemeId);
    workspace.current?.setTheme(visualPythonThemes[visualThemeId]);
  }, [visualThemeId]);

  useEffect(() => {
    if (!isBlockWorkspaceMode(workspaceMode) || !restoreBlockViewport.current) return;
    const ws = workspace.current;
    const viewport = blockViewport.current;
    if (!ws || !viewport) return;
    let restoreFrame: number | null = null;
    const layoutFrame = requestAnimationFrame(() => {
      restoreFrame = requestAnimationFrame(() => {
        if (workspace.current !== ws) return;
        Blockly.svgResize(ws);
        if (ws.getScale() !== viewport.scale) ws.setScale(viewport.scale);
        ws.scroll(viewport.x, viewport.y);
        restoreBlockViewport.current = false;
      });
    });
    return () => {
      cancelAnimationFrame(layoutFrame);
      if (restoreFrame !== null) cancelAnimationFrame(restoreFrame);
    };
  }, [workspaceMode]);

  const activeCode = workspaceMode === "code" ? sourceCode : code;
  const effectiveRightPanelOpen = workspaceMode !== "visual" || rightPanelOpen;
  const effectiveBottomPanelOpen = workspaceMode === "visual" || bottomPanelOpen;

  const openConsolePanel = useCallback((panel: ConsolePanel) => {
    setActivePanel(panel);
    setBottomPanelOpen(true);
    setRightPanelOpen(true);
  }, []);

  const changeWorkspaceMode = useCallback((nextMode: WorkspaceMode) => {
    if (nextMode === workspaceMode || running || renderingManim) return;
    if (isBlockWorkspaceMode(workspaceMode) && nextMode === "code" && workspace.current) {
      blockViewport.current = {
        x: workspace.current.scrollX,
        y: workspace.current.scrollY,
        scale: workspace.current.getScale(),
      };
    } else if (workspaceMode === "code" && isBlockWorkspaceMode(nextMode)) {
      restoreBlockViewport.current = true;
    }
    if (nextMode === "code" && !sourceCodeInitialized) {
      setSourceCode(code);
      setSourceCodeInitialized(true);
    }
    setCodeOutlineOpen(false);
    setWorkspaceMode(nextMode);
    if (nextMode !== "code") {
      codeValidationVersion.current += 1;
      setCodeSyntaxDiagnostic(null);
      setCodeRuntimeDiagnostic(null);
    }
    setRightPanelOpen(nextMode !== "visual");
    if (nextMode === "visual") setBottomPanelOpen(true);
    setDirty(true);
    if (nextMode === "code") requestAnimationFrame(() => codeEditor.current?.focus());
  }, [code, renderingManim, running, sourceCodeInitialized, workspaceMode]);

  const updateSourceCode = useCallback((value: string | undefined) => {
    if (workspaceMode !== "code") return;
    codeValidationVersion.current += 1;
    setSourceCode(value ?? "");
    setSourceCodeInitialized(true);
    setCodeSyntaxDiagnostic(null);
    setCodeRuntimeDiagnostic(null);
    setProblems((items) => {
      const remaining = items.filter((problem) => problem.kind !== "syntax" && problem.kind !== "runtime" && problem.kind !== "timeout");
      return remaining.length === items.length ? items : remaining;
    });
    setDirty(true);
  }, [workspaceMode]);

  const formatCurrentPythonCode = useCallback(async (announce = true): Promise<string | null> => {
    const editor = codeEditor.current;
    const model = editor?.getModel();
    if (workspaceMode !== "code" || !editor || !model) return null;
    if (formattingPromiseRef.current) return formattingPromiseRef.current;
    const original = model.getValue();
    if (!original.trim()) return original;
    setFormattingCode(true);
    const task = (async () => {
      try {
        const fileName = projectName.replace(/\.vpy$/i, ".py");
        let source = original;
        let sourceVersion = model.getVersionId();
        let formatted = await formatPythonSource(source, fileName, editorIndentSize);
        if (model.getVersionId() !== sourceVersion) {
          source = model.getValue();
          sourceVersion = model.getVersionId();
          formatted = await formatPythonSource(source, fileName, editorIndentSize);
        }
        if (model.getVersionId() !== sourceVersion) {
          setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: "代码仍在变化，本次没有自动格式化。\n" }]);
          return null;
        }
        if (formatted === source) {
          if (announce) setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: "代码已经很整齐，无需调整。\n" }]);
          return source;
        }
        const position = editor.getPosition();
        editor.pushUndoStop();
        editor.executeEdits("visual-python-format", [{ range: model.getFullModelRange(), text: formatted, forceMoveMarkers: true }]);
        editor.pushUndoStop();
        sourceCodeRef.current = formatted;
        setSourceCode(formatted);
        setSourceCodeInitialized(true);
        setDirty(true);
        if (position) {
          const lineNumber = Math.min(position.lineNumber, model.getLineCount());
          editor.setPosition({ lineNumber, column: Math.min(position.column, model.getLineMaxColumn(lineNumber)) });
        }
        editor.focus();
        setProblems((items) => items.filter((problem) => problem.id !== "code-format"));
        if (announce) setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: "Python 代码格式化完成。\n" }]);
        return formatted;
      } catch (error) {
        const detail = String(error).replace(/^Error:\s*/, "").trim();
        setProblems((items) => [...items.filter((problem) => problem.id !== "code-format"), { id: "code-format", kind: "syntax", line: 0, message: "格式化器在这里停住了：请先修复代码中的语法问题。", suggestion: detail }]);
        setActivePanel("problems");
        setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `格式化失败：${detail}\n` }]);
        return null;
      }
    })();
    formattingPromiseRef.current = task;
    try {
      return await task;
    } finally {
      if (formattingPromiseRef.current === task) formattingPromiseRef.current = null;
      setFormattingCode(false);
    }
  }, [editorIndentSize, projectName, workspaceMode]);
  formatCodeAction.current = async () => { await formatCurrentPythonCode(); };

  const runCodeEditorAction = useCallback((actionId: string) => {
    setShortcutMenuOpen(false);
    requestAnimationFrame(() => {
      const editor = codeEditor.current;
      editor?.focus();
      void editor?.getAction(actionId)?.run();
    });
  }, []);

  const mountCodeEditor = useCallback<OnMount>((editor, monaco) => {
    codeEditor.current = editor;
    codeEditorMonaco.current = monaco;
    codeDiagnosticDecorations.current = editor.createDecorationsCollection();
    pyrightDiagnosticDecorations.current = editor.createDecorationsCollection();
    if (!codeCompletionProvider.current) codeCompletionProvider.current = registerPythonCompletionProvider(monaco, () => pyrightClient.current);
    if (!codeSignatureHelpProvider.current) codeSignatureHelpProvider.current = registerPythonSignatureHelpProvider(monaco, () => pyrightClient.current);
    if (!codeNavigationProviders.current) codeNavigationProviders.current = registerPythonNavigationProviders(monaco, () => pyrightClient.current);
    editor.addAction({
      id: "visual-python.format-python",
      label: "格式化 Python 代码",
      keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
      precondition: "editorLangId == python && !editorReadonly",
      contextMenuGroupId: "1_modification",
      contextMenuOrder: 1.5,
      run: () => formatCodeAction.current(),
    });
    codeEditorStatusListeners.current.forEach((listener) => listener.dispose());
    const model = editor.getModel();
    editor.updateOptions({ fontSize: editorFontSize, lineHeight: editorFontSize + 9, tabSize: editorIndentSize, insertSpaces: true, detectIndentation: false });
    model?.updateOptions({ tabSize: editorIndentSize, insertSpaces: true });
    const position = editor.getPosition();
    if (position) setCodeCursorPosition({ lineNumber: position.lineNumber, column: position.column });
    setCodeIndentSize(editorIndentSize);
    codeEditorStatusListeners.current = [
      editor.onDidChangeCursorPosition(({ position: nextPosition }) => setCodeCursorPosition({ lineNumber: nextPosition.lineNumber, column: nextPosition.column })),
      ...(model ? [model.onDidChangeOptions(() => setCodeIndentSize(model.getOptions().tabSize))] : []),
    ];
    renderCodeDiagnostic(editor, monaco, codeDiagnosticDecorations.current, codeSyntaxDiagnostic ?? codeRuntimeDiagnostic);
    renderPyrightDiagnostics(editor, monaco, pyrightDiagnosticDecorations.current, codeSyntaxDiagnostic ? [] : pyrightDiagnostics);
  }, [codeRuntimeDiagnostic, codeSyntaxDiagnostic, editorFontSize, editorIndentSize, pyrightDiagnostics]);

  useEffect(() => {
    sourceCodeRef.current = sourceCode;
    setCodeSyntaxDiagnostic(null);
    setCodeRuntimeDiagnostic(null);
    setPyrightDiagnostics([]);
  }, [sourceCode]);

  useEffect(() => {
    void pyrightClient.current?.updateDocument(sourceCode);
  }, [sourceCode]);

  useEffect(() => {
    if (workspaceMode !== "code" || !pythonEnvironment?.path) {
      setPyrightDiagnostics([]);
      return;
    }
    setPyrightDiagnostics([]);
    let active = true;
    const client = new PyrightClient(pythonEnvironment.path, projectPath, () => undefined, (diagnostics) => {
      if (active) setPyrightDiagnostics(diagnostics);
    });
    pyrightClient.current = client;
    void client.start(sourceCodeRef.current).catch(() => undefined);
    return () => {
      active = false;
      if (pyrightClient.current === client) pyrightClient.current = null;
      void client.dispose();
    };
  }, [projectPath, pythonEnvironment?.path, workspaceMode]);

  useEffect(() => {
    const editor = codeEditor.current;
    const monaco = codeEditorMonaco.current;
    const decorations = codeDiagnosticDecorations.current;
    if (editor && monaco && decorations) renderCodeDiagnostic(editor, monaco, decorations, codeSyntaxDiagnostic ?? codeRuntimeDiagnostic);
  }, [codeRuntimeDiagnostic, codeSyntaxDiagnostic]);

  useEffect(() => {
    const editor = codeEditor.current;
    const monaco = codeEditorMonaco.current;
    const decorations = pyrightDiagnosticDecorations.current;
    if (editor && monaco && decorations) renderPyrightDiagnostics(editor, monaco, decorations, codeSyntaxDiagnostic ? [] : pyrightDiagnostics);
  }, [codeSyntaxDiagnostic, pyrightDiagnostics]);

  useEffect(() => {
    const version = ++codeValidationVersion.current;
    if (workspaceMode !== "code" || !sourceCode.trim()) {
      setCodeSyntaxDiagnostic(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void invoke("validate_python_code", { code: sourceCode, pythonPath: pythonEnvironment?.path || null })
        .then(() => {
          if (codeValidationVersion.current === version) setCodeSyntaxDiagnostic(null);
        })
        .catch((error) => {
          if (codeValidationVersion.current !== version) return;
          setCodeSyntaxDiagnostic(parsePythonSyntaxDiagnostic(String(error), sourceCode));
        });
    }, 650);
    return () => {
      window.clearTimeout(timer);
      if (codeValidationVersion.current === version) codeValidationVersion.current += 1;
    };
  }, [pythonEnvironment?.path, sourceCode, workspaceMode]);

  useEffect(() => pluginRegistry.subscribe(() => setPluginRecords(pluginRegistry.getRecords())), []);
  useEffect(() => subscribeManimRenderConfig(setManimRenderConfigState), []);
  useEffect(() => {
    if (!problems.length) return;
    setBottomPanelOpen(true);
    setRightPanelOpen(true);
  }, [problems]);

  useEffect(() => {
    if (!renderingManim) return;
    const updateElapsed = () => setManimRenderElapsed(Math.max(0, Math.floor((Date.now() - manimRenderStartedAt.current) / 1000)));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [renderingManim]);

  const updateManimRenderConfig = useCallback((patch: Partial<ManimRenderConfig>) => {
    setManimRenderConfig(patch);
    setDirty(true);
    setWorkspaceRevision((revision) => revision + 1);
  }, []);

  const refreshManimStorage = useCallback(async () => {
    setLoadingManimStorage(true);
    try {
      setManimStorageInfo(await invoke<ManimStorageInfo>("get_manim_storage_info", { storagePath: manimStoragePath || null }));
    } catch (error) {
      enqueueOutput("stderr", `无法读取 Manim 渲染目录：${String(error)}\n`);
    } finally {
      setLoadingManimStorage(false);
    }
  }, [enqueueOutput, manimStoragePath]);

  useEffect(() => {
    if (manimRenderSettingsOpen) void refreshManimStorage();
  }, [manimRenderSettingsOpen, refreshManimStorage]);

  const openManimRenderFolder = useCallback(async () => {
    try {
      await invoke("open_manim_render_folder", { storagePath: manimStoragePath || null });
    } catch (error) {
      Blockly.dialog.alert(`无法打开 Manim 渲染目录：${String(error)}`);
    }
  }, [manimStoragePath]);

  const chooseManimStorageFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false, title: "选择 Manim 渲染目录" });
    if (typeof selected !== "string" || !selected.trim()) return;
    setManimStoragePath(selected.trim());
    enqueueOutput("system", `Manim 后续渲染将保存到：${selected.trim()}\n`);
  }, [enqueueOutput]);

  const resetManimStorageFolder = useCallback(() => {
    setManimStoragePath("");
    enqueueOutput("system", "Manim 渲染目录已恢复为默认位置。\n");
  }, [enqueueOutput]);

  const clearManimRenderFiles = useCallback(async () => {
    if (renderingManim || clearingManimStorage) return;
    if (!window.confirm("确定清理全部 Manim 渲染文件吗？这将删除已生成的视频、中间文件和缓存，且无法撤销。")) return;
    setClearingManimStorage(true);
    try {
      const info = await invoke<ManimStorageInfo>("clear_manim_render_files", { storagePath: manimStoragePath || null });
      setManimStorageInfo(info);
      setManimVideo(null);
      enqueueOutput("system", "Manim 渲染文件已清理。\n");
    } catch (error) {
      Blockly.dialog.alert(`无法清理 Manim 渲染文件：${String(error)}`);
    } finally {
      setClearingManimStorage(false);
    }
  }, [clearingManimStorage, enqueueOutput, manimStoragePath, renderingManim]);

  useEffect(() => {
    if (!exampleMenuOpen || exampleLibrary) return;
    let active = true;
    void import("./examples").then((library) => { if (active) setExampleLibrary(library); });
    return () => { active = false; };
  }, [exampleLibrary, exampleMenuOpen]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const syncMaximized = () => { void appWindow.isMaximized().then((maximized) => { if (!disposed) setWindowMaximized(maximized); }); };
    syncMaximized();
    void appWindow.onResized(syncMaximized).then((listener) => { if (disposed) listener(); else unlisten = listener; });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    const preventRefresh = (event: KeyboardEvent) => {
      if (event.key === "F5") event.preventDefault();
    };
    window.addEventListener("keydown", preventRefresh, true);
    return () => window.removeEventListener("keydown", preventRefresh, true);
  }, []);

  useEffect(() => {
    if (!dirty || !workspace.current) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    const saveDraft = () => {
      const ws = workspace.current;
      if (!ws) return;
      if (ws.isDragging()) {
        autosaveTimer.current = window.setTimeout(saveDraft, 300);
        return;
      }
      const draft: DraftProject = { version: 1, name: projectName, path: projectPath, savedAt: Date.now(), workspace: Blockly.serialization.workspaces.save(ws), plugins: pluginRegistry.createProjectState(ws), sourceCode: sourceCodeInitialized ? sourceCode : undefined, workspaceMode };
      localStorage.setItem("visual-python:draft", JSON.stringify(draft));
      autosaveTimer.current = null;
    };
    autosaveTimer.current = window.setTimeout(saveDraft, 800);
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current); };
  }, [dirty, projectName, projectPath, sourceCode, sourceCodeInitialized, workspaceMode, workspaceRevision]);

  const rememberRecent = useCallback((path: string, name: string) => {
    setRecentProjects((items) => {
      const next = [{ path, name, openedAt: Date.now() }, ...items.filter((item) => item.path !== path)].slice(0, 8);
      localStorage.setItem("visual-python:recent", JSON.stringify(next));
      return next;
    });
  }, []);

  const selectPythonEnvironment = useCallback((environment: PythonEnvironment) => {
    setPythonEnvironment(environment); localStorage.setItem("visual-python:environment", JSON.stringify(environment));
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `已选择 Python ${environment.version}：${environment.path}\n` }]);
  }, []);

  const detectPythonEnvironments = useCallback(async () => {
    setDetectingPython(true);
    try {
      const environments = await invoke<PythonEnvironment[]>("detect_python"); setPythonEnvironments(environments);
      if (!pythonEnvironment && environments[0]) selectPythonEnvironment(environments[0]);
    } catch (error) { setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `检测 Python 失败：${String(error)}\n` }]); }
    finally { setDetectingPython(false); }
  }, [pythonEnvironment, selectPythonEnvironment]);

  useEffect(() => { void detectPythonEnvironments(); }, []);

  const loadExternalPlugin = useCallback(async (entry: ExternalPluginDiscovery, options: { promptForTrust: boolean; silent?: boolean }) => {
    const pluginId = entry.manifest?.id;
    if (!entry.valid || !pluginId) return false;
    if (pluginRegistry.getRecord(pluginId)) return true;
    if (!trustedExternalPlugins[pluginId]) {
      if (!options.promptForTrust) return false;
      if (!window.confirm(`外部插件“${entry.manifest?.name || pluginId}”将执行本地 JavaScript 代码。确认信任并启用吗？`)) return false;
    }

    try {
      const payload = await invoke<ExternalPluginEntry>("read_external_plugin_entry", { pluginPath: entry.path });
      if (payload.manifest.id !== pluginId) throw new Error("插件入口与发现结果的 ID 不一致");
      const objectUrl = URL.createObjectURL(new Blob([payload.source], { type: "text/javascript" }));
      let module: any;
      try { module = await import(/* @vite-ignore */ objectUrl); }
      finally { URL.revokeObjectURL(objectUrl); }
      const exported = module.default ?? module.plugin ?? module;
      if (!exported || typeof exported.activate !== "function") throw new Error("插件入口必须导出 activate(context) 函数");
      const plugin: VisualPythonPlugin = {
        manifest: payload.manifest,
        activate: (context) => exported.activate(context),
        deactivate: typeof exported.deactivate === "function" ? () => exported.deactivate() : undefined,
      };
      pluginRegistry.register(plugin);
      setTrustedExternalPlugins((current) => {
        const next = { ...current, [pluginId]: true };
        localStorage.setItem("visual-python:trusted-external-plugins", JSON.stringify(next));
        return next;
      });
      await setPluginEnabled(pluginId, true);
      const activatedRecord = pluginRegistry.getRecord(pluginId);
      if (activatedRecord?.state === "error") throw new Error(activatedRecord.error || "插件激活失败");
      setExternalPluginErrors((current) => {
        const next = { ...current };
        delete next[pluginId];
        return next;
      });
      return true;
    } catch (error) {
      const message = `外部插件加载失败：${String(error)}`;
      setExternalPluginErrors((current) => ({ ...current, [pluginId]: String(error) }));
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `${message}\n` }]);
      if (!options.silent) Blockly.dialog.alert(message);
      return false;
    }
  }, [trustedExternalPlugins]);

  const restoreTrustedExternalPlugins = useCallback(async (entries: ExternalPluginDiscovery[]) => {
    for (const entry of entries) {
      const pluginId = entry.manifest?.id;
      if (!pluginId || !trustedExternalPlugins[pluginId] || !getPluginEnabledPreference(pluginId)) continue;
      await loadExternalPlugin(entry, { promptForTrust: false, silent: true });
    }
  }, [loadExternalPlugin, trustedExternalPlugins]);

  const discoverExternalPlugins = useCallback(async () => {
    setDiscoveringPlugins(true);
    try {
      const discovery = await invoke<ExternalPluginDiscoveryResponse>("discover_external_plugins");
      setExternalPlugins(discovery.entries);
      await restoreTrustedExternalPlugins(discovery.entries);
    } catch (error) {
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `Plugin discovery failed: ${String(error)}\n` }]);
    } finally {
      setDiscoveringPlugins(false);
    }
  }, [restoreTrustedExternalPlugins]);

  useEffect(() => {
    if (externalRestoreStarted.current) return;
    externalRestoreStarted.current = true;
    void discoverExternalPlugins();
  }, [discoverExternalPlugins]);

  useEffect(() => {
    if (pluginsOpen) void discoverExternalPlugins();
  }, [discoverExternalPlugins, pluginsOpen]);

  const installExternalPluginZip = useCallback(async () => {
    const path = await open({ multiple: false, filters: [{ name: "Visual Python Plugin", extensions: ["zip"] }] });
    if (!path) return;
    setDiscoveringPlugins(true);
    try {
      await invoke<ExternalPluginDiscovery>("install_external_plugin_zip", { zipPath: path });
      await discoverExternalPlugins();
    } catch (error) {
      const message = `插件安装失败：${String(error)}`;
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `${message}\n` }]);
      Blockly.dialog.alert(message);
    } finally {
      setDiscoveringPlugins(false);
    }
  }, [discoverExternalPlugins]);

  const collectPluginPythonPackages = useCallback(() => {
    const packages = new Set<string>();
    for (const record of pluginRecords) {
      for (const item of record.plugin.manifest.python?.packages ?? []) packages.add(item);
    }
    for (const entry of externalPlugins) {
      for (const item of entry.manifest?.python?.packages ?? []) packages.add(item);
    }
    return [...packages].filter(Boolean);
  }, [externalPlugins, pluginRecords]);

  const checkPluginPythonPackages = useCallback(async () => {
    const packageList = collectPluginPythonPackages();
    if (!pythonEnvironment || !packageList.length) {
      setPackageStatus({});
      return;
    }
    setCheckingPackages(true);
    try {
      const statuses = await invoke<PythonPackageStatus[]>("check_python_packages", { pythonPath: pythonEnvironment.path, packages: packageList });
      setPackageStatus(Object.fromEntries(statuses.map((status) => [status.name, status.installed])));
    } catch (error) {
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `Python 包检测失败：${String(error)}\n` }]);
    } finally {
      setCheckingPackages(false);
    }
  }, [collectPluginPythonPackages, pythonEnvironment]);

  useEffect(() => {
    if (pluginsOpen) void checkPluginPythonPackages();
  }, [checkPluginPythonPackages, pluginsOpen]);

  const stopPackageInstall = useCallback(async () => {
    packageInstallStopping.current = true;
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: "正在停止依赖安装...\n" }]);
    try { await invoke("stop_package_install"); }
    catch (error) { setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `停止依赖安装失败：${String(error)}\n` }]); }
  }, []);

  const installMissingPythonPackages = useCallback(async (packages: string[]) => {
    const missing = [...new Set(packages)].filter((name) => packageStatus[name] === false);
    if (!missing.length) return;
    if (!pythonEnvironment) {
      setSettingsOpen(true);
      setPluginsOpen(false);
      return;
    }
    const mirrorArgs = usePipMirror ? ` -i ${pipMirrorUrl}` : "";
    const command = `"${pythonEnvironment.path}" -m pip install${mirrorArgs} ${missing.join(" ")}`;
    if (!window.confirm(`将在当前 Python 环境中安装缺失依赖：\n\n${missing.join(", ")}\n\n执行命令：\n${command}\n\n确定继续吗？`)) return;
    setPluginsOpen(false);
    setInstallingPackages(true);
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `> ${command}\n\n` }]);
    try {
      await invoke("install_python_packages", { pythonPath: pythonEnvironment.path, packages: missing, indexUrl: usePipMirror ? pipMirrorUrl : null });
    } catch (error) {
      packageInstallStopping.current = false;
      setInstallingPackages(false);
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `依赖安装失败：${String(error)}\n` }]);
      Blockly.dialog.alert(`依赖安装失败：${String(error)}`);
    }
  }, [packageStatus, pythonEnvironment, usePipMirror]);

  const choosePythonExecutable = useCallback(async () => {
    const path = await open({ multiple: false, filters: [{ name: "Python executable", extensions: ["exe"] }] });
    if (!path) return;
    setDetectingPython(true);
    try {
      const environment = await invoke<PythonEnvironment>("validate_python", { path });
      setPythonEnvironments((items) => [environment, ...items.filter((item) => item.path !== environment.path)]); selectPythonEnvironment(environment);
    } catch (error) { setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `无效的 Python 解释器：${String(error)}\n` }]); }
    finally { setDetectingPython(false); }
  }, [selectPythonEnvironment]);

  useEffect(() => {
    const unlisteners = Promise.all([
      listen<PythonOutputEvent>("python-output", ({ payload }) => {
        if (taskId.current === 0) taskId.current = payload.task_id;
        if (taskId.current !== payload.task_id) return;
        enqueueOutput(payload.stream, payload.data);
        if (payload.stream === "stderr") {
          stderrBuffer.current = `${stderrBuffer.current}${payload.data}`.slice(-12000);
        }
      }),
      listen<PythonFinishedEvent>("python-finished", ({ payload }) => {
        if (taskId.current === 0) taskId.current = payload.task_id;
        if (taskId.current !== payload.task_id) return;
        if (payload.timed_out) {
          setProblems([{ id: problemId.current++, kind: "timeout", line: 0, message: "运行超过 60 秒，已终止。" }]);
          setActivePanel("problems");
        } else if (!payload.stopped && payload.exit_code !== 0) {
          const line = Number([...stderrBuffer.current.matchAll(/File "<string>", line (\d+)/g)].at(-1)?.[1] || 0);
          const blockId = line ? pythonBlockIdByLine.current.get(line) : undefined;
          const block = blockId ? workspace.current?.getBlockById(blockId) : undefined;
          const diagnosis = diagnosePythonError(stderrBuffer.current || `PythonError: Python 进程退出代码 ${payload.exit_code}`, block || undefined);
          const parsedCodeDiagnostic = pythonRunUsesCodeSource.current
            ? parsePythonRuntimeDiagnostic(stderrBuffer.current, pythonRunSourceCode.current)
            : null;
          const codeSourceUnchanged = sourceCodeRef.current === pythonRunSourceCode.current;
          const inlineDiagnostic = codeSourceUnchanged ? parsedCodeDiagnostic : null;
          if (inlineDiagnostic) setCodeRuntimeDiagnostic(inlineDiagnostic);
          setProblems([{ id: problemId.current++, kind: "runtime", line: pythonRunUsesCodeSource.current && !codeSourceUnchanged ? 0 : line, message: parsedCodeDiagnostic?.message || diagnosis.message, blockId, suggestion: parsedCodeDiagnostic?.suggestion || diagnosis.suggestion }]);
          setActivePanel("problems");
          if (blockId) requestAnimationFrame(() => focusBlock(blockId));
        }
        const status = payload.timed_out ? "运行超时" : payload.stopped ? "程序已停止" : `进程退出代码：${payload.exit_code}`;
        enqueueOutput("system", `${status}\n`);
        taskId.current = null; setRunning(false);
      }),
      listen<PackageInstallOutputEvent>("package-install-output", ({ payload }) => {
        enqueueOutput(payload.stream, payload.data);
      }),
      listen<PackageInstallFinishedEvent>("package-install-finished", ({ payload }) => {
        setInstallingPackages(false);
        packageInstallStopping.current = false;
        if (payload.stopped) {
          enqueueOutput("system", "依赖安装已停止。\n");
          return;
        }
        if (payload.success) {
          const packageNames = payload.packages.length ? payload.packages.join(", ") : "Python";
          const message = `已安装 ${packageNames} 依赖。`;
          enqueueOutput("system", `${message}\n`);
          void checkPluginPythonPackages();
          Blockly.dialog.alert(message);
          return;
        }
        const message = `依赖安装失败：${payload.error || "未知错误"}`;
        enqueueOutput("stderr", `${message}\n`);
        Blockly.dialog.alert(message);
      }),
      listen<ManimOutputEvent>("manim-output", ({ payload }) => {
        enqueueOutput(payload.stream, payload.data);
        manimProgressBuffer.current = `${manimProgressBuffer.current}${payload.data}`.slice(-8000);
        setManimRenderProgress((current) => current ? parseManimRenderProgress(manimProgressBuffer.current, current) : current);
        if (payload.stream === "stderr") manimStderrBuffer.current = `${manimStderrBuffer.current}${payload.data}`.slice(-24000);
      }),
      listen<ManimFinishedEvent>("manim-finished", ({ payload }) => {
        setRenderingManim(false);
        if (payload.stopped) {
          enqueueOutput("system", "Manim 渲染已停止。\n");
          return;
        }
        if (payload.success) {
          const message = `Manim 渲染完成：${payload.scene}\n${payload.video_path ? `视频文件：${payload.video_path}` : `输出目录：${payload.work_dir}`}`;
          enqueueOutput("system", `${message}\n`);
          if (payload.video_path) {
            setManimVideo({ scene: payload.scene, path: payload.video_path, url: convertFileSrc(payload.video_path), workDir: payload.work_dir });
            openConsolePanel("video");
          } else {
            openConsolePanel("output");
          }
          return;
        }
        const traceback = manimStderrBuffer.current;
        const line = Number([...traceback.matchAll(/File "[^"]*scene\.py", line (\d+)/g)].at(-1)?.[1] || 0);
        const blockId = line ? manimBlockIdByLine.current.get(line) : undefined;
        const block = blockId ? workspace.current?.getBlockById(blockId) : undefined;
        const diagnosis = diagnoseManimError(traceback || String(payload.error || ""), block || undefined);
        const message = `Manim 渲染失败：${diagnosis.message}`;
        setProblems([{ id: problemId.current++, kind: "runtime", line, message, blockId, suggestion: diagnosis.suggestion }]);
        setActivePanel("problems");
        if (blockId) requestAnimationFrame(() => focusBlock(blockId));
        enqueueOutput("stderr", `${message}\n`);
        Blockly.dialog.alert(`${message}\n\n修改建议：${diagnosis.suggestion}`);
      }),
    ]);
    return () => { void unlisteners.then((listeners) => listeners.forEach((unlisten) => unlisten())); };
  }, [checkPluginPythonPackages, enqueueOutput, focusBlock]);

  const writeProject = useCallback(async (path: string, sourceOverride?: string) => {
    if (!workspace.current) return false;
    const data: ProjectFile = { version: 1, name: path.split(/[\\/]/).pop() || projectName, workspace: Blockly.serialization.workspaces.save(workspace.current), plugins: pluginRegistry.createProjectState(workspace.current), sourceCode: sourceCodeInitialized ? sourceOverride ?? sourceCode : undefined, workspaceMode };
    await writeTextFile(path, JSON.stringify(data, null, 2));
    cancelAutosave();
    setProjectName(data.name); setProjectPath(path); setDirty(false); localStorage.removeItem("visual-python:draft"); rememberRecent(path, data.name);
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `已保存：${path}\n` }]);
    return true;
  }, [cancelAutosave, projectName, rememberRecent, sourceCode, sourceCodeInitialized, workspaceMode]);

  const saveProjectAs = useCallback(async (sourceOverride?: string) => {
    const path = await save({ defaultPath: projectPath || projectName, filters: [{ name: "Visual Python", extensions: ["vpy"] }] });
    if (!path) return false;
    const preparedSource = sourceOverride ?? (autoFormatOnSave && workspaceMode === "code" ? await formatCurrentPythonCode(false) : undefined);
    return writeProject(path, preparedSource ?? undefined);
  }, [autoFormatOnSave, formatCurrentPythonCode, projectName, projectPath, workspaceMode, writeProject]);

  const saveProject = useCallback(async () => {
    const sourceOverride = autoFormatOnSave && workspaceMode === "code" ? await formatCurrentPythonCode(false) : undefined;
    return projectPath ? writeProject(projectPath, sourceOverride ?? undefined) : saveProjectAs(sourceOverride ?? undefined);
  }, [autoFormatOnSave, formatCurrentPythonCode, projectPath, saveProjectAs, workspaceMode, writeProject]);

  const loadProject = useCallback(async (path: string, options: { skipDirtyCheck?: boolean } = {}) => {
    if (!workspace.current) return;
    if (!options.skipDirtyCheck && dirty && !window.confirm("当前工程有未保存修改。确定要打开其他工程吗？")) return;
    let projectFileExists = false;
    try {
      const fileContents = await readTextFile(path);
      projectFileExists = true;
      const data = JSON.parse(fileContents) as ProjectFile;
      if (data.version !== 1 || !data.workspace) throw new Error("不支持的工程格式");
      const pluginIssues = await ensureProjectPlugins(data.plugins?.requirements);
      if (pluginIssues.length) {
        setProblems(pluginIssues.map((issue) => ({ id: problemId.current++, kind: "plugin" as const, line: 0, message: issue.message })));
        setActivePanel("problems");
        throw new Error(pluginIssues.map((issue) => issue.message).join("；"));
      }
      const validatedWorkspace = validateWorkspaceState(data.workspace);
      cancelAutosave();
      loadingWorkspace.current = true;
      pluginRegistry.clearProjectData();
      pluginRegistry.loadProjectData(data.plugins);
      Blockly.serialization.workspaces.load(validatedWorkspace, workspace.current);
      workspace.current.clearUndo();
      const generatedCode = generateWorkspacePython(workspace.current);
      const loadedMode = normalizeWorkspaceMode(data.workspaceMode);
      const loadedSourceCode = typeof data.sourceCode === "string" ? data.sourceCode : loadedMode === "code" ? generatedCode : "";
      setProjectName(data.name || path.split(/[\\/]/).pop() || "untitled.vpy"); setProjectPath(path); setDirty(false); localStorage.removeItem("visual-python:draft");
      setCode(generatedCode); setSourceCode(loadedSourceCode); setSourceCodeInitialized(typeof data.sourceCode === "string" || loadedMode === "code"); setWorkspaceMode(loadedMode); setProblems([]); setManimVideo(null); rememberRecent(path, data.name);
      setOutput([{ id: outputId.current++, stream: "system", data: `已打开：${path}\n` }]);
      queueMicrotask(() => { workspace.current?.clearUndo(); loadingWorkspace.current = false; });
    } catch (error) {
      loadingWorkspace.current = false;
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `无法打开工程：${String(error)}\n` }]);
      if (!projectFileExists) setRecentProjects((items) => { const next = items.filter((item) => item.path !== path); localStorage.setItem("visual-python:recent", JSON.stringify(next)); return next; });
    }
  }, [cancelAutosave, dirty, rememberRecent]);

  useEffect(() => {
    let disposed = false;
    const unlisten = listen<OpenProjectEvent>("open-project", ({ payload }) => {
      if (!disposed) void loadProject(payload.path);
    });
    if (!startupProjectRequest.current) startupProjectRequest.current = invoke<string | null>("get_startup_project");
    void startupProjectRequest.current.then((path) => {
      if (disposed || startupProjectOpened.current || !path) return;
      startupProjectOpened.current = true;
      void loadProject(path, { skipDirtyCheck: true });
    });
    return () => {
      disposed = true;
      void unlisten.then((listener) => listener());
    };
  }, [loadProject]);

  const openProject = useCallback(async () => {
    const path = await open({ multiple: false, filters: [{ name: "Visual Python", extensions: ["vpy"] }] });
    if (path) await loadProject(path);
  }, [loadProject]);

  const newProject = useCallback(() => {
    if (!workspace.current) return;
    if (dirty && !window.confirm("当前工程有未保存修改。确定要新建工程吗？")) return;
    cancelAutosave();
    pluginRegistry.clearProjectData();
    loadingWorkspace.current = true; Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [] } }, workspace.current);
    workspace.current.clearUndo();
    setProjectName("untitled.vpy"); setProjectPath(null); setDirty(false); setCode(""); setSourceCode(""); setSourceCodeInitialized(workspaceMode === "code"); setProblems([]); setManimVideo(null); localStorage.removeItem("visual-python:draft");
    setOutput([{ id: outputId.current++, stream: "system", data: "已创建新工程。\n" }]);
    setProjectMenuOpen(false); queueMicrotask(() => { workspace.current?.clearUndo(); loadingWorkspace.current = false; });
  }, [cancelAutosave, dirty, workspaceMode]);

  const loadExample = useCallback(async (example: ExampleProject) => {
    if (!workspace.current) return;
    if (dirty && !window.confirm("当前工程有未保存修改。确定要打开示例吗？")) return;
    try {
      for (const pluginId of example.requiredPlugins ?? []) await setPluginEnabled(pluginId, true);
    } catch (error) {
      const message = `无法启用示例所需插件：${String(error)}`;
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `${message}\n` }]);
      Blockly.dialog.alert(message);
      return;
    }
    const currentWorkspace = workspace.current;
    cancelAutosave();
    pluginRegistry.clearProjectData();
    loadingWorkspace.current = true;
    Blockly.serialization.workspaces.load(migrateWorkspaceState(example.workspace), currentWorkspace);
    currentWorkspace.clearUndo();
    setProjectName(example.projectName);
    setProjectPath(null);
    setDirty(true);
    setCode(generateWorkspacePython(currentWorkspace));
    setSourceCode("");
    setSourceCodeInitialized(false);
    setWorkspaceMode("split");
    setRightPanelOpen(true);
    setProblems([]);
    setManimVideo(null);
    setOutput([{ id: outputId.current++, stream: "system", data: `已加载示例：${example.title}\n` }]);
    setExampleMenuOpen(false);
    localStorage.removeItem("visual-python:draft");
    requestAnimationFrame(() => {
      if (workspace.current === currentWorkspace) { currentWorkspace.clearUndo(); currentWorkspace.zoomToFit(); }
      loadingWorkspace.current = false;
    });
  }, [cancelAutosave, dirty]);

  const exportPython = useCallback(async () => {
    const defaultName = projectName.replace(/\.vpy$/i, ".py");
    const path = await save({ defaultPath: defaultName, filters: [{ name: "Python", extensions: ["py"] }] });
    if (!path) return;
    await writeTextFile(path, activeCode);
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `已导出 Python：${path}\n` }]);
  }, [activeCode, projectName]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.key.toLowerCase() === "s") { event.preventDefault(); void saveProject(); }
      if (event.key.toLowerCase() === "o") { event.preventDefault(); void openProject(); }
      if (event.key.toLowerCase() === "n") { event.preventDefault(); newProject(); }
    };
    const closeMenu = () => setProjectMenuOpen(false);
    window.addEventListener("keydown", onKeyDown); window.addEventListener("blur", closeMenu);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("blur", closeMenu); };
  }, [newProject, openProject, saveProject]);

  const validateBeforeExecution = useCallback(() => {
    if (!isBlockWorkspaceMode(workspaceMode)) return true;
    const ws = workspace.current;
    if (!ws) return true;
    const issues = validatePythonBlockContexts(ws);
    setContextProblems(contextIssuesToProblems(issues));
    if (!issues.length) return true;
    setActivePanel("problems");
    setRightPanelOpen(true);
    requestAnimationFrame(() => focusBlock(issues[0].blockId));
    return false;
  }, [focusBlock, workspaceMode]);

  const runCode = useCallback(async () => {
    if (running) return;
    setProblems([]);
    setCodeRuntimeDiagnostic(null);
    setRightPanelOpen(true);
    setBottomPanelOpen(true);
    if (!validateBeforeExecution()) return;
    stderrBuffer.current = "";
    if (!pythonEnvironment) {
      setProblems([{ id: problemId.current++, kind: "environment", line: 0, message: "请先选择 Python 解释器。" }]);
      setActivePanel("problems"); setPluginsOpen(false); setSettingsOpen(true);
      return;
    }
    const runSource = isBlockWorkspaceMode(workspaceMode) && workspace.current
      ? generateWorkspacePythonWithBlockMap(workspace.current)
      : { code: activeCode, blockIdByLine: new Map<number, string>() };
    pythonRunUsesCodeSource.current = workspaceMode === "code";
    pythonRunSourceCode.current = runSource.code;
    pythonBlockIdByLine.current = runSource.blockIdByLine;
    try {
      await invoke("validate_python_code", { code: runSource.code, pythonPath: pythonEnvironment?.path || null });
    } catch (error) {
      const traceback = String(error);
      const line = Number(traceback.match(/line (\d+)/)?.[1] || 0);
      const blockId = line ? runSource.blockIdByLine.get(line) : undefined;
      const block = blockId ? workspace.current?.getBlockById(blockId) : undefined;
      const diagnosis = diagnosePythonError(traceback || "SyntaxError: Python 语法错误", block || undefined);
      const inlineDiagnostic = workspaceMode === "code" ? parsePythonSyntaxDiagnostic(traceback, runSource.code) : null;
      if (inlineDiagnostic) setCodeSyntaxDiagnostic(inlineDiagnostic);
      setProblems([{ id: problemId.current++, kind: "syntax", line, message: inlineDiagnostic?.message || diagnosis.message, blockId, suggestion: inlineDiagnostic?.suggestion || diagnosis.suggestion }]);
      setActivePanel("problems");
      if (blockId) requestAnimationFrame(() => focusBlock(blockId));
      setOutput([{ id: outputId.current++, stream: "stderr", data: `${traceback}\n` }]);
      return;
    }
    taskId.current = 0;
    setRunning(true); setOutput([{ id: outputId.current++, stream: "system", data: `> Python 运行 ${projectName}\n\n` }]);
    try {
      const startedTaskId = await invoke<number>("start_python", { code: runSource.code, timeoutSecs: 60, pythonPath: pythonEnvironment?.path || null });
      if (taskId.current === 0) taskId.current = startedTaskId;
    } catch (error) {
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `运行失败：${String(error)}\n` }]);
      taskId.current = null;
      setRunning(false);
    }
  }, [activeCode, focusBlock, projectName, pythonEnvironment, running, validateBeforeExecution, workspaceMode]);

  const renderManim = useCallback(async () => {
    if (renderingManim) return;
    setProblems([]);
    setRightPanelOpen(true);
    setBottomPanelOpen(true);
    if (!validateBeforeExecution()) return;
    const sceneNames = extractManimSceneNames(activeCode);
    const sceneName = sceneNames.includes(manimRenderConfig.selectedScene) ? manimRenderConfig.selectedScene : sceneNames[0];
    if (!sceneName) {
      const message = "没有找到 Manim 场景类。请先添加“Manim 场景”积木。";
      setProblems([{ id: problemId.current++, kind: "plugin", line: 0, message }]);
      setActivePanel("problems");
      Blockly.dialog.alert(message);
      return;
    }
    if (!pythonEnvironment) {
      setProblems([{ id: problemId.current++, kind: "environment", line: 0, message: "请先选择 Python 解释器。" }]);
      setActivePanel("problems"); setPluginsOpen(false); setSettingsOpen(true);
      return;
    }
    const renderSource = isBlockWorkspaceMode(workspaceMode) && workspace.current
      ? generateWorkspacePythonWithBlockMap(workspace.current)
      : { code: activeCode, blockIdByLine: new Map<number, string>() };
    manimBlockIdByLine.current = renderSource.blockIdByLine;
    try {
      await invoke("validate_python_code", { code: renderSource.code, pythonPath: pythonEnvironment.path });
    } catch (error) {
      const message = String(error);
      const line = Number(message.match(/line (\d+)/)?.[1] || 0);
      const blockId = line ? renderSource.blockIdByLine.get(line) : undefined;
      setProblems([{ id: problemId.current++, kind: "syntax", line, message: message.trim() || "Python 语法错误", blockId }]);
      setActivePanel("problems");
      if (blockId) requestAnimationFrame(() => focusBlock(blockId));
      setOutput([{ id: outputId.current++, stream: "stderr", data: `${message}\n` }]);
      return;
    }
    manimStderrBuffer.current = "";
    manimProgressBuffer.current = "";
    manimRenderStartedAt.current = Date.now();
    setManimRenderElapsed(0);
    setManimRenderProgress(initialManimRenderProgress(sceneName));
    setRenderingManim(true);
    setActivePanel("output");
    setOutput([{ id: outputId.current++, stream: "system", data: `> Manim 渲染 ${sceneName}\n\n` }]);
    try {
      await invoke("render_manim", { code: renderSource.code, sceneName, pythonPath: pythonEnvironment.path, renderConfig: manimRenderConfig, storagePath: manimStoragePath || null });
    } catch (error) {
      setRenderingManim(false);
      const message = `Manim 渲染启动失败：${String(error)}`;
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `${message}\n` }]);
      Blockly.dialog.alert(message);
    }
  }, [activeCode, focusBlock, manimRenderConfig, manimStoragePath, pythonEnvironment, renderingManim, validateBeforeExecution, workspaceMode]);

  const stopManimRender = useCallback(async () => {
    if (!renderingManim) return;
    setManimRenderProgress((current) => current ? { ...current, phase: "stopping", label: "正在停止渲染", percent: undefined } : current);
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: "正在停止 Manim 渲染...\n" }]);
    try {
      await invoke("stop_manim_render");
    } catch (error) {
      const message = `停止 Manim 渲染失败：${String(error)}`;
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `${message}\n` }]);
      Blockly.dialog.alert(message);
    }
  }, [renderingManim]);

  const openSystemVideo = useCallback(async () => {
    if (!manimVideo) return;
    try {
      await invoke("open_system_video", { path: manimVideo.path });
    } catch (error) {
      Blockly.dialog.alert(`无法打开视频：${String(error)}`);
    }
  }, [manimVideo]);

  const revealVideoInFolder = useCallback(async () => {
    if (!manimVideo) return;
    try {
      await invoke("reveal_video_in_folder", { path: manimVideo.path });
    } catch (error) {
      Blockly.dialog.alert(`无法打开所在文件夹：${String(error)}`);
    }
  }, [manimVideo]);

  const stopCode = useCallback(async () => {
    if (taskId.current === null) return;
    const stoppingTask = taskId.current;
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: "正在停止程序...\n" }]);
    await invoke("stop_python", { taskId: stoppingTask });
  }, []);

  const manimSceneNames = extractManimSceneNames(activeCode);
  const manimSceneName = manimSceneNames.includes(manimRenderConfig.selectedScene) ? manimRenderConfig.selectedScene : manimSceneNames[0];
  const hasMultipleManimScenes = manimSceneNames.length > 1;
  useEffect(() => { if (!hasMultipleManimScenes) setManimSceneMenuOpen(false); }, [hasMultipleManimScenes]);
  const primaryActionLabel = renderingManim ? "停止渲染" : running ? "停止" : manimSceneName ? "渲染" : "运行";
  const primaryActionTitle = renderingManim ? "停止 Manim 渲染" : running ? "停止运行" : manimSceneName ? `渲染 Manim 场景 ${manimSceneName}` : "运行当前 Python 代码";
  const primaryActionIcon = renderingManim || running ? <Square size={14} fill="currentColor"/> : manimSceneName ? <Film size={15}/> : <Play size={15} fill="currentColor"/>;
  const primaryActionClass = `run-button ${renderingManim || running ? "stopping" : ""} ${manimSceneName && !running ? "manim" : ""}`;
  const manimPluginActive = pluginRecords.some((record) => record.plugin.manifest.id === "visual-python.manim" && record.state === "active");
  const codeOutline = workspaceMode === "code" ? getPythonOutline(sourceCode) : [];
  const blockOutline = useMemo(() => {
    const currentWorkspace = workspace.current;
    return currentWorkspace ? buildBlockOutline(
      currentWorkspace,
      new Set([...contextProblems, ...problems].flatMap((problem) => problem.blockId ? [problem.blockId] : [])),
    ) : [];
  }, [contextProblems, problems, workspaceRevision]);
  const visibleBlockOutline = useMemo(() => filterBlockOutline(blockOutline, blockOutlineQuery), [blockOutline, blockOutlineQuery]);
  useEffect(() => {
    if (!codeOutline.length && codeOutlineOpen) setCodeOutlineOpen(false);
  }, [codeOutline.length, codeOutlineOpen]);
  useEffect(() => {
    if (!blockOutline.length && blockOutlineOpen) setBlockOutlineOpen(false);
  }, [blockOutline.length, blockOutlineOpen]);
  const focusCodeOutlineItem = (item: PythonOutlineItem) => {
    codeEditor.current?.revealLineInCenter(item.lineNumber);
    codeEditor.current?.setPosition({ lineNumber: item.lineNumber, column: item.column });
    codeEditor.current?.focus();
    setCodeOutlineOpen(false);
  };
  const toggleOutlineBlock = (blockId: string) => {
    const block = workspace.current?.getBlockById(blockId);
    if (!block) return;
    block.setCollapsed(!block.isCollapsed());
    setWorkspaceRevision((revision) => revision + 1);
  };
  const blockOutlineIcon = (node: BlockOutlineNode) => {
    if (node.kind === "scene") return <Film size={14}/>;
    if (node.kind === "function") return <Braces size={14}/>;
    if (node.kind === "class") return <Box size={14}/>;
    if (node.kind === "control") return <RefreshCw size={14}/>;
    return <Blocks size={14}/>;
  };
  const renderBlockOutline = (nodes: BlockOutlineNode[], depth = 0): ReactNode => nodes.map((node) => <div className="block-outline-branch" key={node.id}>
    <div className="block-outline-node" style={{ paddingLeft: 6 + depth * 16 }}>
      <button className="block-outline-main" onClick={() => { focusBlock(node.id); setBlockOutlineOpen(false); }} title={node.label}>
        <span className={`block-outline-icon outline-${node.kind}`}>{blockOutlineIcon(node)}</span>
        <span className="block-outline-label"><strong>{node.label}</strong><small>{node.type}</small></span>
        {node.issueCount > 0 && <span className="block-outline-issues" title={`${node.issueCount} 个问题`}>{node.issueCount}</span>}
        {node.blockCount > 1 && <span className="block-outline-count">{node.blockCount}</span>}
      </button>
      {depth === 0 && node.children.length > 0 && <button className="block-outline-collapse" onClick={() => toggleOutlineBlock(node.id)} title={node.collapsed ? "展开画布积木组" : "折叠画布积木组"} aria-label={node.collapsed ? "展开画布积木组" : "折叠画布积木组"}>{node.collapsed ? <ChevronRight size={13}/> : <ChevronDown size={13}/>}</button>}
    </div>
    {node.children.length > 0 && (!node.collapsed || blockOutlineQuery.trim()) && renderBlockOutline(node.children, depth + 1)}
  </div>);
  const pythonExampleCatalog = exampleLibrary?.pythonExampleCatalog ?? [];
  const codeSyntaxProblems: CodeProblem[] = codeSyntaxDiagnostic ? [{ id: "code-live-syntax", kind: "syntax", line: codeSyntaxDiagnostic.line, message: codeSyntaxDiagnostic.message, suggestion: codeSyntaxDiagnostic.suggestion }] : [];
  const codeRuntimeProblems: CodeProblem[] = codeRuntimeDiagnostic ? [{ id: "code-live-runtime", kind: "runtime", line: codeRuntimeDiagnostic.line, message: codeRuntimeDiagnostic.message, suggestion: codeRuntimeDiagnostic.suggestion }] : [];
  const pyrightProblems: CodeProblem[] = codeSyntaxDiagnostic ? [] : pyrightDiagnostics
    .filter((diagnostic) => (diagnostic.severity ?? 1) <= 2)
    .map((diagnostic, index) => {
      const friendly = formatPyrightDiagnostic(diagnostic);
      return {
        id: `pyright-${diagnostic.range.start.line}-${diagnostic.range.start.character}-${String(typeof diagnostic.code === "object" ? diagnostic.code.value : diagnostic.code)}-${index}`,
        kind: "syntax",
        line: diagnostic.range.start.line + 1,
        message: friendly.message,
        suggestion: friendly.suggestion,
      };
    });
  const displayedProblems = workspaceMode === "code"
    ? [...codeSyntaxProblems, ...pyrightProblems, ...codeRuntimeProblems, ...problems.filter((problem) => !(problem.kind === "syntax" && codeSyntaxDiagnostic) && !(problem.kind === "runtime" && codeRuntimeDiagnostic))]
    : [...contextProblems, ...problems];
  const contextMenuProblem = consoleContextMenu?.problemId
    ? displayedProblems.find((problem) => String(problem.id) === consoleContextMenu.problemId)
    : undefined;
  const formatProblemForClipboard = (problem: CodeProblem) => [
    problem.message,
    problem.suggestion,
    problem.line > 0 ? `Python 第 ${problem.line} 行` : undefined,
  ].filter(Boolean).join("\n");
  const copyConsoleText = async (text: string) => {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error("浏览器拒绝了复制操作");
    } catch (error) {
      Blockly.dialog.alert(`复制失败：${String(error)}`);
    }
  };
  const openConsoleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const problemNode = (event.target as HTMLElement).closest<HTMLElement>("[data-problem-id]");
    const selection = window.getSelection();
    const selectedText = selection?.anchorNode && consolePanelRef.current?.contains(selection.anchorNode)
      ? selection.toString()
      : "";
    const problem = problemNode?.dataset.problemId
      ? displayedProblems.find((item) => String(item.id) === problemNode.dataset.problemId)
      : undefined;
    const problemCanBeLocated = Boolean(problem?.blockId || (workspaceMode === "code" && problem && problem.line > 0));
    const menuItemCount = activePanel === "output" ? 3
      : activePanel === "video" ? 4
      : 2 + (selectedText ? 1 : 0) + (problem ? 1 : 0) + (problemCanBeLocated ? 1 : 0);
    const menuWidth = 220;
    const estimatedMenuHeight = 19 + menuItemCount * 34;
    setConsoleContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - estimatedMenuHeight - 8)),
      panel: activePanel,
      problemId: problemNode?.dataset.problemId,
      selectedText,
    });
  };
  const runConsoleContextAction = (action: () => void | Promise<void>) => {
    setConsoleContextMenu(null);
    void action();
  };
  const handleConsoleContextMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!consoleContextMenuRef.current || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...consoleContextMenuRef.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
      : event.key === "ArrowDown" ? (currentIndex + 1 + items.length) % items.length
      : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  };
  const pythonDifficultyOrder = exampleLibrary?.pythonDifficultyOrder ?? [];
  const pythonDifficultyLabels: Record<string, string> = exampleLibrary?.pythonDifficultyLabels ?? {};
  const manimExampleCatalog = exampleLibrary?.manimExampleCatalog ?? [];
  const manimDifficultyOrder = exampleLibrary?.manimDifficultyOrder ?? [];
  const manimDifficultyLabels: Record<string, string> = exampleLibrary?.manimDifficultyLabels ?? {};
  const runPrimaryAction = useCallback(() => {
    if (renderingManim) return void stopManimRender();
    if (running) return void stopCode();
    return manimSceneName ? void renderManim() : void runCode();
  }, [manimSceneName, renderManim, renderingManim, runCode, running, stopCode, stopManimRender]);

  useEffect(() => {
    const onWorkbenchShortcut = (event: KeyboardEvent) => {
      const action = getWorkbenchShortcutAction(event);
      if (!action) return;
      const overlayOpen = settingsOpen || pluginsOpen || closePromptOpen || manimRenderSettingsOpen || formulaEditorRequest !== null || projectMenuOpen || exampleMenuOpen || shortcutMenuOpen || manimSceneMenuOpen || codeOutlineOpen;
      if (overlayOpen) return;
      if (action.type === "run") {
        if (running || renderingManim) return;
        event.preventDefault();
        runPrimaryAction();
        return;
      }
      if (action.type === "stop") {
        if (!running && !renderingManim) return;
        event.preventDefault();
        runPrimaryAction();
        return;
      }
      if (running || renderingManim) return;
      event.preventDefault();
      changeWorkspaceMode(action.mode);
    };
    window.addEventListener("keydown", onWorkbenchShortcut, true);
    return () => window.removeEventListener("keydown", onWorkbenchShortcut, true);
  }, [changeWorkspaceMode, closePromptOpen, codeOutlineOpen, exampleMenuOpen, formulaEditorRequest, manimRenderSettingsOpen, manimSceneMenuOpen, pluginsOpen, projectMenuOpen, renderManim, renderingManim, runPrimaryAction, running, settingsOpen, shortcutMenuOpen]);

  const sendInput = useCallback(async () => {
    const currentTask = taskId.current;
    if (!running || currentTask === null || currentTask === 0 || !stdinValue.length) return;
    const submitted = stdinValue;
    setStdinValue("");
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "input", data: `${submitted}\n` }]);
    try { await invoke("send_python_input", { taskId: currentTask, input: submitted }); }
    catch (error) { setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `${String(error)}\n` }]); }
  }, [running, stdinValue]);

  const updateCloseBehavior = useCallback((behavior: CloseBehavior) => {
    setCloseBehavior(behavior);
    if (behavior === "ask") localStorage.removeItem("visual-python:close-behavior");
    else localStorage.setItem("visual-python:close-behavior", behavior);
  }, []);

  const prepareApplicationExit = useCallback(() => {
    if (dirty && !window.confirm("当前工程有未保存修改，确定要退出应用吗？")) return false;
    cancelAutosave();
    if (dirty && workspace.current) {
      const draft: DraftProject = {
        version: 1,
        name: projectName,
        path: projectPath,
        savedAt: Date.now(),
        workspace: Blockly.serialization.workspaces.save(workspace.current),
        plugins: pluginRegistry.createProjectState(workspace.current),
        sourceCode: sourceCodeInitialized ? sourceCode : undefined,
        workspaceMode,
      };
      localStorage.setItem("visual-python:draft", JSON.stringify(draft));
    }
    return true;
  }, [cancelAutosave, dirty, projectName, projectPath, sourceCode, sourceCodeInitialized, workspaceMode]);

  const quitApplication = useCallback(async (rememberChoice = false) => {
    if (!prepareApplicationExit()) return false;
    if (rememberChoice) updateCloseBehavior("exit");
    setClosePromptOpen(false);
    try {
      await invoke("exit_application");
      return true;
    } catch (error) {
      Blockly.dialog.alert(`无法退出应用：${String(error)}`);
      return false;
    }
  }, [prepareApplicationExit, updateCloseBehavior]);

  const minimizeToTray = useCallback(async (rememberChoice = false) => {
    if (rememberChoice) updateCloseBehavior("tray");
    setClosePromptOpen(false);
    try {
      await invoke("hide_main_window");
    } catch (error) {
      Blockly.dialog.alert(`无法最小化到托盘：${String(error)}`);
    }
  }, [updateCloseBehavior]);

  const closeWindow = useCallback(() => {
    if (closeBehavior === "tray") {
      void minimizeToTray();
      return;
    }
    if (closeBehavior === "exit") {
      void quitApplication();
      return;
    }
    setSettingsOpen(false);
    setPluginsOpen(false);
    setManimRenderSettingsOpen(false);
    setRememberCloseChoice(false);
    setClosePromptOpen(true);
  }, [closeBehavior, minimizeToTray, quitApplication]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void appWindow.onCloseRequested((event) => {
      event.preventDefault();
      closeWindow();
    }).then((listener) => { if (disposed) listener(); else unlisten = listener; });
    return () => { disposed = true; unlisten?.(); };
  }, [closeWindow]);

  useEffect(() => {
    const unlisten = listen("tray-exit-requested", () => {
      const exit = async () => {
        if (dirty) await invoke("restore_main_window");
        await quitApplication();
      };
      void exit();
    });
    return () => { void unlisten.then((listener) => listener()); };
  }, [dirty, quitApplication]);

  const togglePlugin = useCallback(async (record: PluginRecord) => {
    const enabled = record.state === "active" || record.state === "loading";
    if (enabled) {
      const blockTypes = new Set(pluginRegistry.getBlockTypes(record.plugin.manifest.id));
      const usedBlocks = workspace.current?.getAllBlocks(false).filter((block) => blockTypes.has(block.type)) ?? [];
      if (usedBlocks.length) {
        Blockly.dialog.alert(`画布中仍有 ${usedBlocks.length} 个“${record.plugin.manifest.name}”积木，请先删除这些积木再停用插件。`);
        return;
      }
    }
    await setPluginEnabled(record.plugin.manifest.id, !enabled);
  }, []);

  const toggleExternalPlugin = useCallback(async (entry: ExternalPluginDiscovery) => {
    const pluginId = entry.manifest?.id;
    if (!entry.valid || !pluginId) return;
    const existingRecord = pluginRegistry.getRecord(pluginId);
    if (existingRecord) {
      await togglePlugin(existingRecord);
      return;
    }

    await loadExternalPlugin(entry, { promptForTrust: true });
  }, [loadExternalPlugin, togglePlugin]);

  const deleteExternalPlugin = useCallback(async (entry: ExternalPluginDiscovery) => {
    const pluginId = entry.manifest?.id;
    const label = entry.manifest?.name || entry.path;
    const record = pluginId ? pluginRegistry.getRecord(pluginId) : undefined;
    if (pluginId && record) {
      const blockTypes = new Set(pluginRegistry.getBlockTypes(pluginId));
      const usedBlocks = workspace.current?.getAllBlocks(false).filter((block) => blockTypes.has(block.type)) ?? [];
      if (usedBlocks.length) {
        Blockly.dialog.alert(`画布中仍有 ${usedBlocks.length} 个“${record.plugin.manifest.name}”积木，请先删除这些积木再删除插件。`);
        return;
      }
    }
    if (!window.confirm(`确定要从磁盘删除插件“${label}”吗？`)) return;
    try {
      await invoke("delete_external_plugin", { pluginPath: entry.path });
      if (pluginId && pluginRegistry.getRecord(pluginId)) {
        await setPluginEnabled(pluginId, false);
        await pluginRegistry.unregister(pluginId);
      }
      if (pluginId) {
        setTrustedExternalPlugins((current) => {
          const next = { ...current };
          delete next[pluginId];
          localStorage.setItem("visual-python:trusted-external-plugins", JSON.stringify(next));
          return next;
        });
        setExternalPluginErrors((current) => {
          const next = { ...current };
          delete next[pluginId];
          return next;
        });
      }
      setExternalPlugins((items) => items.filter((item) => item.path !== entry.path));
    } catch (error) {
      const message = `插件删除失败：${String(error)}`;
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `${message}\n` }]);
      Blockly.dialog.alert(message);
    }
  }, []);

  const startRightPanelResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!effectiveRightPanelOpen || workspaceMode === "code") return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = rightPanelWidth;
    document.body.classList.add("resizing-right-panel");
    const move = (moveEvent: PointerEvent) => {
      const availableMaximum = Math.max(360, Math.min(720, window.innerWidth - 540));
      setRightPanelWidth(Math.min(availableMaximum, Math.max(360, startWidth + startX - moveEvent.clientX)));
    };
    const stop = () => {
      document.body.classList.remove("resizing-right-panel");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }, [effectiveRightPanelOpen, rightPanelWidth, workspaceMode]);

  const startBottomPanelResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!effectiveBottomPanelOpen || workspaceMode === "visual") return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = bottomPanelHeight;
    document.body.classList.add("resizing-bottom-panel");
    const move = (moveEvent: PointerEvent) => {
      const availableMaximum = Math.max(160, Math.min(600, window.innerHeight - 300));
      setBottomPanelHeight(Math.min(availableMaximum, Math.max(160, startHeight + startY - moveEvent.clientY)));
    };
    const stop = () => {
      document.body.classList.remove("resizing-bottom-panel");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }, [bottomPanelHeight, effectiveBottomPanelOpen, workspaceMode]);

  const allMissingPythonPackages = collectPluginPythonPackages().filter((name) => packageStatus[name] === false);

  const renderPluginPackageStatus = (packages?: string[]) => {
    if (!packages?.length) return null;
    const missing = packages.filter((name) => packageStatus[name] === false);
    return <span className="plugin-deps">需要 Python 包：{packages.map((name) => {
      const checked = Object.prototype.hasOwnProperty.call(packageStatus, name);
      const installed = packageStatus[name];
      const state = !pythonEnvironment ? "unknown" : checkingPackages && !checked ? "checking" : installed ? "installed" : checked ? "missing" : "unknown";
      const label = state === "installed" ? "已安装" : state === "missing" ? "缺失" : state === "checking" ? "检测中" : "未检测";
      return <span key={name} className={`plugin-package package-${state}`}>{name}<small>{label}</small></span>;
    })}{missing.length ? <button className={`plugin-install-deps ${installingPackages ? "stopping" : ""}`} onClick={() => installingPackages ? void stopPackageInstall() : void installMissingPythonPackages(packages)}>{installingPackages ? "停止安装" : "安装缺失依赖"}</button> : null}</span>;
  };

  return <main className="app-shell">
    <header className="topbar" data-tauri-drag-region onContextMenu={(event) => event.preventDefault()} onPointerDownCapture={prepareNativeWindowDrag} onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest("button")) void appWindow.toggleMaximize(); }}>
      <div className="brand" data-tauri-drag-region><span className="brand-mark" data-tauri-drag-region><Braces size={17} data-tauri-drag-region/></span><strong data-tauri-drag-region>Visual Python</strong><div className="top-menu-group" data-tauri-drag-region ref={topMenuRef}><div className="project-menu-wrap"><button className="project-menu-trigger" aria-expanded={projectMenuOpen} onClick={() => { setProjectMenuOpen((open) => !open); setExampleMenuOpen(false); setShortcutMenuOpen(false); }}>工程 <ChevronDown size={13}/></button>{projectMenuOpen && <div className="project-menu">
        <button onClick={newProject}><FilePlus2 size={15}/><span>新建工程</span><kbd>Ctrl+N</kbd></button>
        <button onClick={() => { setProjectMenuOpen(false); void openProject(); }}><FolderOpen size={15}/><span>打开工程</span><kbd>Ctrl+O</kbd></button>
        <button onClick={() => { setProjectMenuOpen(false); void saveProject(); }}><Save size={15}/><span>保存</span><kbd>Ctrl+S</kbd></button>
        <button onClick={() => { setProjectMenuOpen(false); void saveProjectAs(); }}><SaveAll size={15}/><span>另存为</span></button>
        <button onClick={() => { setProjectMenuOpen(false); void exportPython(); }}><Download size={15}/><span>导出 Python</span></button>
        {recentProjects.length > 0 && <><div className="menu-label">最近工程</div>{recentProjects.map((item) => <button className="recent-project" key={item.path} onClick={() => { setProjectMenuOpen(false); void loadProject(item.path); }}><FileCode2 size={15}/><span><strong>{item.name}</strong><small>{item.path}</small></span></button>)}</>}
      </div>}</div><div className="project-menu-wrap"><button className="project-menu-trigger" aria-expanded={exampleMenuOpen} onClick={() => { setExampleMenuOpen((open) => !open); setProjectMenuOpen(false); setShortcutMenuOpen(false); }}>示例 <ChevronDown size={13}/></button>{exampleMenuOpen && <div className="project-menu example-menu">
        <div className="example-category"><button className="example-category-trigger"><BookOpen size={15}/><span>Python 基础</span><ChevronRight size={14}/></button><div className="project-menu example-submenu grouped-example-submenu">{pythonDifficultyOrder.map((difficulty) => <div className="example-difficulty-group" key={difficulty}><div className="example-difficulty-label">{pythonDifficultyLabels[difficulty]}</div>{pythonExampleCatalog.filter((item) => item.difficulty === difficulty).map((item) => <button key={item.id} disabled={!item.example} onClick={() => item.example && void loadExample(item.example)}><BookOpen size={15}/><span>{item.title}</span></button>)}</div>)}</div></div>
        <div className="example-category"><button className="example-category-trigger"><Film size={15}/><span>Manim</span><ChevronRight size={14}/></button><div className="project-menu example-submenu manim-example-submenu">{manimDifficultyOrder.map((difficulty) => <div className="example-difficulty-group" key={difficulty}><div className="example-difficulty-label">{manimDifficultyLabels[difficulty]}</div>{manimExampleCatalog.filter((item) => item.difficulty === difficulty).map((item) => <button key={item.id} disabled={!item.example} onClick={() => item.example && void loadExample(item.example)}><Film size={15}/><span>{item.title}</span></button>)}</div>)}</div></div>
      </div>}</div><div className="project-menu-wrap">
        <button className="project-menu-trigger" aria-expanded={shortcutMenuOpen} onClick={() => { setShortcutMenuOpen((open) => !open); setProjectMenuOpen(false); setExampleMenuOpen(false); }}><Keyboard size={13}/>快捷键 <ChevronDown size={13}/></button>
        {shortcutMenuOpen && <div className="project-menu shortcut-menu" role="menu" aria-label="快捷键">
          <div className="menu-label">代码编辑</div>
          <button role="menuitem" disabled={workspaceMode !== "code" || formattingCode} onClick={() => { setShortcutMenuOpen(false); void formatCurrentPythonCode(); }}><AlignLeft size={15}/><span>{formattingCode ? "正在格式化" : "格式化 Python 代码"}</span><kbd>Shift+Alt+F</kbd></button>
          <button role="menuitem" disabled={workspaceMode !== "code"} onClick={() => runCodeEditorAction("actions.find")}><Search size={15}/><span>查找</span><kbd>Ctrl+F</kbd></button>
          <button role="menuitem" disabled={workspaceMode !== "code"} onClick={() => runCodeEditorAction("editor.action.startFindReplaceAction")}><Replace size={15}/><span>查找并替换</span><kbd>Ctrl+H</kbd></button>
          <button role="menuitem" disabled={workspaceMode !== "code"} onClick={() => runCodeEditorAction("editor.action.gotoLine")}><ListOrdered size={15}/><span>跳转到行</span><kbd>Ctrl+G</kbd></button>
          <div className="menu-label">工作台</div>
          <button role="menuitem" disabled={running || renderingManim} onClick={() => { setShortcutMenuOpen(false); runPrimaryAction(); }}><Play size={15}/><span>运行当前代码</span><kbd>Ctrl+Enter</kbd></button>
          <button role="menuitem" disabled={!running && !renderingManim} onClick={() => { setShortcutMenuOpen(false); runPrimaryAction(); }}><Square size={15}/><span>停止运行或渲染</span><kbd>Shift+F5</kbd></button>
          <button role="menuitem" disabled={running || renderingManim} onClick={() => { setShortcutMenuOpen(false); changeWorkspaceMode("visual"); }}><Blocks size={15}/><span>纯图形化模式</span><kbd>Alt+1</kbd></button>
          <button role="menuitem" disabled={running || renderingManim} onClick={() => { setShortcutMenuOpen(false); changeWorkspaceMode("split"); }}><Columns2 size={15}/><span>图形化和代码</span><kbd>Alt+2</kbd></button>
          <button role="menuitem" disabled={running || renderingManim} onClick={() => { setShortcutMenuOpen(false); changeWorkspaceMode("code"); }}><Code2 size={15}/><span>纯代码模式</span><kbd>Alt+3</kbd></button>
        </div>}
      </div></div></div>
      <div className="project-title" data-tauri-drag-region title={projectPath || "尚未保存"}><FileCode2 size={15} data-tauri-drag-region/><span data-tauri-drag-region>{projectName}</span>{dirty ? <span className="dirty-dot" data-tauri-drag-region title="未保存"/> : <span className="saved-dot" data-tauri-drag-region title="已保存"/>}</div>
      <div className="toolbar" data-tauri-drag-region>
        <button className="icon-button" title="打开工程" onClick={openProject}><FolderOpen size={17}/></button>
        <button className="icon-button" title="保存工程" onClick={() => void saveProject()}><Save size={17}/></button>
        <span className="toolbar-divider"/>
        <div className="workspace-mode-switch" role="group" aria-label="工作区模式">
          <button className={workspaceMode === "visual" ? "selected" : ""} aria-pressed={workspaceMode === "visual"} aria-label="纯图形化模式" title="纯图形化" disabled={running || renderingManim} onClick={() => changeWorkspaceMode("visual")}><Blocks size={15}/></button>
          <button className={workspaceMode === "split" ? "selected" : ""} aria-pressed={workspaceMode === "split"} aria-label="图形化和代码模式" title="图形化和代码" disabled={running || renderingManim} onClick={() => changeWorkspaceMode("split")}><Columns2 size={15}/></button>
          <button className={workspaceMode === "code" ? "selected" : ""} aria-pressed={workspaceMode === "code"} aria-label="代码模式" title="代码" disabled={running || renderingManim} onClick={() => changeWorkspaceMode("code")}><Code2 size={15}/></button>
        </div>
        <span className="toolbar-divider"/>
        <button className="icon-button" title="撤销" onClick={() => workspaceMode === "code" ? codeEditor.current?.trigger("toolbar", "undo", null) : workspace.current?.undo(false)}><Undo2 size={17}/></button>
        <button className="icon-button" title="重做" onClick={() => workspaceMode === "code" ? codeEditor.current?.trigger("toolbar", "redo", null) : workspace.current?.undo(true)}><Redo2 size={17}/></button>
        {manimPluginActive && <button className="icon-button manim-render-settings-trigger" title="Manim 渲染配置" onClick={() => setManimRenderSettingsOpen(true)}><Settings size={17}/></button>}
        {hasMultipleManimScenes && !renderingManim && !running ? <div className="manim-run-split" ref={manimSceneMenuRef}>
          <button className={`${primaryActionClass} manim-run-main`} onClick={runPrimaryAction} title={primaryActionTitle}>{primaryActionIcon}<span>渲染 {manimSceneName}</span></button>
          <button className="manim-run-menu-trigger" aria-expanded={manimSceneMenuOpen} onClick={() => setManimSceneMenuOpen((open) => !open)} title="选择 Manim 场景"><ChevronDown size={13}/></button>
          {manimSceneMenuOpen && <div className="manim-scene-menu">{manimSceneNames.map((sceneName) => <button key={sceneName} className={sceneName === manimSceneName ? "selected" : ""} onClick={() => { updateManimRenderConfig({ selectedScene: sceneName }); setManimSceneMenuOpen(false); }}><span>{sceneName}</span>{sceneName === manimSceneName && <Check size={13}/>}</button>)}</div>}
        </div> : <button className={primaryActionClass} onClick={runPrimaryAction} title={primaryActionTitle}>{primaryActionIcon}{primaryActionLabel}</button>}
        <span className="toolbar-divider window-divider"/>
        <div className="window-controls">
          <button className="window-control" title="最小化" onClick={() => void appWindow.minimize()}><Minus size={16}/></button>
          <button className="window-control" title={windowMaximized ? "还原" : "最大化"} onClick={() => void appWindow.toggleMaximize()}>{windowMaximized ? <Copy size={13}/> : <Square size={11}/>}</button>
          <button className="window-control close" title="关闭" onClick={() => void closeWindow()}><X size={17}/></button>
        </div>
      </div>
    </header>
    <section className={`workbench mode-${workspaceMode} ${effectiveRightPanelOpen ? "" : "right-panel-hidden"} ${effectiveBottomPanelOpen ? "" : "bottom-panel-collapsed"}`} style={{ "--right-panel-width": `${rightPanelWidth}px`, "--bottom-panel-height": `${bottomPanelHeight}px` } as CSSProperties}>
      <aside className="activity-rail" onContextMenu={(event) => event.preventDefault()}>
        <button className={`activity ${isBlockWorkspaceMode(workspaceMode) ? "active" : ""}`} title="切换到纯图形化" disabled={running || renderingManim} onClick={() => changeWorkspaceMode("visual")}><Blocks size={20}/></button>
        <div className="rail-spacer"/><button className={`activity ${pluginsOpen ? "active" : ""}`} title="插件" onClick={() => { setPluginsOpen(true); setSettingsOpen(false); }}><Plug size={20}/></button><button className={`activity ${settingsOpen ? "active" : ""}`} title="设置" onClick={() => { setSettingsOpen(true); setPluginsOpen(false); }}><Settings size={20}/></button>
      </aside>
      <section className="block-panel">
        <div className="block-search" style={{ width: blockToolboxWidth || 172 }} onPointerDown={() => {
          suppressToolboxAutoHide.current = true;
          requestAnimationFrame(() => { suppressToolboxAutoHide.current = false; });
        }}>
          <Search size={14} aria-hidden="true"/>
          <input value={blockSearchQuery} onChange={(event) => showBlockSearchResults(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); closeBlockSearch(); }
          }} placeholder="搜索积木" aria-label="搜索积木" spellCheck={false}/>
          {blockSearchQuery && <button onClick={closeBlockSearch} title="清空搜索" aria-label="清空搜索"><X size={13}/></button>}
        </div>
        <div className="block-outline-wrap" ref={blockOutlineRef}>
          <button ref={blockOutlineTriggerRef} className="block-outline-trigger" disabled={!blockOutline.length} aria-label="积木大纲" title="积木大纲" aria-haspopup="dialog" aria-expanded={blockOutlineOpen} onClick={() => setBlockOutlineOpen((open) => !open)}><ListTree size={16}/></button>
          {blockOutlineOpen && <div className="block-outline-panel" role="dialog" aria-label="积木大纲">
            <header><strong>积木大纲</strong><span>{blockOutline.reduce((total, node) => total + node.blockCount, 0)} 个语句积木</span></header>
            <div className="block-outline-search"><Search size={13}/><input value={blockOutlineQuery} onChange={(event) => setBlockOutlineQuery(event.target.value)} placeholder="搜索画布中的积木" aria-label="搜索画布中的积木" spellCheck={false}/>{blockOutlineQuery && <button onClick={() => setBlockOutlineQuery("")} title="清空搜索" aria-label="清空搜索"><X size={12}/></button>}</div>
            <div className="block-outline-tree">{visibleBlockOutline.length ? renderBlockOutline(visibleBlockOutline) : <div className="block-outline-empty">没有找到匹配的积木</div>}</div>
          </div>}
        </div>
        <div ref={host} className="blockly-host"/>
      </section>
      <div className={`panel-resizer ${effectiveRightPanelOpen ? "" : "collapsed"}`} onPointerDown={startRightPanelResize} role="separator" aria-label="调整辅助面板宽度" aria-orientation="vertical"/>
      <aside className={`right-panel ${effectiveRightPanelOpen ? "" : "collapsed"}`} aria-hidden={!effectiveRightPanelOpen}>
        <div className="panel-head"><div className="panel-tab active"><Braces size={14}/> Python</div><div className="panel-head-actions"><span className="read-only">{workspaceMode === "code" ? "可编辑源码" : "实时生成"}</span>{workspaceMode === "code" && <div className="code-outline-wrap" ref={codeOutlineRef}><button ref={codeOutlineTriggerRef} className="code-outline-trigger" disabled={!codeOutline.length} aria-label="代码结构大纲" title="代码结构大纲" aria-haspopup="menu" aria-expanded={codeOutlineOpen} onClick={() => setCodeOutlineOpen((open) => !open)}><ListTree size={15}/></button>{codeOutlineOpen && <div className="code-outline-menu" role="menu" aria-label="代码结构">{codeOutline.map((item) => <button key={`${item.kind}-${item.lineNumber}-${item.label}`} role="menuitem" onClick={() => focusCodeOutlineItem(item)} title={`第 ${item.lineNumber} 行`}><span className={`code-outline-icon outline-${item.kind}`}>{item.kind === "function" ? <Braces size={14}/> : <Box size={14}/>}</span><span className="code-outline-label"><strong>{item.label}</strong><small>{item.kind === "function" ? item.signature : `class ${item.label}`}</small></span><span className="code-outline-line">{item.lineNumber}</span></button>)}</div>}</div>}</div></div>
        <div className="editor-wrap"><Suspense fallback={<div className="editor-loading"/>}><Editor key={workspaceMode === "code" ? "source" : "generated"} language="python" value={activeCode} onChange={updateSourceCode} onMount={mountCodeEditor} theme={monacoThemes[visualThemeId]} options={{ readOnly: workspaceMode !== "code", minimap: { enabled: false }, fontFamily: "Cascadia Code, Consolas, monospace", fontSize: editorFontSize, lineHeight: editorFontSize + 9, tabSize: editorIndentSize, insertSpaces: true, detectIndentation: false, padding: { top: 14 }, scrollBeyondLastLine: false, automaticLayout: true, fixedOverflowWidgets: true, renderLineHighlight: workspaceMode === "code" ? "line" : "none", wordWrap: "off", quickSuggestions: { other: true, comments: false, strings: false }, suggestOnTriggerCharacters: true, acceptSuggestionOnEnter: "on", tabCompletion: "on", snippetSuggestions: "top", parameterHints: { enabled: true, cycle: false }, scrollbar: { horizontal: "auto", alwaysConsumeMouseWheel: false }, overviewRulerBorder: false }}/></Suspense></div>
        <div className={`console-resizer ${workspaceMode === "visual" || !effectiveBottomPanelOpen ? "collapsed" : ""}`} onPointerDown={startBottomPanelResize} role="separator" aria-label="调整输出面板高度" aria-orientation="horizontal" aria-valuemin={160} aria-valuemax={600} aria-valuenow={bottomPanelHeight}/>
        <div ref={consolePanelRef} className={`console-panel ${effectiveBottomPanelOpen ? "" : "collapsed"}`} onContextMenu={openConsoleContextMenu}>
          <div className="console-tabs"><button className={activePanel === "output" ? "active" : ""} onClick={() => openConsolePanel("output")}><Terminal size={13}/> 输出</button><button className={activePanel === "problems" ? "active" : ""} onClick={() => openConsolePanel("problems")}>问题 <span className="count">{displayedProblems.length}</span></button><button className={activePanel === "video" ? "active" : ""} onClick={() => openConsolePanel("video")}><Film size={13}/> 视频</button><span className="console-spacer"/><button className="clear-output" onClick={clearConsole} title="清空输出" aria-label="清空输出"><Trash2 size={13}/></button><button className="panel-collapse" onClick={() => workspaceMode === "visual" ? setRightPanelOpen(false) : setBottomPanelOpen((open) => !open)} title={workspaceMode === "visual" ? "关闭辅助面板" : effectiveBottomPanelOpen ? "折叠输出面板" : "展开输出面板"} aria-label={workspaceMode === "visual" ? "关闭辅助面板" : effectiveBottomPanelOpen ? "折叠输出面板" : "展开输出面板"}>{effectiveBottomPanelOpen ? <PanelBottomClose size={14}/> : <PanelBottomOpen size={14}/>}</button></div>
          <div className={`console-content ${renderingManim && manimRenderProgress ? "has-manim-render-status" : ""}`}>
            {renderingManim && manimRenderProgress && <div className={`manim-render-status phase-${manimRenderProgress.phase}`} role="progressbar" aria-label={`${manimRenderProgress.scene} ${manimRenderProgress.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={manimRenderProgress.percent}>
              <div className="manim-render-status-text"><Film size={13}/><strong>{manimRenderProgress.scene}</strong><span>{manimRenderProgress.label}</span></div>
              <time>{formatRenderElapsed(manimRenderElapsed)}</time>
              <div className={`manim-render-progress-track ${manimRenderProgress.percent === undefined ? "indeterminate" : ""}`}><span style={manimRenderProgress.percent === undefined ? undefined : { width: `${manimRenderProgress.percent}%` }}/></div>
            </div>}
            {activePanel === "output" ? <div className="console-scroll"><pre>{output.map((entry) => <span key={entry.id} className={`output-${entry.stream}`}>{entry.data}</span>)}</pre></div> : activePanel === "problems" ? <div className="problem-list">{displayedProblems.length ? displayedProblems.map((problem) => { const locatable = Boolean(problem.blockId || (workspaceMode === "code" && problem.line > 0)); return <div key={problem.id} data-problem-id={String(problem.id)} className={`problem-${problem.kind} ${locatable ? "problem-locatable" : ""}`} onClick={() => locatable && focusProblem(problem)} title={problem.blockId ? "点击定位到积木" : locatable ? "点击定位到代码" : undefined}><span className="problem-badge">{{ context: "语", syntax: "语", runtime: "错", timeout: "超", environment: "环", plugin: "插" }[problem.kind]}</span><span><strong>{problem.message}</strong>{problem.suggestion && <em>{problem.suggestion}</em>}<small>{problem.blockId ? problem.kind === "context" ? "编辑期语法检查 · 点击定位到积木" : "已定位到相关积木" : problem.line ? `Python 第 ${problem.line} 行${workspaceMode === "code" ? " · 点击定位" : ""}` : { context: "编辑期语法检查", syntax: "语法检查", runtime: "运行时错误", timeout: "执行超时", environment: "Python 环境", plugin: "插件依赖" }[problem.kind]}</small></span></div>; }) : <div className="no-problems">没有检测到问题。</div>}</div> : <div className="video-preview-panel">{manimVideo ? <><div className="video-preview-actions"><button onClick={() => void openSystemVideo()} title="使用本地播放器打开"><ExternalLink size={14}/></button><button onClick={() => void revealVideoInFolder()} title="打开所在文件夹"><FolderOpen size={14}/></button></div><video key={manimVideo.url} src={manimVideo.url} controls/></> : <div className="empty-video-preview"><Film size={24}/><strong>暂无渲染视频</strong><span>渲染 Manim 场景后会在这里预览。</span></div>}</div>}
            {activePanel === "output" && <div className="stdin-row"><span className="stdin-prompt">›</span><input value={stdinValue} onChange={(event) => setStdinValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void sendInput(); }} placeholder={running ? "输入内容并按 Enter" : "程序运行时可输入"} disabled={!running}/><button onClick={sendInput} disabled={!running || !stdinValue.length} title="发送输入"><Send size={14}/></button></div>}
          </div>
        </div>
      </aside>
    </section>
    <footer className="statusbar" onContextMenu={(event) => event.preventDefault()}><button className="environment-status" onClick={() => { setSettingsOpen(true); setPluginsOpen(false); }}>{pythonEnvironment ? `Python ${pythonEnvironment.version}` : "未选择 Python"}</button><span className="status-spacer"/>{workspaceMode === "code" && <div className="editor-status-items"><button onClick={() => runCodeEditorAction("editor.action.gotoLine")} title="跳转到行">行 {codeCursorPosition.lineNumber}，列 {codeCursorPosition.column}</button><span title="Python 缩进宽度">空格: {codeIndentSize}</span><span title="文件编码">UTF-8</span></div>}<span>{running ? "正在运行" : renderingManim ? "正在渲染" : "就绪"}</span></footer>
    {consoleContextMenu && <div ref={consoleContextMenuRef} className="console-context-menu" role="menu" aria-label="面板操作" style={{ left: consoleContextMenu.x, top: consoleContextMenu.y }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }} onKeyDown={handleConsoleContextMenuKeyDown}>
      {consoleContextMenu.panel === "output" && <>
        <button role="menuitem" disabled={!consoleContextMenu.selectedText && !output.length} onClick={() => runConsoleContextAction(() => copyConsoleText(consoleContextMenu.selectedText || output.map((entry) => entry.data).join("")))}><Copy size={15}/><span>{consoleContextMenu.selectedText ? "复制所选内容" : "复制全部输出"}</span><kbd>Ctrl+C</kbd></button>
        <button role="menuitem" disabled={!output.length} onClick={() => runConsoleContextAction(clearConsole)}><Trash2 size={15}/><span>清空输出</span></button>
      </>}
      {consoleContextMenu.panel === "problems" && <>
        {consoleContextMenu.selectedText && <button role="menuitem" onClick={() => runConsoleContextAction(() => copyConsoleText(consoleContextMenu.selectedText))}><Copy size={15}/><span>复制所选内容</span><kbd>Ctrl+C</kbd></button>}
        {contextMenuProblem && <button role="menuitem" onClick={() => runConsoleContextAction(() => copyConsoleText(formatProblemForClipboard(contextMenuProblem)))}><Copy size={15}/><span>复制此问题</span></button>}
        {contextMenuProblem && (contextMenuProblem.blockId || (workspaceMode === "code" && contextMenuProblem.line > 0)) && <button role="menuitem" onClick={() => runConsoleContextAction(() => focusProblem(contextMenuProblem))}><Search size={15}/><span>定位此问题</span></button>}
        <button role="menuitem" disabled={!displayedProblems.length} onClick={() => runConsoleContextAction(() => copyConsoleText(displayedProblems.map(formatProblemForClipboard).join("\n\n")))}><ListOrdered size={15}/><span>复制全部问题</span></button>
      </>}
      {consoleContextMenu.panel === "video" && <>
        <button role="menuitem" disabled={!manimVideo} onClick={() => runConsoleContextAction(openSystemVideo)}><ExternalLink size={15}/><span>使用本地播放器打开</span></button>
        <button role="menuitem" disabled={!manimVideo} onClick={() => runConsoleContextAction(revealVideoInFolder)}><FolderOpen size={15}/><span>打开所在文件夹</span></button>
        <button role="menuitem" disabled={!manimVideo} onClick={() => runConsoleContextAction(() => copyConsoleText(manimVideo?.path || ""))}><Copy size={15}/><span>复制视频路径</span></button>
      </>}
      <div className="console-context-separator" role="separator"/>
      <button role="menuitem" onClick={() => runConsoleContextAction(() => workspaceMode === "visual" ? setRightPanelOpen(false) : setBottomPanelOpen(false))}><PanelBottomClose size={15}/><span>{workspaceMode === "visual" ? "关闭辅助面板" : "折叠面板"}</span></button>
    </div>}
    {formulaEditorRequest && <Suspense fallback={<div className="formula-editor-backdrop"><div className="formula-editor-loading"><Braces size={22}/><span>正在准备公式编辑器...</span></div></div>}><FormulaEditorDialog request={formulaEditorRequest} onClose={() => setFormulaEditorRequest(null)}/></Suspense>}
    {manimRenderSettingsOpen && <div className="settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setManimRenderSettingsOpen(false); }}><section className="settings-dialog manim-render-settings-dialog" role="dialog" aria-modal="true" aria-label="Manim 渲染配置">
      <header><div><span className="settings-icon manim-settings-icon"><Film size={18}/></span><div><h2>Manim 渲染配置</h2><p>配置保存在当前工程中</p></div></div><button className="dialog-close" onClick={() => setManimRenderSettingsOpen(false)} title="关闭"><X size={18}/></button></header>
      <div className="manim-settings-shell"><nav className="settings-navigation manim-settings-navigation" aria-label="Manim 渲染配置分类">{([
        { id: "output", label: "输出", detail: "质量与帧率", icon: <Film size={18}/> },
        { id: "renderer", label: "渲染器", detail: "引擎与缓存", icon: <Settings size={18}/> },
        { id: "storage", label: "存储", detail: "文件与空间", icon: <FolderOpen size={18}/> },
      ] as Array<{ id: ManimSettingsSection; label: string; detail: string; icon: ReactNode }>).map((item) => <button key={item.id} className={manimSettingsSection === item.id ? "selected" : ""} aria-current={manimSettingsSection === item.id ? "page" : undefined} onClick={() => setManimSettingsSection(item.id)}><span>{item.icon}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><ChevronRight size={16}/></button>)}</nav><div className="manim-settings-pane">
        {manimSettingsSection === "output" && <section className="manim-settings-page"><div className="manim-settings-page-header"><h3>输出</h3><p>设置视频清晰度与播放流畅度。</p></div><div className="manim-option-group"><div><strong>质量预设</strong><small>分辨率越高，渲染时间和文件体积越大</small></div><div className="manim-segmented">{([{ value: "preview", label: "预览", detail: "360p" }, { value: "low", label: "低", detail: "480p" }, { value: "medium", label: "中", detail: "720p" }, { value: "high", label: "高", detail: "1080p" }, { value: "four_k", label: "4K", detail: "2160p" }] as const).map((option) => <button key={option.value} className={manimRenderConfig.quality === option.value ? "selected" : ""} onClick={() => updateManimRenderConfig({ quality: option.value })}><strong>{option.label}</strong><small>{option.detail}</small></button>)}</div></div><div className="manim-option-group"><div><strong>帧率</strong><small>更高帧率适合快速运动和复杂动画</small></div><div className="manim-choice-row">{([15, 30, 60] as const).map((fps) => <button key={fps} className={manimRenderConfig.fps === fps ? "selected" : ""} onClick={() => updateManimRenderConfig({ fps })}>{fps} FPS</button>)}</div></div></section>}
        {manimSettingsSection === "renderer" && <section className="manim-settings-page"><div className="manim-settings-page-header"><h3>渲染器</h3><p>选择渲染引擎并控制缓存策略。</p></div><div className="manim-option-group"><div><strong>渲染引擎</strong><small>根据场景类型选择合适的渲染方式</small></div><div className="manim-renderer-options"><button className={manimRenderConfig.renderer === "cairo" ? "selected" : ""} onClick={() => updateManimRenderConfig({ renderer: "cairo" })}><strong>Cairo</strong><small>兼容性更好，适合大多数 2D 场景</small></button><button className={manimRenderConfig.renderer === "opengl" ? "selected" : ""} onClick={() => updateManimRenderConfig({ renderer: "opengl" })}><strong>OpenGL</strong><small>适合实时预览与需要 GPU 的场景</small></button></div></div><div className="manim-cache-row"><div><strong>禁用缓存</strong><small>每次渲染都重新生成全部内容，排查缓存问题时使用</small></div><button className={`plugin-toggle ${manimRenderConfig.disableCaching ? "enabled" : ""}`} role="switch" aria-checked={manimRenderConfig.disableCaching} aria-label="禁用 Manim 渲染缓存" onClick={() => updateManimRenderConfig({ disableCaching: !manimRenderConfig.disableCaching })}><span/></button></div></section>}
        {manimSettingsSection === "storage" && <section className="manim-settings-page manim-storage-section"><div className="manim-settings-page-header"><h3>渲染存储</h3><p>查看当前工程产生的渲染文件与占用空间。</p></div><div className="manim-storage-summary"><div><small>占用空间</small><strong>{loadingManimStorage ? "正在计算..." : formatStorageSize(manimStorageInfo?.sizeBytes || 0)}</strong></div><div><small>渲染记录</small><strong>{manimStorageInfo?.renderCount || 0} 次</strong></div></div><div className="manim-storage-location"><span>存储位置</span><code title={manimStorageInfo?.path}>{manimStorageInfo?.path || "正在读取渲染目录..."}</code><small>此位置仅影响后续渲染，不会迁移已有文件。</small></div><div className="manim-storage-actions"><button onClick={() => void chooseManimStorageFolder()} disabled={loadingManimStorage || renderingManim}><FolderOpen size={16}/>更改位置</button><button onClick={() => void openManimRenderFolder()} disabled={loadingManimStorage}><ExternalLink size={16}/>打开目录</button>{manimStoragePath && <button onClick={resetManimStorageFolder} disabled={loadingManimStorage || renderingManim}><Undo2 size={16}/>恢复默认</button>}<button className="danger" onClick={() => void clearManimRenderFiles()} disabled={loadingManimStorage || clearingManimStorage || renderingManim}><Trash2 size={16}/>{clearingManimStorage ? "正在清理..." : "清理渲染文件"}</button></div></section>}
      </div></div>
    </section></div>}
    {closePromptOpen && <div className="settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setClosePromptOpen(false); }}><section className="settings-dialog close-choice-dialog" role="dialog" aria-modal="true" aria-label="关闭 Visual Python">
      <header><div><span className="settings-icon close-choice-icon"><Power size={18}/></span><div><h2>关闭 Visual Python</h2><p>选择关闭按钮的行为</p></div></div><button className="dialog-close" onClick={() => setClosePromptOpen(false)} title="取消"><X size={18}/></button></header>
      <div className="close-choice-content"><p>你希望 Visual Python 接下来如何运行？</p><div className="close-choice-options"><button className="close-choice-option tray-choice" onClick={() => void minimizeToTray(rememberCloseChoice)}><span className="close-option-icon"><Minimize2 size={20}/></span><span><strong>最小化到托盘</strong><small>应用继续在后台运行，可从系统托盘重新打开</small></span><ChevronRight size={18}/></button><button className="close-choice-option exit-choice" onClick={() => void quitApplication(rememberCloseChoice)}><span className="close-option-icon"><Power size={20}/></span><span><strong>退出应用</strong><small>完全结束应用以及当前正在运行的后台任务</small></span><ChevronRight size={18}/></button></div><label><input type="checkbox" checked={rememberCloseChoice} onChange={(event) => setRememberCloseChoice(event.target.checked)}/>记住我的选择，下次不再询问</label></div>
      <footer className="close-choice-actions"><button onClick={() => setClosePromptOpen(false)}>取消</button></footer>
    </section></div>}
    {settingsOpen && <div className="settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><section className="settings-dialog app-settings-dialog" role="dialog" aria-modal="true" aria-label="应用设置">
      <header><div><span className="settings-icon"><Settings size={18}/></span><div><h2>设置</h2><p>配置 Visual Python 的工作方式</p></div></div><button className="dialog-close" onClick={() => setSettingsOpen(false)} title="关闭"><X size={18}/></button></header>
      <div className="settings-shell"><nav className="settings-navigation" aria-label="设置分类">{([
        { id: "appearance", label: "外观", detail: "主题与界面", icon: <Columns2 size={18}/> },
        { id: "editor", label: "代码编辑", detail: "字号与格式化", icon: <Code2 size={18}/> },
        { id: "python", label: "Python 环境", detail: "解释器选择", icon: <Braces size={18}/> },
        { id: "behavior", label: "应用行为", detail: "关闭方式", icon: <Power size={18}/> },
      ] as Array<{ id: SettingsSection; label: string; detail: string; icon: ReactNode }>).map((item) => <button key={item.id} className={settingsSection === item.id ? "selected" : ""} aria-current={settingsSection === item.id ? "page" : undefined} onClick={() => setSettingsSection(item.id)}><span>{item.icon}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><ChevronRight size={16}/></button>)}</nav><div className="settings-pane">
      {settingsSection === "appearance" && <section className="theme-section"><div className="settings-pane-header"><h3>外观</h3><p>选择适合当前工作环境的界面主题。</p></div><div className="theme-picker">{themeOptions.map((theme) => <button key={theme.id} className={visualThemeId === theme.id ? "selected" : ""} onClick={() => setVisualThemeId(theme.id)}><span className={`theme-swatch swatch-${theme.id}`}/><span><strong>{theme.label}</strong><small>{theme.description}</small></span>{visualThemeId === theme.id && <Check size={16}/>}</button>)}</div></section>}
      {settingsSection === "editor" && <section className="code-preferences-section"><div className="settings-pane-header"><h3>代码编辑</h3><p>调整纯代码模式的阅读、缩进和保存体验。</p></div><div className="code-preferences-grid">
        <div className="code-preference-row"><div><strong>编辑器字号</strong><small id="editor-font-size-help">只影响 Python 代码编辑区，可设置 {editorFontSizeMin}–{editorFontSizeMax} px</small></div><label className="editor-font-size-control"><span>字号</span><input key={editorFontSize} type="number" min={editorFontSizeMin} max={editorFontSizeMax} step={1} defaultValue={editorFontSize} aria-describedby="editor-font-size-help" onBlur={(event) => { const normalized = normalizeEditorFontSize(event.currentTarget.value); event.currentTarget.value = String(normalized); setEditorFontSize(normalized); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}/><span>px</span></label></div>
        <div className="code-preference-row"><div><strong>缩进宽度</strong><small>始终使用空格进行 Python 缩进</small></div><div className="code-preference-segmented" role="group" aria-label="Python 缩进宽度">{editorIndentSizes.map((size) => <button key={size} className={editorIndentSize === size ? "selected" : ""} aria-pressed={editorIndentSize === size} onClick={() => setEditorIndentSize(size)}>{size}</button>)}</div></div>
        <div className="code-preference-row"><div><strong>保存时自动格式化</strong><small>使用 Ruff 整理源码后再保存工程</small></div><button className={`plugin-toggle ${autoFormatOnSave ? "enabled" : ""}`} role="switch" aria-checked={autoFormatOnSave} aria-label="保存时自动格式化 Python" onClick={() => setAutoFormatOnSave((enabled) => !enabled)}><span/></button></div>
      </div></section>}
      {settingsSection === "behavior" && <section className="close-behavior-section"><div className="settings-pane-header"><h3>应用行为</h3><p>设置点击窗口关闭按钮时执行的操作。</p></div><div className="close-behavior-options"><button className={closeBehavior === "ask" ? "selected" : ""} onClick={() => updateCloseBehavior("ask")}><strong>每次询问</strong><small>关闭时显示选择界面</small></button><button className={closeBehavior === "tray" ? "selected" : ""} onClick={() => updateCloseBehavior("tray")}><strong>最小化到托盘</strong><small>应用继续在后台运行</small></button><button className={closeBehavior === "exit" ? "selected" : ""} onClick={() => updateCloseBehavior("exit")}><strong>退出应用</strong><small>完全结束 Visual Python</small></button></div></section>}
      {settingsSection === "python" && <section className="python-settings-section">
        <div className="python-settings-header"><div className="settings-pane-header"><h3>Python 环境</h3><p>选择运行当前工程使用的 Python 解释器。</p></div><div className="settings-actions"><button onClick={() => void detectPythonEnvironments()} disabled={detectingPython}><RefreshCw size={15} className={detectingPython ? "spin" : ""}/>{detectingPython ? "检测中" : "重新检测"}</button><button onClick={() => void choosePythonExecutable()}><FolderOpen size={15}/>选择解释器</button></div></div>
        <div className="environment-list">{pythonEnvironments.length ? pythonEnvironments.map((environment) => {
          const selected = pythonEnvironment?.path.toLowerCase() === environment.path.toLowerCase();
          return <button key={environment.path} className={`environment-item ${selected ? "selected" : ""}`} onClick={() => selectPythonEnvironment(environment)}><span className="environment-check">{selected && <Check size={15}/>}</span><span className="environment-info"><strong>Python {environment.version}</strong><span>{environment.implementation}{environment.virtual_env ? " · 虚拟环境" : " · 系统环境"}</span><code>{environment.path}</code></span></button>;
        }) : <div className="empty-environments"><Braces size={24}/><strong>未检测到 Python</strong><span>安装 Python 3，或手动选择 python.exe</span></div>}</div>
      </section>}
      </div></div>
    </section></div>}
    {pluginsOpen && <div className="settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPluginsOpen(false); }}><section className="settings-dialog plugin-manager-dialog" role="dialog" aria-modal="true" aria-label="插件管理">
      <header><div><span className="settings-icon"><Plug size={18}/></span><div><h2>插件</h2><p>管理 Visual Python 的功能扩展</p></div></div><button className="dialog-close" onClick={() => setPluginsOpen(false)} title="关闭"><X size={18}/></button></header>
      <div className="settings-content">
      <section className="plugin-settings-section"><div className="plugin-settings-heading"><div><span className="settings-label">插件列表</span></div><div className="plugin-heading-actions"><span>{pluginRecords.filter((record) => record.state === "active").length} / {pluginRecords.length} 已启用</span><label className="plugin-mirror-toggle"><input type="checkbox" checked={usePipMirror} onChange={(event) => setUsePipMirror(event.target.checked)}/>使用国内镜像</label>{allMissingPythonPackages.length || installingPackages ? <button className={`plugin-install-all-deps ${installingPackages ? "stopping" : ""}`} onClick={() => installingPackages ? void stopPackageInstall() : void installMissingPythonPackages(allMissingPythonPackages)} disabled={checkingPackages}>{installingPackages ? "停止安装" : "安装全部缺失依赖"}</button> : null}<button onClick={() => void installExternalPluginZip()} disabled={discoveringPlugins}><FolderOpen size={13}/>安装插件</button></div></div><div className="plugin-card-grid">{pluginRecords.map((record) => {
        const manifest = record.plugin.manifest;
        const enabled = record.state === "active" || record.state === "loading";
        const externalDiscovery = manifest.builtin ? undefined : externalPlugins.find((entry) => entry.manifest?.id === manifest.id);
        const pluginError = record.error || externalPluginErrors[manifest.id];
        return <article className={`plugin-card plugin-${record.state}`} key={manifest.id}>{externalDiscovery && <button className="plugin-delete" title="删除插件" disabled={record.state === "loading"} onClick={() => void deleteExternalPlugin(externalDiscovery)}><X size={12}/></button>}<div className="plugin-card-head"><span className="plugin-card-icon"><Blocks size={22}/></span><button className={`plugin-toggle ${enabled ? "enabled" : ""}`} role="switch" aria-checked={enabled} aria-label={`${enabled ? "停用" : "启用"}${manifest.name}`} disabled={record.state === "loading"} onClick={() => void togglePlugin(record)}><span/></button></div><div className="plugin-card-body"><div><strong>{manifest.name}</strong><span className="plugin-tag">{manifest.builtin ? "内置" : "外部"}</span><span className={`plugin-state state-${record.state}`}>{pluginStateLabels[record.state]}</span></div><p>{manifest.description || "暂无描述"}</p>{renderPluginPackageStatus(manifest.python?.packages)}</div><div className="plugin-card-footer"><small>v{manifest.version} · API {manifest.apiVersion}{manifest.entry ? ` · ${manifest.entry}` : ""}</small></div>{pluginError && <code>{pluginError}</code>}</article>;
      })}{externalPlugins.filter((entry) => !entry.manifest || !pluginRecords.some((record) => record.plugin.manifest.id === entry.manifest?.id)).map((entry) => {
        const manifest = entry.manifest;
        const externalRecord = manifest ? pluginRecords.find((record) => record.plugin.manifest.id === manifest.id) : undefined;
        const externalEnabled = externalRecord?.state === "active" || externalRecord?.state === "loading";
        const externalTrusted = Boolean(manifest && trustedExternalPlugins[manifest.id]);
        const externalError = manifest ? externalPluginErrors[manifest.id] : undefined;
        const externalStateLabel = externalError ? "加载失败" : externalEnabled ? "已启用" : externalTrusted ? "已禁用" : "未信任";
        return <article className={`plugin-card external-plugin-card ${entry.valid && !externalError ? "plugin-discovered" : "plugin-error"}`} key={entry.path}><button className="plugin-delete" title="删除插件" onClick={() => void deleteExternalPlugin(entry)}><X size={12}/></button><div className="plugin-card-head"><span className="plugin-card-icon"><Blocks size={22}/></span><button className={`plugin-toggle ${externalEnabled ? "enabled" : ""}`} role="switch" aria-checked={externalEnabled} aria-label={`${externalEnabled ? "停用" : "启用"}${manifest?.name || "外部插件"}`} disabled={!entry.valid || !manifest || externalRecord?.state === "loading"} onClick={() => void toggleExternalPlugin(entry)}><span/></button></div><div className="plugin-card-body"><div><strong>{manifest?.name || "无效插件"}</strong><span className="plugin-tag">外部</span><span className={`plugin-state ${entry.valid && !externalError ? (externalEnabled ? "state-active" : "state-disabled") : "state-error"}`}>{entry.valid ? externalStateLabel : "无效"}</span></div><p>{manifest?.description || entry.path}</p>{renderPluginPackageStatus(manifest?.python?.packages)}</div><div className="plugin-card-footer"><small>{manifest ? `v${manifest.version} · API ${manifest.apiVersion} · ${manifest.entry || "未声明入口"}` : entry.path}</small></div>{externalError && <code>{externalError}</code>}{entry.errors.map((error) => <code key={error}>{error}</code>)}</article>;
      })}</div></section>
      </div>
    </section></div>}
  </main>;
}
