import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as Blockly from "blockly/core";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { isPermissionGranted, onAction, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { OnMount } from "@monaco-editor/react";
import type { CancellationToken as MonacoCancellationToken, editor as MonacoEditor, IRange as MonacoRange, languages as MonacoLanguages, Position as MonacoPosition } from "monaco-editor";
import { AlignLeft, ArrowLeft, Blocks, BookOpen, Box, Braces, Check, ChevronDown, ChevronRight, ChevronUp, Code2, Columns2, Copy, Download, ExternalLink, FileCode2, FilePlus2, Film, FolderOpen, ListOrdered, ListTree, Minimize2, Minus, PanelBottomClose, PanelBottomOpen, Play, Plug, Plus, Power, RefreshCw, Replace, Save, SaveAll, Search, Send, Settings, Sparkles, Square, Terminal, Trash2, Undo2, Redo2, Upload, Volume2, X } from "lucide-react";
import { AiAssistantPanel } from "./AiAssistantPanel";
import { AiModelSettings } from "./AiModelSettings";
import { applyExactCodeEdits, createCodeChangePreview, runAiCodeAgent, type AiAgentActivity, type AiAgentResult, type AiAgentToolName, type AiCodeChangeSnapshot, type AiCodeEdit, type AiConversationTurn, type AiTaskChangeSnapshot } from "./aiAgent";
import { countFakeVoiceoverApis, inspectVoiceovers, insertStandaloneVoiceover, insertSynchronizedVoiceover } from "./aiVoiceover";
import { addPythonImport, insertPythonStatements, replacePythonFunctionBody, type PythonStructure } from "./pythonStructuredEdits";
import { defaultVisualThemeId, findWorkspaceBlockCodeRange, generateWorkspacePython, generateWorkspacePythonWithBlockMap, registerUsedVariablesToolbox, starterState, toolbox, visualPythonThemes, type VisualThemeId } from "./pythonBlocks";
import { validatePythonBlockContexts, type PythonContextIssue } from "./pythonSyntaxBlocks";
import { diagnosePythonError } from "./pythonDiagnostics";
import { findPythonCallContext, findPythonIdentifierOccurrences, getPythonCompletions, getPythonOutline, getPythonSignatures, isPythonCompletionContext, isValidPythonIdentifier, type PythonCompletionKind, type PythonOutlineItem } from "./pythonCompletions";
import { parsePythonRuntimeDiagnostic } from "./pythonRuntimeDiagnostics";
import { parsePythonSyntaxDiagnostic, type PythonCodeDiagnostic } from "./pythonSyntaxDiagnostics";
import { formatPythonSource } from "./pythonFormatter";
import { editorFontOptions, editorFontSizeMax, editorFontSizeMin, editorIndentSizes, getEditorFontFamily, normalizeEditorFontId, normalizeEditorFontSize, normalizeEditorIndentSize, type EditorFontId, type EditorFontSize, type EditorIndentSize } from "./editorPreferences";
import { PyrightClient, type LspCompletionItem, type LspDiagnostic, type LspHover, type LspLocation, type LspLocationLink, type LspRange, type LspSignatureHelp, type LspWorkspaceEdit } from "./pyrightClient";
import { formatPyrightDiagnostic } from "./pyrightDiagnostics";
import type { ExampleProject } from "./examples/types";
import { ensureProjectPlugins, getPluginEnabledPreference, isCorePlugin, pluginRegistry, setPluginEnabled } from "./plugins";
import type { ExternalPluginDiscovery, ExternalPluginDiscoveryResponse, ExternalPluginEntry, PluginRecord, VisualPythonPlugin } from "./plugins/api/types";
import { getManimRenderConfig, setManimRenderConfig, subscribeManimRenderConfig, type ManimRenderConfig } from "./plugins/builtin/manim/renderConfig";
import { bailianTtsModels, getBailianVoiceOptions, getTtsConfig, saveTtsConfig, type TtsConfig } from "./plugins/builtin/manim/ttsConfig";
import { ManimVoiceoverError, prepareManimVoiceovers } from "./plugins/builtin/manim/voiceoverPreprocessor";
import { ManimLocalAudioError, prepareManimLocalAudio } from "./plugins/builtin/manim/localAudioPreprocessor";
import { readVoiceoverBlockMetadata, writeVoiceoverBlockMetadata } from "./plugins/builtin/manim/voiceoverBlockMetadata";
import { getVoiceoverRoles, parseVoiceoverRolesFile, resolveVoiceoverRole, saveVoiceoverRoles, serializeVoiceoverRoles, subscribeVoiceoverRoles, voiceoverRoleOptions, type VoiceoverRole } from "./plugins/builtin/manim/voiceoverRoles";
import { buildManimOutputFilename } from "./plugins/builtin/manim/outputNaming";
import { formatRenderElapsed, initialManimRenderProgress, parseManimRenderProgress, type ManimRenderProgress } from "./plugins/builtin/manim/renderProgress";
import { extractManimSceneNames } from "./plugins/builtin/manim/sceneNames";
import { createSceneDocument, legacySceneDocument, renameSceneDocument, sceneDocumentName, type SceneDocument } from "./sceneDocuments";
import { validateStandaloneSceneSource } from "./sceneValidation";
import { isBlockWorkspaceMode, normalizeWorkspaceMode, type WorkspaceMode } from "./workspaceMode";
import { getWorkbenchShortcutAction } from "./workbenchShortcuts";
import { blockSearchFlyout, createBlockSearchIndex, searchBlockIndex } from "./blockSearch";
import { buildBlockOutline, compactBlockOutline, filterBlockOutline, type BlockOutlineNode } from "./blockOutline";
import { subscribeFormulaEditor, type FormulaEditorRequest } from "./formulaEditorBridge";
import { normalizeProjectFileName, projectFileBaseName } from "./projectNaming";
import { projectResourceReference, resolveProjectResourceReference, type ProjectResource } from "./projectResources";
import { parseDraftProject, parseProjectFile, type DraftProject, type ProjectFile } from "./projectFile";
import { ManimRenderAttempt, ManimRenderCancelledError } from "./manimRenderCancellation";
import { isManimLatexFailure } from "./manimErrorClassification";
import { readStoredPythonEnvironment, supportedPythonRangeLabel, type PythonEnvironment } from "./pythonEnvironment";

type RecentProject = { path: string; name: string; openedAt: number };
type ManimVideoPreview = { scene: string; path: string; url: string; workDir: string };
type SceneConsoleState = { output: OutputEntry[]; problems: CodeProblem[]; video: ManimVideoPreview | null };
type SceneAiStatus = "working" | "changed" | "error" | "validated" | "rendered";
type OutputEntry = { id: number; stream: "stdout" | "stderr" | "system" | "input"; data: string };
type PythonOutputEvent = { task_id: number; stream: OutputEntry["stream"]; data: string };
type PythonFinishedEvent = { task_id: number; exit_code: number; stopped: boolean; timed_out: boolean };
type PackageInstallOutputEvent = { stream: OutputEntry["stream"]; data: string };
type PackageInstallFinishedEvent = { success: boolean; stopped: boolean; error?: string | null; packages: string[] };
type ManimOutputEvent = { task_id: number; stream: OutputEntry["stream"]; data: string };
type ManimFinishedEvent = { task_id: number; success: boolean; stopped: boolean; scene: string; work_dir: string; video_path?: string | null; error?: string | null };
type ManimStorageInfo = { path: string; sizeBytes: number; renderCount: number };
type TtsCacheInfo = { path: string; sizeBytes: number; clipCount: number };
type TtsPreviewResult = { path: string; format: string; durationSeconds: number; cached: boolean };
type ProjectResourceStatus = { path: string; exists: boolean; size: number };
type ImportedProjectResource = ProjectResource & { deduplicated: boolean };
const importedProjectResourceData = (resource: ImportedProjectResource): ProjectResource => ({ id: resource.id, type: resource.type, path: resource.path, originalName: resource.originalName, size: resource.size });
type ProjectResourceFilter = "all" | "used" | "unused" | "missing";
type OpenProjectEvent = { path: string };
type CloseBehavior = "ask" | "tray" | "exit";
type SettingsSection = "appearance" | "editor" | "python" | "ai" | "behavior";
type ManimSettingsSection = "output" | "renderer" | "voice" | "storage";
type ConsolePanel = "output" | "problems" | "video";
type ConsoleContextMenuState = { x: number; y: number; panel: ConsolePanel; problemId?: string; selectedText: string };

type PythonPackageStatus = { name: string; installed: boolean };
type ProblemKind = "context" | "syntax" | "runtime" | "timeout" | "environment" | "plugin" | "resource";
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
const localAudioBlockTypes = new Set(["visual_python_manim_play_local_audio", "visual_python_manim_play_local_audio_with_animation"]);

const readLocalAudioDuration = (path: string) => new Promise<number>((resolve, reject) => {
  const audio = new Audio(convertFileSrc(path));
  const timeout = window.setTimeout(() => finish(() => reject(new Error("读取音频时长超时"))), 10000);
  const finish = (callback: () => void) => {
    window.clearTimeout(timeout);
    audio.removeAttribute("src");
    audio.load();
    callback();
  };
  audio.preload = "metadata";
  audio.addEventListener("loadedmetadata", () => {
    const duration = audio.duration;
    finish(() => Number.isFinite(duration) && duration > 0 ? resolve(duration) : reject(new Error("音频时长无效")));
  }, { once: true });
  audio.addEventListener("error", () => finish(() => reject(new Error("无法读取音频文件"))), { once: true });
  audio.load();
});

const inspectVideoQuality = (url: string) => new Promise<{ durationSeconds: number; width: number; height: number; blankFrameLikely: boolean | null; luminanceSpread: number | null }>((resolve, reject) => {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  const cleanup = () => { video.removeAttribute("src"); video.load(); };
  const fail = () => { cleanup(); reject(new Error("无法读取渲染视频元数据")); };
  video.addEventListener("error", fail, { once: true });
  video.addEventListener("loadedmetadata", () => {
    const durationSeconds = Number.isFinite(video.duration) ? video.duration : 0;
    const width = video.videoWidth;
    const height = video.videoHeight;
    const finishWithoutPixels = () => { cleanup(); resolve({ durationSeconds, width, height, blankFrameLikely: null, luminanceSpread: null }); };
    if (!durationSeconds || !width || !height) return finishWithoutPixels();
    video.currentTime = Math.min(Math.max(0.05, durationSeconds / 2), Math.max(0.05, durationSeconds - 0.05));
    video.addEventListener("seeked", () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 90;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return finishWithoutPixels();
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        let sumSquares = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const luminance = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
          sum += luminance;
          sumSquares += luminance * luminance;
        }
        const count = pixels.length / 4;
        const mean = sum / count;
        const spread = Math.sqrt(Math.max(0, sumSquares / count - mean * mean));
        cleanup();
        resolve({ durationSeconds, width, height, blankFrameLikely: spread < 1.5, luminanceSpread: Number(spread.toFixed(2)) });
      } catch {
        finishWithoutPixels();
      }
    }, { once: true });
  }, { once: true });
  video.src = url;
});

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
  else if (errorType === "AttributeError") suggestion = `当前对象调用了不存在的属性或方法。请检查报错位置的方法名；配音必须通过 AI 专用配音工具插入，不能在 Scene 中调用 self.add_voiceover 或 self.add_synchronized_voiceover。`;
  else if (errorType === "ZeroDivisionError") suggestion = `除数不能为 0。请检查高亮积木中的数值、比例或范围步长，并改为非零值。`;
  else if (errorType === "FileNotFoundError") suggestion = `高亮积木引用的文件不存在。请重新选择有效文件，并避免使用已移动的绝对路径。`;
  else if (isManimLatexFailure(cleanTraceback)) suggestion = `LaTeX 渲染失败。请检查公式语法、反斜杠和成对括号；如果语法正确，再确认本机已安装 LaTeX。`;
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
  const pythonEnvironmentMenuRef = useRef<HTMLDivElement>(null);
  const codeOutlineRef = useRef<HTMLDivElement>(null);
  const codeOutlineTriggerRef = useRef<HTMLButtonElement>(null);
  const blockOutlineRef = useRef<HTMLDivElement>(null);
  const blockOutlineTriggerRef = useRef<HTMLButtonElement>(null);
  const consolePanelRef = useRef<HTMLDivElement>(null);
  const consoleContextMenuRef = useRef<HTMLDivElement>(null);
  const notificationPermission = useRef<boolean | null>(null);
  const cancelProjectNameCommit = useRef(false);
  const workspace = useRef<Blockly.WorkspaceSvg | null>(null);
  const blockSearchDefinition = useRef<Blockly.utils.toolbox.ToolboxDefinition>(toolbox);
  const blockSearchLabelCache = useRef(new Map<string, string>());
  const blockSearchPreviewWorkspace = useRef<Blockly.Workspace | null>(null);
  const blockSearchQueryRef = useRef("");
  const blockViewport = useRef<{ x: number; y: number; scale: number } | null>(null);
  const restoreBlockViewport = useRef(false);
  const [code, setCode] = useState("");
  const [sourceCode, setSourceCode] = useState("");
  const [sceneDocuments, setSceneDocuments] = useState<SceneDocument[]>([]);
  const [activeSceneId, setActiveSceneId] = useState("");
  const [aiAgentBusy, setAiAgentBusy] = useState(false);
  const [sceneAiStatuses, setSceneAiStatuses] = useState<Record<string, SceneAiStatus>>({});
  const [sourceCodeInitialized, setSourceCodeInitialized] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() => normalizeWorkspaceMode(localStorage.getItem("visual-python:workspace-mode")));
  const workspaceModeRef = useRef(workspaceMode);
  const [codeOutlineOpen, setCodeOutlineOpen] = useState(false);
  const [blockOutlineOpen, setBlockOutlineOpen] = useState(false);
  const [blockOutlineQuery, setBlockOutlineQuery] = useState("");
  const [blockOutlineMode, setBlockOutlineMode] = useState<"structure" | "all">("structure");
  const codeEditor = useRef<Parameters<OnMount>[0] | null>(null);
  const codeEditorMonaco = useRef<Parameters<OnMount>[1] | null>(null);
  const codeEditorStatusListeners = useRef<Array<{ dispose: () => void }>>([]);
  const [codeCursorPosition, setCodeCursorPosition] = useState({ lineNumber: 1, column: 1 });
  const [codeIndentSize, setCodeIndentSize] = useState(4);
  const codeDiagnosticDecorations = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null);
  const pyrightDiagnosticDecorations = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null);
  const selectedBlockCodeDecorations = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null);
  const aiCodeChangeDecorations = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null);
  const aiCodeChangeViewZone = useRef<string | null>(null);
  const selectedBlockIdRef = useRef<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const codeCompletionProvider = useRef<{ dispose: () => void } | null>(null);
  const codeSignatureHelpProvider = useRef<{ dispose: () => void } | null>(null);
  const codeNavigationProviders = useRef<{ dispose: () => void } | null>(null);
  const pyrightClient = useRef<PyrightClient | null>(null);
  const formatCodeAction = useRef<() => Promise<void>>(async () => {});
  const previewVoiceoverBlockAction = useRef<(block: Blockly.Block) => Promise<void>>(async () => {});
  const chooseLocalAudioBlockAction = useRef<(block: Blockly.Block) => Promise<void>>(async () => {});
  const voiceoverPreviewAudio = useRef<HTMLAudioElement | null>(null);
  const localAudioPreview = useRef<HTMLAudioElement | null>(null);
  const formattingPromiseRef = useRef<Promise<string | null> | null>(null);
  const [formattingCode, setFormattingCode] = useState(false);
  const [autoFormatOnSave, setAutoFormatOnSave] = useState(() => localStorage.getItem("visual-python:auto-format-on-save") === "true");
  const [editorFontId, setEditorFontId] = useState<EditorFontId>(() => normalizeEditorFontId(localStorage.getItem("visual-python:editor-font-family")));
  const [editorFontSize, setEditorFontSize] = useState<EditorFontSize>(() => normalizeEditorFontSize(localStorage.getItem("visual-python:editor-font-size")));
  const [editorFontSizeDraft, setEditorFontSizeDraft] = useState(() => String(editorFontSize));
  const [editorIndentSize, setEditorIndentSize] = useState<EditorIndentSize>(() => normalizeEditorIndentSize(localStorage.getItem("visual-python:editor-indent-size")));
  const editorFontFamily = getEditorFontFamily(editorFontId);
  const codeValidationVersion = useRef(0);
  const sourceCodeRef = useRef("");
  const sceneDocumentsRef = useRef<SceneDocument[]>([]);
  const activeSceneIdRef = useRef("");
  const aiAgentSceneIdRef = useRef<string | null>(null);
  const aiCodePreviewing = useRef(false);
  const pythonRunUsesCodeSource = useRef(false);
  const pythonRunSourceCode = useRef("");
  const [codeSyntaxDiagnostic, setCodeSyntaxDiagnostic] = useState<PythonCodeDiagnostic | null>(null);
  const [codeRuntimeDiagnostic, setCodeRuntimeDiagnostic] = useState<PythonCodeDiagnostic | null>(null);
  const [pyrightDiagnostics, setPyrightDiagnostics] = useState<LspDiagnostic[]>([]);
  const [output, setOutput] = useState<OutputEntry[]>([{ id: 0, stream: "system", data: "准备就绪。运行项目后，输出将显示在这里。\n" }]);
  const outputRef = useRef<OutputEntry[]>(output);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(running);
  const [renderingManim, setRenderingManim] = useState(false);
  const renderingManimRef = useRef(renderingManim);
  const [manimRenderProgress, setManimRenderProgress] = useState<ManimRenderProgress | null>(null);
  const [manimRenderElapsed, setManimRenderElapsed] = useState(0);
  const [manimRenderSettingsOpen, setManimRenderSettingsOpen] = useState(false);
  const [manimSettingsSection, setManimSettingsSection] = useState<ManimSettingsSection>("output");
  const [formulaEditorRequest, setFormulaEditorRequest] = useState<FormulaEditorRequest | null>(null);
  const [manimSceneMenuOpen, setManimSceneMenuOpen] = useState(false);
  const [pythonEnvironmentMenuOpen, setPythonEnvironmentMenuOpen] = useState(false);
  const [manimRenderConfig, setManimRenderConfigState] = useState<ManimRenderConfig>(() => getManimRenderConfig());
  const [ttsConfig, setTtsConfigState] = useState<TtsConfig>(() => getTtsConfig());
  const [voiceoverRoles, setVoiceoverRoles] = useState<VoiceoverRole[]>(() => getVoiceoverRoles());
  const [ttsApiKey, setTtsApiKey] = useState("");
  const [ttsHasApiKey, setTtsHasApiKey] = useState(false);
  const [ttsPreviewText, setTtsPreviewText] = useState("欢迎使用 Visual Python，这是配音试听。");
  const [ttsPreviewUrl, setTtsPreviewUrl] = useState("");
  const [ttsPreviewError, setTtsPreviewError] = useState("");
  const [testingTts, setTestingTts] = useState(false);
  const [testingVoiceoverRoleId, setTestingVoiceoverRoleId] = useState<string | null>(null);
  const [manimStorageInfo, setManimStorageInfo] = useState<ManimStorageInfo | null>(null);
  const [ttsCacheInfo, setTtsCacheInfo] = useState<TtsCacheInfo | null>(null);
  const [manimStoragePath, setManimStoragePath] = useState(() => localStorage.getItem("visual-python:manim-storage-path") || "");
  const [ttsStoragePath, setTtsStoragePath] = useState(() => localStorage.getItem("visual-python:tts-storage-path") || "");
  const [loadingManimStorage, setLoadingManimStorage] = useState(false);
  const [clearingManimStorage, setClearingManimStorage] = useState(false);
  const [clearingTtsCache, setClearingTtsCache] = useState(false);
  const [stdinValue, setStdinValue] = useState("");
  const taskId = useRef<number | null>(null);
  const outputId = useRef(1);
  const [projectName, setProjectName] = useState("hello-python.vpy");
  const [projectNameDraft, setProjectNameDraft] = useState("hello-python");
  const [renamingProject, setRenamingProject] = useState(false);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const projectPathRef = useRef<string | null>(null);
  const [projectResources, setProjectResources] = useState<ProjectResource[]>([]);
  const projectResourcesRef = useRef<ProjectResource[]>([]);
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
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [aiPanelWidth, setAiPanelWidth] = useState(() => {
    const saved = Number(localStorage.getItem("visual-python:ai-panel-width"));
    return Number.isFinite(saved) && saved >= 340 && saved <= 520 ? saved : 400;
  });
  const [consoleContextMenu, setConsoleContextMenu] = useState<ConsoleContextMenuState | null>(null);
  const [manimVideo, setManimVideo] = useState<ManimVideoPreview | null>(null);
  const manimVideoRef = useRef<ManimVideoPreview | null>(manimVideo);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [resourcePreviewId, setResourcePreviewId] = useState<string | null>(null);
  const [resourceDragging, setResourceDragging] = useState(false);
  const [projectResourceStatus, setProjectResourceStatus] = useState<Record<string, ProjectResourceStatus>>({});
  const [projectResourceQuery, setProjectResourceQuery] = useState("");
  const [projectResourceFilter, setProjectResourceFilter] = useState<ProjectResourceFilter>("all");
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [projectReplacementPromptOpen, setProjectReplacementPromptOpen] = useState(false);
  const [savingBeforeProjectReplacement, setSavingBeforeProjectReplacement] = useState(false);
  const projectReplacementResolver = useRef<((continueOperation: boolean) => void) | null>(null);
  const [rememberCloseChoice, setRememberCloseChoice] = useState(false);
  const [closeBehavior, setCloseBehavior] = useState<CloseBehavior>(() => {
    const saved = localStorage.getItem("visual-python:close-behavior");
    return saved === "tray" || saved === "exit" ? saved : "ask";
  });
  const [windowMaximized, setWindowMaximized] = useState(false);
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
  const [pythonEnvironment, setPythonEnvironment] = useState<PythonEnvironment | null>(() => readStoredPythonEnvironment(localStorage.getItem("visual-python:environment")));
  const [detectingPython, setDetectingPython] = useState(false);
  const [problems, setProblems] = useState<CodeProblem[]>([]);
  const problemsRef = useRef<CodeProblem[]>(problems);
  const sceneConsoleStates = useRef(new Map<string, SceneConsoleState>());
  const [contextProblems, setContextProblems] = useState<CodeProblem[]>([]);
  const contextProblemsRef = useRef<CodeProblem[]>(contextProblems);
  const problemId = useRef(1);
  const stderrBuffer = useRef("");
  const pythonBlockIdByLine = useRef(new Map<number, string>());
  const manimStderrBuffer = useRef("");
  const manimProgressBuffer = useRef("");
  const manimRenderStartedAt = useRef(0);
  const manimBlockIdByLine = useRef(new Map<number, string>());
  const manimTaskId = useRef<number | null>(null);
  const manimRenderAttemptId = useRef(0);
  const manimRenderAttempt = useRef<ManimRenderAttempt | null>(null);
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

  const switchSceneConsoleState = useCallback((fromSceneId: string, toSceneId: string) => {
    if (!toSceneId || fromSceneId === toSceneId) return;
    const currentOutput = [...outputRef.current, ...pendingOutput.current].slice(-outputEntryLimit);
    pendingOutput.current = [];
    if (outputFlushTimer.current !== null) {
      window.clearTimeout(outputFlushTimer.current);
      outputFlushTimer.current = null;
    }
    if (fromSceneId) sceneConsoleStates.current.set(fromSceneId, { output: currentOutput, problems: problemsRef.current, video: manimVideoRef.current });
    const target = sceneConsoleStates.current.get(toSceneId) ?? { output: [], problems: [], video: null };
    outputRef.current = target.output;
    problemsRef.current = target.problems;
    manimVideoRef.current = target.video;
    setOutput(target.output);
    setProblems(target.problems);
    setManimVideo(target.video);
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
    if (!pythonEnvironmentMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!pythonEnvironmentMenuRef.current?.contains(event.target as Node)) setPythonEnvironmentMenuOpen(false);
    };
    const closeMenuWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPythonEnvironmentMenuOpen(false);
    };
    const focusFrame = requestAnimationFrame(() => pythonEnvironmentMenuRef.current?.querySelector<HTMLButtonElement>(".python-environment-option, .python-environment-refresh")?.focus());
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeMenuWithKeyboard);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeMenuWithKeyboard);
    };
  }, [pythonEnvironmentMenuOpen]);

  useEffect(() => {
    if (running || renderingManim) setPythonEnvironmentMenuOpen(false);
  }, [renderingManim, running]);

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

  const chooseLocalAudioForBlock = useCallback(async (block: Blockly.Block) => {
    const currentProjectPath = projectPathRef.current;
    if (!currentProjectPath) {
      Blockly.dialog.alert("请先保存工程，再添加本地音频资源。");
      return;
    }
    const currentPathBlock = block.getInputTargetBlock("PATH");
    if (currentPathBlock && currentPathBlock.type !== "text") {
      Blockly.dialog.alert("音频路径已连接其他积木，请先移除后再选择音频文件。");
      return;
    }
    const path = await open({
      title: "选择本地音频",
      multiple: false,
      directory: false,
      filters: [{ name: "音频文件", extensions: ["wav", "mp3", "ogg", "flac", "m4a", "aac"] }],
    });
    if (typeof path !== "string" || !workspace.current) return;
    let resource: ImportedProjectResource;
    try {
      resource = await invoke<ImportedProjectResource>("import_project_audio", { projectPath: currentProjectPath, sourcePath: path, existingResources: projectResourcesRef.current.map(({ id, path: resourcePath, originalName }) => ({ id, path: resourcePath, originalName })) });
    } catch (error) {
      Blockly.dialog.alert(`无法导入音频资源：${String(error)}`);
      return;
    }
    if (!resource.deduplicated) {
      const nextResources = [...projectResourcesRef.current, importedProjectResourceData(resource)];
      projectResourcesRef.current = nextResources;
      setProjectResources(nextResources);
    } else {
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `已复用工程中的音频资源：${resource.originalName}\n` }]);
    }
    const reference = projectResourceReference(resource.id);
    const existing = block.getInputTargetBlock("PATH");
    if (existing?.type === "text") {
      existing.setFieldValue(reference, "TEXT");
      return;
    }
    if (existing) {
      Blockly.dialog.alert("路径位置已经连接了其他积木，请先移除后再选择音频文件。");
      return;
    }
    Blockly.Events.setGroup(true);
    try {
      const textBlock = workspace.current.newBlock("text");
      textBlock.setFieldValue(reference, "TEXT");
      textBlock.initSvg();
      textBlock.render();
      block.getInput("PATH")?.connection?.connect(textBlock.outputConnection!);
    } finally {
      Blockly.Events.setGroup(false);
    }
  }, []);
  chooseLocalAudioBlockAction.current = chooseLocalAudioForBlock;

  const previewLocalAudioBlock = useCallback(async (block: Blockly.Block) => {
    const pathBlock = block.getInputTargetBlock("PATH");
    const path = pathBlock?.type === "text" ? String(pathBlock.getFieldValue("TEXT") ?? "").trim() : "";
    if (!path) {
      Blockly.dialog.alert("请先右键选择音频文件，或连接包含文件路径的 Python 文本积木。");
      return;
    }
    const resolvedPath = resolveProjectResourceReference(path, projectResourcesRef.current, projectPathRef.current);
    if (!resolvedPath || !/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(resolvedPath)) {
      Blockly.dialog.alert("相对路径只能在 Manim 渲染时解析。直接试听请先选择本机音频文件。");
      return;
    }
    localAudioPreview.current?.pause();
    const gainBlock = block.getInputTargetBlock("GAIN");
    const gain = gainBlock?.type === "math_number" ? Number(gainBlock.getFieldValue("NUM")) : 0;
    const audio = new Audio(convertFileSrc(resolvedPath));
    audio.volume = Math.min(1, Math.max(0, 10 ** ((Number.isFinite(gain) ? gain : 0) / 20)));
    localAudioPreview.current = audio;
    audio.addEventListener("ended", () => { if (localAudioPreview.current === audio) localAudioPreview.current = null; }, { once: true });
    try {
      await audio.play();
      setActivePanel("output");
      setBottomPanelOpen(true);
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `正在试听本地音频：${path}\n` }]);
    } catch (error) {
      localAudioPreview.current = null;
      Blockly.dialog.alert(`无法试听本地音频：${String(error)}`);
    }
  }, []);

  const stopLocalAudioPreview = useCallback(() => {
    localAudioPreview.current?.pause();
    if (localAudioPreview.current) localAudioPreview.current.currentTime = 0;
    localAudioPreview.current = null;
  }, []);

  useEffect(() => {
    const id = "visual-python-choose-manim-local-audio";
    const registry = Blockly.ContextMenuRegistry.registry;
    if (registry.getItem(id)) registry.unregister(id);
    registry.register({
      id,
      scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
      weight: 3,
      displayText: "选择音频文件…",
      preconditionFn: ({ block }) => block && localAudioBlockTypes.has(block.type) ? "enabled" : "hidden",
      callback: ({ block }) => { if (block) void chooseLocalAudioBlockAction.current(block); },
    });
    return () => { if (registry.getItem(id)) registry.unregister(id); };
  }, []);

  useEffect(() => {
    const registry = Blockly.ContextMenuRegistry.registry;
    const previewId = "visual-python-preview-manim-local-audio";
    const stopId = "visual-python-stop-manim-local-audio-preview";
    if (registry.getItem(previewId)) registry.unregister(previewId);
    registry.register({
      id: previewId,
      scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
      weight: 4,
      displayText: "试听本地音频",
      preconditionFn: ({ block }) => block && localAudioBlockTypes.has(block.type) ? "enabled" : "hidden",
      callback: ({ block }) => { if (block) void previewLocalAudioBlock(block); },
    });
    if (registry.getItem(stopId)) registry.unregister(stopId);
    registry.register({
      id: stopId,
      scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
      weight: 5,
      displayText: "停止试听",
      preconditionFn: ({ block }) => block && localAudioBlockTypes.has(block.type) && localAudioPreview.current ? "enabled" : "hidden",
      callback: () => stopLocalAudioPreview(),
    });
    return () => {
      stopLocalAudioPreview();
      if (registry.getItem(previewId)) registry.unregister(previewId);
      if (registry.getItem(stopId)) registry.unregister(stopId);
    };
  }, [previewLocalAudioBlock, stopLocalAudioPreview]);

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
    try { draft = savedDraft ? parseDraftProject(savedDraft) : null; } catch { localStorage.removeItem("visual-python:draft"); }
    loadingWorkspace.current = true;
    let restoredDraft = false;
    if (draft) {
      try {
        pluginRegistry.loadProjectData(draft.plugins);
        setVoiceoverRoles(getVoiceoverRoles());
        Blockly.serialization.workspaces.load(migrateWorkspaceState(draft.workspace), ws);
        restoredDraft = true;
      } catch {
        draft = null;
        pluginRegistry.clearProjectData();
        setVoiceoverRoles(getVoiceoverRoles());
        localStorage.removeItem("visual-python:draft");
      }
    }
    if (!restoredDraft) Blockly.serialization.workspaces.load(starterState, ws);
    pruneUnusedVariables();
    setContextProblems(contextIssuesToProblems(validatePythonBlockContexts(ws)));
    ws.clearUndo();
    if (draft) { setProjectName(draft.name); projectPathRef.current = draft.path; setProjectPath(draft.path); projectResourcesRef.current = draft.resources ?? []; setProjectResources(draft.resources ?? []); setDirty(true); }
    requestAnimationFrame(() => {
      ws.clearUndo();
      setDirty(Boolean(draft));
      loadingWorkspace.current = false;
    });
    const refreshCreatedVoiceoverRoleFields = (ids: string[]) => {
      const options = voiceoverRoleOptions();
      for (const id of ids) {
        const block = ws.getBlockById(id);
        if (!block || (block.type !== "visual_python_manim_voiceover" && block.type !== "visual_python_manim_voiceover_with_animation")) continue;
        const field = block.getField("ROLE");
        if (!(field instanceof Blockly.FieldDropdown)) continue;
        const current = String(field.getValue() || "default");
        field.setOptions(options);
        field.setValue(options.some(([, value]) => value === current) ? current : "default");
      }
    };
    const update = (event: Blockly.Events.Abstract) => {
      if (event.type === Blockly.Events.SELECTED) {
        const nextBlockId = (event as Blockly.Events.Abstract & { newElementId?: string }).newElementId ?? null;
        selectedBlockIdRef.current = nextBlockId;
        setSelectedBlockId(nextBlockId);
        return;
      }
      if (event.isUiEvent || event.type === Blockly.Events.FINISHED_LOADING) return;
      if (event.type === Blockly.Events.BLOCK_CREATE) {
        const ids = (event as Blockly.Events.BlockCreate).ids ?? [];
        queueMicrotask(() => refreshCreatedVoiceoverRoleFields(ids));
      }
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
    const restoredDocuments = draft?.sceneDocuments?.length ? draft.sceneDocuments : restoredMode === "code" ? [legacySceneDocument(restoredSourceCode)] : [];
    const restoredActiveSceneId = restoredDocuments.some((document) => document.id === draft?.activeSceneId) ? draft!.activeSceneId! : restoredDocuments[0]?.id || "";
    const restoredActiveCode = restoredDocuments.find((document) => document.id === restoredActiveSceneId)?.code ?? restoredSourceCode;
    setCode(generatedCode);
    setSceneDocuments(restoredDocuments);
    setActiveSceneId(restoredActiveSceneId);
    setSourceCode(restoredActiveCode);
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

  useEffect(() => { workspaceModeRef.current = workspaceMode; }, [workspaceMode]);
  useEffect(() => { sceneDocumentsRef.current = sceneDocuments; }, [sceneDocuments]);
  useEffect(() => { activeSceneIdRef.current = activeSceneId; }, [activeSceneId]);
  useEffect(() => { if (workspaceMode !== "code") setAiAssistantOpen(false); }, [workspaceMode]);
  useEffect(() => { outputRef.current = output; }, [output]);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { renderingManimRef.current = renderingManim; }, [renderingManim]);
  useEffect(() => { manimVideoRef.current = manimVideo; }, [manimVideo]);
  useEffect(() => { problemsRef.current = problems; }, [problems]);
  useEffect(() => { contextProblemsRef.current = contextProblems; }, [contextProblems]);
  useEffect(() => { localStorage.setItem("visual-python:right-panel-width", String(rightPanelWidth)); }, [rightPanelWidth]);
  useEffect(() => { localStorage.setItem("visual-python:ai-panel-width", String(aiPanelWidth)); }, [aiPanelWidth]);
  useEffect(() => { localStorage.setItem("visual-python:bottom-panel-open", String(bottomPanelOpen)); }, [bottomPanelOpen]);
  useEffect(() => { localStorage.setItem("visual-python:bottom-panel-height", String(bottomPanelHeight)); }, [bottomPanelHeight]);
  useEffect(() => { localStorage.setItem("visual-python:workspace-mode", workspaceMode); }, [workspaceMode]);
  useEffect(() => { localStorage.setItem("visual-python:use-pip-mirror", String(usePipMirror)); }, [usePipMirror]);
  useEffect(() => { localStorage.setItem("visual-python:auto-format-on-save", String(autoFormatOnSave)); }, [autoFormatOnSave]);
  const applyEditorFont = useCallback((value: unknown) => {
    const normalized = normalizeEditorFontId(value);
    setEditorFontId(normalized);
    codeEditor.current?.updateOptions({ fontFamily: getEditorFontFamily(normalized) });
  }, []);

  const applyEditorFontSize = useCallback((value: unknown) => {
    const normalized = normalizeEditorFontSize(value);
    setEditorFontSize(normalized);
    setEditorFontSizeDraft(String(normalized));
    codeEditor.current?.updateOptions({ fontSize: normalized, lineHeight: normalized + 9 });
  }, []);

  const applyEditorIndentSize = useCallback((value: unknown) => {
    const normalized = normalizeEditorIndentSize(value);
    setEditorIndentSize(normalized);
    codeEditor.current?.updateOptions({ tabSize: normalized, insertSpaces: true, detectIndentation: false });
    codeEditor.current?.getModel()?.updateOptions({ tabSize: normalized, insertSpaces: true });
    setCodeIndentSize(normalized);
  }, []);

  useEffect(() => { localStorage.setItem("visual-python:editor-font-family", editorFontId); }, [editorFontId]);
  useEffect(() => { localStorage.setItem("visual-python:editor-font-size", String(editorFontSize)); }, [editorFontSize]);
  useEffect(() => { localStorage.setItem("visual-python:editor-indent-size", String(editorIndentSize)); }, [editorIndentSize]);
  useEffect(() => { setEditorFontSizeDraft(String(editorFontSize)); }, [editorFontSize]);
  useEffect(() => { setProjectNameDraft(projectFileBaseName(projectName)); }, [projectName]);
  useEffect(() => {
    if (manimStoragePath) localStorage.setItem("visual-python:manim-storage-path", manimStoragePath);
    else localStorage.removeItem("visual-python:manim-storage-path");
  }, [manimStoragePath]);
  useEffect(() => {
    if (ttsStoragePath) localStorage.setItem("visual-python:tts-storage-path", ttsStoragePath);
    else localStorage.removeItem("visual-python:tts-storage-path");
  }, [ttsStoragePath]);

  useEffect(() => {
    const editor = codeEditor.current;
    editor?.updateOptions({ fontFamily: editorFontFamily, fontSize: editorFontSize, lineHeight: editorFontSize + 9, tabSize: editorIndentSize, insertSpaces: true, detectIndentation: false });
    editor?.getModel()?.updateOptions({ tabSize: editorIndentSize, insertSpaces: true });
    setCodeIndentSize(editorIndentSize);
  }, [editorFontFamily, editorFontSize, editorIndentSize]);

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
  const effectiveBottomPanelOpen = bottomPanelOpen;

  const openConsolePanel = useCallback((panel: ConsolePanel) => {
    setActivePanel(panel);
    setBottomPanelOpen(true);
  }, []);

  const ensureDesktopNotificationPermission = useCallback(async () => {
    if (notificationPermission.current !== null) return notificationPermission.current;
    try {
      let granted = await isPermissionGranted();
      if (!granted) granted = await requestPermission() === "granted";
      notificationPermission.current = granted;
      return granted;
    } catch {
      notificationPermission.current = false;
      return false;
    }
  }, []);

  const notifyWhenAppIsInBackground = useCallback(async (target: ConsolePanel, title: string, body: string) => {
    try {
      if (await appWindow.isFocused()) return;
      if (!await ensureDesktopNotificationPermission()) return;
      sendNotification({ title, body, autoCancel: true, extra: { target } });
    } catch {
      // Notifications are optional and must not affect rendering results.
    }
  }, [ensureDesktopNotificationPermission]);

  useEffect(() => {
    let disposed = false;
    let listener: Awaited<ReturnType<typeof onAction>> | null = null;
    void onAction((notification) => {
      const target = notification.extra?.target;
      if (target !== "video" && target !== "problems" && target !== "output") return;
      void invoke("restore_main_window").then(() => {
        if (!disposed) openConsolePanel(target);
      });
    }).then((registered) => {
      if (disposed) void registered.unregister();
      else listener = registered;
    }).catch(() => undefined);
    return () => {
      disposed = true;
      if (listener) void listener.unregister();
    };
  }, [openConsolePanel]);

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
      const document = code.trim() ? legacySceneDocument(code) : createSceneDocument([], "MainScene");
      setSceneDocuments([document]);
      setActiveSceneId(document.id);
      setSourceCode(document.code);
      setSourceCodeInitialized(true);
    }
    setCodeOutlineOpen(false);
    setWorkspaceMode(nextMode);
    if (nextMode !== "code") {
      codeValidationVersion.current += 1;
      setCodeSyntaxDiagnostic(null);
      setCodeRuntimeDiagnostic(null);
    }
    setDirty(true);
    if (nextMode === "code") requestAnimationFrame(() => codeEditor.current?.focus());
  }, [code, renderingManim, running, sourceCodeInitialized, workspaceMode]);

  const updateSourceCode = useCallback((value: string | undefined) => {
    if (workspaceMode !== "code") return;
    const nextCode = value ?? "";
    if (aiCodePreviewing.current) {
      sourceCodeRef.current = nextCode;
      return;
    }
    sourceCodeRef.current = nextCode;
    if (!aiAgentSceneIdRef.current && activeSceneIdRef.current) {
      setSceneAiStatuses((statuses) => {
        if (!statuses[activeSceneIdRef.current]) return statuses;
        const next = { ...statuses };
        delete next[activeSceneIdRef.current];
        return next;
      });
    }
    if (activeSceneIdRef.current) {
      const documents = sceneDocumentsRef.current.map((document) => document.id === activeSceneIdRef.current
        ? { ...document, name: sceneDocumentName(nextCode, document.name), code: nextCode }
        : document);
      sceneDocumentsRef.current = documents;
      setSceneDocuments(documents);
    }
    codeValidationVersion.current += 1;
    setSourceCode(nextCode);
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

  const clearAiCodeChange = useCallback(() => {
    aiCodeChangeDecorations.current?.clear();
    aiCodeChangeDecorations.current = null;
    const editor = codeEditor.current;
    const viewZoneId = aiCodeChangeViewZone.current;
    if (editor && viewZoneId) editor.changeViewZones((accessor) => accessor.removeZone(viewZoneId));
    aiCodeChangeViewZone.current = null;
  }, []);

  const mountCodeEditor = useCallback<OnMount>((editor, monaco) => {
    codeEditor.current = editor;
    codeEditorMonaco.current = monaco;
    codeDiagnosticDecorations.current = editor.createDecorationsCollection();
    pyrightDiagnosticDecorations.current = editor.createDecorationsCollection();
    selectedBlockCodeDecorations.current = editor.createDecorationsCollection();
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
    editor.updateOptions({ fontFamily: editorFontFamily, fontSize: editorFontSize, lineHeight: editorFontSize + 9, tabSize: editorIndentSize, insertSpaces: true, detectIndentation: false });
    model?.updateOptions({ tabSize: editorIndentSize, insertSpaces: true });
    const position = editor.getPosition();
    if (position) setCodeCursorPosition({ lineNumber: position.lineNumber, column: position.column });
    setCodeIndentSize(editorIndentSize);
    codeEditorStatusListeners.current = [
      editor.onDidChangeCursorPosition(({ position: nextPosition }) => setCodeCursorPosition({ lineNumber: nextPosition.lineNumber, column: nextPosition.column })),
      ...(model ? [model.onDidChangeOptions(() => setCodeIndentSize(model.getOptions().tabSize))] : []),
      ...(model ? [model.onDidChangeContent(clearAiCodeChange)] : []),
      editor.onKeyDown((event) => {
        if (event.keyCode !== monaco.KeyCode.Escape || (!aiCodeChangeDecorations.current && !aiCodeChangeViewZone.current)) return;
        event.preventDefault();
        event.stopPropagation();
        clearAiCodeChange();
      }),
    ];
    renderCodeDiagnostic(editor, monaco, codeDiagnosticDecorations.current, codeSyntaxDiagnostic ?? codeRuntimeDiagnostic);
    renderPyrightDiagnostics(editor, monaco, pyrightDiagnosticDecorations.current, codeSyntaxDiagnostic ? [] : pyrightDiagnostics);
    const selectedRange = workspaceMode === "split" && selectedBlockIdRef.current && workspace.current
      ? findWorkspaceBlockCodeRange(workspace.current, selectedBlockIdRef.current)
      : null;
    if (selectedRange) {
      const range = new monaco.Range(selectedRange.startLineNumber, 1, selectedRange.endLineNumber, 1);
      selectedBlockCodeDecorations.current.set([{ range, options: { isWholeLine: true, className: "selected-block-code-line" } }]);
      editor.revealRangeInCenterIfOutsideViewport(range, monaco.editor.ScrollType.Smooth);
    }
  }, [clearAiCodeChange, codeRuntimeDiagnostic, codeSyntaxDiagnostic, editorFontFamily, editorFontSize, editorIndentSize, pyrightDiagnostics, workspaceMode]);

  useEffect(() => {
    sourceCodeRef.current = sourceCode;
    if (activeSceneId) {
      setSceneDocuments((documents) => documents.map((document) => document.id === activeSceneId
        ? { ...document, name: sceneDocumentName(sourceCode, document.name), code: sourceCode }
        : document));
    }
    setCodeSyntaxDiagnostic(null);
    setCodeRuntimeDiagnostic(null);
    setPyrightDiagnostics([]);
  }, [activeSceneId, sourceCode]);

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
    const editor = codeEditor.current;
    const monaco = codeEditorMonaco.current;
    const decorations = selectedBlockCodeDecorations.current;
    if (!editor || !monaco || !decorations) return;
    if (workspaceMode !== "split" || !selectedBlockId || !workspace.current) {
      decorations.clear();
      return;
    }
    const blockRange = findWorkspaceBlockCodeRange(workspace.current, selectedBlockId);
    if (!blockRange) {
      decorations.clear();
      return;
    }
    const range = new monaco.Range(blockRange.startLineNumber, 1, blockRange.endLineNumber, 1);
    decorations.set([{ range, options: { isWholeLine: true, className: "selected-block-code-line" } }]);
    editor.revealRangeInCenterIfOutsideViewport(range, monaco.editor.ScrollType.Smooth);
  }, [code, selectedBlockId, workspaceMode]);

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

  const updateTtsConfig = useCallback((patch: Partial<TtsConfig>) => {
    setTtsConfigState((current) => saveTtsConfig({ ...current, ...patch }));
    setTtsPreviewUrl("");
    setTtsPreviewError("");
  }, []);

  const voiceoverBlockSignature = useCallback((block: Blockly.Block) => {
    const roleId = String(block.getFieldValue("ROLE") || "default");
    const role = resolveVoiceoverRole(roleId);
    const textBlock = block.getInputTargetBlock("TEXT");
    const text = textBlock?.type === "text" ? String(textBlock.getFieldValue("TEXT") ?? "") : "";
    const config = role ? { model: role.model, voice: role.voice, speed: role.speed } : { model: ttsConfig.model, voice: ttsConfig.voice, speed: ttsConfig.speed };
    return JSON.stringify({ roleId, text, ...config });
  }, [ttsConfig.model, ttsConfig.speed, ttsConfig.voice, voiceoverRoles]);

  const refreshVoiceoverBlockTooltip = useCallback((block: Blockly.Block) => {
    if (block.type !== "visual_python_manim_voiceover" && block.type !== "visual_python_manim_voiceover_with_animation") return;
    const roleId = String(block.getFieldValue("ROLE") || "default");
    const role = resolveVoiceoverRole(roleId);
    const model = role?.model || ttsConfig.model;
    const voice = role?.voice || ttsConfig.voice;
    const speed = role?.speed ?? ttsConfig.speed;
    const modelLabel = bailianTtsModels.find((item) => item.id === model)?.label || model;
    const voiceLabel = getBailianVoiceOptions(model).find((item) => item.id === voice)?.label || voice;
    const metadata = readVoiceoverBlockMetadata(block);
    const duration = metadata?.signature === voiceoverBlockSignature(block) ? `\n预计时长：${metadata.durationSeconds.toFixed(2)} 秒` : "\n预计时长：渲染或试听后显示";
    const sync = block.type === "visual_python_manim_voiceover_with_animation" ? "\n同步规则：动画较短时自动补足等待" : "";
    block.setTooltip(`角色：${role?.name || "默认旁白"}\n模型：${modelLabel}\n音色：${voiceLabel}\n语速：${speed.toFixed(2)}x${duration}${sync}`);
  }, [ttsConfig.model, ttsConfig.speed, ttsConfig.voice, voiceoverBlockSignature, voiceoverRoles]);

  useEffect(() => {
    for (const block of workspace.current?.getAllBlocks(false) ?? []) refreshVoiceoverBlockTooltip(block);
  }, [refreshVoiceoverBlockTooltip, workspaceRevision]);

  const recordVoiceoverBlockDuration = useCallback((blockId: string | undefined, durationSeconds: number) => {
    if (!blockId || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return;
    const block = workspace.current?.getBlockById(blockId);
    if (!block) return;
    writeVoiceoverBlockMetadata(block, { signature: voiceoverBlockSignature(block), durationSeconds });
    refreshVoiceoverBlockTooltip(block);
    setDirty(true);
  }, [refreshVoiceoverBlockTooltip, voiceoverBlockSignature]);

  const persistVoiceoverRoles = useCallback((roles: VoiceoverRole[]) => {
    saveVoiceoverRoles(roles);
    setDirty(true);
  }, []);

  const updateVoiceoverRole = useCallback((id: string, patch: Partial<VoiceoverRole>) => {
    persistVoiceoverRoles(voiceoverRoles.map((role) => {
      if (role.id !== id) return role;
      const next = { ...role, ...patch };
      if (patch.model) next.voice = getBailianVoiceOptions(patch.model)[0].id;
      return next;
    }));
  }, [persistVoiceoverRoles, voiceoverRoles]);

  const addVoiceoverRole = useCallback(() => {
    persistVoiceoverRoles([...voiceoverRoles, {
      id: `role-${Date.now()}`,
      name: `角色 ${voiceoverRoles.length + 1}`,
      model: bailianTtsModels[0].id,
      voice: bailianTtsModels[0].voices[0].id,
      speed: 1,
      previewText: "",
    }]);
  }, [persistVoiceoverRoles, voiceoverRoles]);

  const removeVoiceoverRole = useCallback((id: string) => {
    if (!window.confirm("删除这个配音角色吗？使用它的积木将自动改为默认旁白。")) return;
    persistVoiceoverRoles(voiceoverRoles.filter((role) => role.id !== id));
  }, [persistVoiceoverRoles, voiceoverRoles]);

  const duplicateVoiceoverRole = useCallback((source: VoiceoverRole) => {
    if (voiceoverRoles.length >= 20) return;
    const existingNames = new Set(voiceoverRoles.map((role) => role.name));
    const baseName = `${source.name} 副本`.slice(0, 24);
    let name = baseName;
    let index = 2;
    while (existingNames.has(name)) {
      const suffix = ` ${index}`;
      name = `${baseName.slice(0, 24 - suffix.length)}${suffix}`;
      index += 1;
    }
    persistVoiceoverRoles([...voiceoverRoles, { ...source, id: `role-${Date.now()}`, name }]);
  }, [persistVoiceoverRoles, voiceoverRoles]);

  const moveVoiceoverRole = useCallback((id: string, offset: -1 | 1) => {
    const index = voiceoverRoles.findIndex((role) => role.id === id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= voiceoverRoles.length) return;
    const next = [...voiceoverRoles];
    [next[index], next[target]] = [next[target], next[index]];
    persistVoiceoverRoles(next);
  }, [persistVoiceoverRoles, voiceoverRoles]);

  const exportVoiceoverRoles = useCallback(async () => {
    const path = await save({ title: "导出配音角色", defaultPath: "visual-python-voiceover-roles.json", filters: [{ name: "配音角色", extensions: ["json"] }] });
    if (!path) return;
    try {
      await writeTextFile(path, serializeVoiceoverRoles(voiceoverRoles));
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `已导出 ${voiceoverRoles.length} 个配音角色。\n` }]);
    } catch (error) {
      Blockly.dialog.alert(`导出配音角色失败：${String(error)}`);
    }
  }, [voiceoverRoles]);

  const importVoiceoverRoles = useCallback(async () => {
    const path = await open({ title: "导入配音角色", multiple: false, directory: false, filters: [{ name: "配音角色", extensions: ["json"] }] });
    if (typeof path !== "string") return;
    try {
      const roles = parseVoiceoverRolesFile(await readTextFile(path));
      if (voiceoverRoles.length && !window.confirm(`导入文件包含 ${roles.length} 个角色，将替换当前全部角色。是否继续？`)) return;
      persistVoiceoverRoles(roles);
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `已导入 ${roles.length} 个配音角色。\n` }]);
    } catch (error) {
      Blockly.dialog.alert(`导入配音角色失败：${String(error)}`);
    }
  }, [persistVoiceoverRoles, voiceoverRoles.length]);

  useEffect(() => subscribeVoiceoverRoles((roles) => {
    setVoiceoverRoles(roles);
    const options = voiceoverRoleOptions();
    for (const block of workspace.current?.getAllBlocks(false) ?? []) {
      if (block.type !== "visual_python_manim_voiceover" && block.type !== "visual_python_manim_voiceover_with_animation") continue;
      const field = block.getField("ROLE");
      if (!(field instanceof Blockly.FieldDropdown)) continue;
      const current = String(field.getValue() || "default");
      field.setOptions(options);
      field.setValue(options.some(([, value]) => value === current) ? current : "default");
    }
  }), []);



  const testTts = useCallback(async () => {
    setTestingTts(true);
    setTtsPreviewError("");
    setTtsPreviewUrl("");
    try {
      const normalizedConfig = saveTtsConfig(ttsConfig);
      setTtsConfigState(normalizedConfig);
      const result = await invoke<TtsPreviewResult>("synthesize_tts_preview", { config: normalizedConfig, text: ttsPreviewText, apiKey: ttsApiKey.trim() || null, storagePath: ttsStoragePath || null });
      setTtsPreviewUrl(convertFileSrc(result.path));
      setTtsHasApiKey(await invoke<boolean>("has_tts_api_key", { config: normalizedConfig }));
      setTtsApiKey("");
    } catch (error) {
      setTtsPreviewError(String(error));
    } finally {
      setTestingTts(false);
    }
  }, [ttsApiKey, ttsConfig, ttsPreviewText, ttsStoragePath]);

  const testVoiceoverRole = useCallback(async (role: VoiceoverRole) => {
    const text = role.previewText.trim() || ttsPreviewText.trim();
    if (!text) {
      setTtsPreviewError("请先填写试听文本。");
      return;
    }
    voiceoverPreviewAudio.current?.pause();
    setTestingVoiceoverRoleId(role.id);
    setTtsPreviewError("");
    try {
      const config = saveTtsConfig(ttsConfig);
      const result = await invoke<TtsPreviewResult>("synthesize_tts_preview", {
        config: { ...config, model: role.model, voice: role.voice, speed: role.speed, audioFormat: "wav" },
        text,
        apiKey: ttsApiKey.trim() || null,
        storagePath: ttsStoragePath || null,
      });
      const audio = new Audio(convertFileSrc(result.path));
      voiceoverPreviewAudio.current = audio;
      audio.addEventListener("ended", () => {
        if (voiceoverPreviewAudio.current === audio) voiceoverPreviewAudio.current = null;
      }, { once: true });
      await audio.play();
      setTtsHasApiKey(await invoke<boolean>("has_tts_api_key", { config }));
      setTtsApiKey("");
      setOutput((entries) => [...entries, {
        id: outputId.current++, stream: "system",
        data: `正在试听角色“${role.name}”（${result.durationSeconds.toFixed(2)} 秒${result.cached ? "，已复用缓存" : ""}）\n`,
      }]);
    } catch (error) {
      setTtsPreviewError(`角色试听失败：${String(error)}`);
    } finally {
      setTestingVoiceoverRoleId(null);
    }
  }, [ttsApiKey, ttsConfig, ttsPreviewText, ttsStoragePath]);

  const previewVoiceoverBlock = useCallback(async (block: Blockly.Block) => {
    const textBlock = block.getInputTargetBlock("TEXT");
    const text = textBlock?.type === "text" ? String(textBlock.getFieldValue("TEXT") ?? "").trim() : "";
    if (!text) {
      Blockly.dialog.alert("这段配音需要直接连接一个非空的 Python 文本积木，才能单独试听。");
      return;
    }
    voiceoverPreviewAudio.current?.pause();
    setActivePanel("output");
    setBottomPanelOpen(true);
    const summary = `${text.slice(0, 24)}${text.length > 24 ? "..." : ""}`;
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `正在生成单段配音试听：${summary}\n` }]);
    try {
      const normalizedConfig = saveTtsConfig(ttsConfig);
      const role = resolveVoiceoverRole(String(block.getFieldValue("ROLE") || "default"));
      const previewConfig = role ? { ...normalizedConfig, model: role.model, voice: role.voice, speed: role.speed } : normalizedConfig;
      const result = await invoke<TtsPreviewResult>("synthesize_tts_preview", {
        config: previewConfig,
        text,
        apiKey: ttsApiKey.trim() || null,
        storagePath: ttsStoragePath || null,
      });
      recordVoiceoverBlockDuration(block.id, result.durationSeconds);
      const audio = new Audio(convertFileSrc(result.path));
      voiceoverPreviewAudio.current = audio;
      audio.addEventListener("ended", () => {
        if (voiceoverPreviewAudio.current === audio) voiceoverPreviewAudio.current = null;
      }, { once: true });
      await audio.play();
      setTtsHasApiKey(await invoke<boolean>("has_tts_api_key", { config: normalizedConfig }));
      setTtsApiKey("");
      setOutput((entries) => [...entries, {
        id: outputId.current++,
        stream: "system",
        data: `正在试听：${summary}（${result.durationSeconds.toFixed(2)} 秒${result.cached ? "，已复用缓存" : ""}）\n`,
      }]);
    } catch (error) {
      const message = `配音试听失败：${String(error)}`;
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `${message}\n` }]);
      Blockly.dialog.alert(message);
    }
  }, [recordVoiceoverBlockDuration, ttsApiKey, ttsConfig, ttsStoragePath]);
  previewVoiceoverBlockAction.current = previewVoiceoverBlock;

  useEffect(() => {
    const id = "visual-python-preview-manim-voiceover";
    const registry = Blockly.ContextMenuRegistry.registry;
    if (registry.getItem(id)) return;
    registry.register({
      id,
      scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
      weight: 4,
      displayText: "试听此段配音",
      preconditionFn: ({ block }) => {
        if (!block || (block.type !== "visual_python_manim_voiceover" && block.type !== "visual_python_manim_voiceover_with_animation")) return "hidden";
        const textBlock = block.getInputTargetBlock("TEXT");
        return textBlock?.type === "text" && String(textBlock.getFieldValue("TEXT") ?? "").trim() ? "enabled" : "disabled";
      },
      callback: ({ block }) => {
        if (block) void previewVoiceoverBlockAction.current(block);
      },
    });
    return () => {
      voiceoverPreviewAudio.current?.pause();
      voiceoverPreviewAudio.current = null;
      if (registry.getItem(id)) registry.unregister(id);
    };
  }, []);

  const forgetTtsApiKey = useCallback(async () => {
    try {
      await invoke("clear_tts_api_key", { config: ttsConfig });
      setTtsApiKey("");
      setTtsHasApiKey(false);
      setTtsPreviewUrl("");
    } catch (error) {
      setTtsPreviewError(String(error));
    }
  }, [ttsConfig]);

  const refreshManimStorage = useCallback(async () => {
    setLoadingManimStorage(true);
    try {
      const [storageInfo, cacheInfo] = await Promise.all([
        invoke<ManimStorageInfo>("get_manim_storage_info", { storagePath: manimStoragePath || null }),
        invoke<TtsCacheInfo>("get_tts_cache_info", { storagePath: ttsStoragePath || null }),
      ]);
      setManimStorageInfo(storageInfo);
      setTtsCacheInfo(cacheInfo);
    } catch (error) {
      enqueueOutput("stderr", `无法读取 Manim 渲染目录：${String(error)}\n`);
    } finally {
      setLoadingManimStorage(false);
    }
  }, [enqueueOutput, manimStoragePath, ttsStoragePath]);

  useEffect(() => {
    if (manimRenderSettingsOpen) void refreshManimStorage();
  }, [manimRenderSettingsOpen, refreshManimStorage]);

  useEffect(() => {
    if (!manimRenderSettingsOpen) return;
    if (!ttsConfig.baseUrl.trim()) {
      setTtsHasApiKey(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void invoke<boolean>("has_tts_api_key", { config: ttsConfig }).then(setTtsHasApiKey).catch(() => setTtsHasApiKey(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [manimRenderSettingsOpen, ttsConfig.baseUrl, ttsConfig.provider]);

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

  const chooseTtsStorageFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false, title: "选择配音缓存目录" });
    if (typeof selected !== "string" || !selected.trim()) return;
    setTtsStoragePath(selected.trim());
    enqueueOutput("system", `后续配音缓存将保存到：${selected.trim()}\n`);
  }, [enqueueOutput]);

  const resetTtsStorageFolder = useCallback(() => {
    setTtsStoragePath("");
    enqueueOutput("system", "配音缓存目录已恢复为默认位置。\n");
  }, [enqueueOutput]);

  const openTtsCacheFolder = useCallback(async () => {
    try {
      await invoke("open_tts_cache_folder", { storagePath: ttsStoragePath || null });
    } catch (error) {
      Blockly.dialog.alert(`无法打开配音缓存目录：${String(error)}`);
    }
  }, [ttsStoragePath]);

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

  const clearTtsCache = useCallback(async () => {
    if (renderingManim || clearingTtsCache) return;
    if (!window.confirm("确定清理全部配音缓存吗？下次渲染时需要重新生成并可能产生调用费用。")) return;
    setClearingTtsCache(true);
    try {
      setTtsCacheInfo(await invoke<TtsCacheInfo>("clear_tts_cache", { storagePath: ttsStoragePath || null }));
      setTtsPreviewUrl("");
      enqueueOutput("system", "配音缓存已清理。\n");
    } catch (error) {
      Blockly.dialog.alert(`无法清理配音缓存：${String(error)}`);
    } finally {
      setClearingTtsCache(false);
    }
  }, [clearingTtsCache, enqueueOutput, renderingManim, ttsStoragePath]);

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
      const persistedDocuments = sceneDocuments.map((document) => document.id === activeSceneId ? { ...document, code: sourceCode, name: sceneDocumentName(sourceCode, document.name) } : document);
      const draft: DraftProject = { version: 1, name: projectName, path: projectPath, savedAt: Date.now(), workspace: Blockly.serialization.workspaces.save(ws), plugins: pluginRegistry.createProjectState(ws), sourceCode: sourceCodeInitialized ? sourceCode : undefined, sceneDocuments: persistedDocuments.length ? persistedDocuments : undefined, activeSceneId: activeSceneId || undefined, workspaceMode, resources: projectResourcesRef.current };
      localStorage.setItem("visual-python:draft", JSON.stringify(draft));
      autosaveTimer.current = null;
    };
    autosaveTimer.current = window.setTimeout(saveDraft, 800);
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current); };
  }, [activeSceneId, dirty, projectName, projectPath, sceneDocuments, sourceCode, sourceCodeInitialized, voiceoverRoles, workspaceMode, workspaceRevision]);

  const rememberRecent = useCallback((path: string, name: string) => {
    setRecentProjects((items) => {
      const next = [{ path, name, openedAt: Date.now() }, ...items.filter((item) => item.path !== path)].slice(0, 8);
      localStorage.setItem("visual-python:recent", JSON.stringify(next));
      return next;
    });
  }, []);

  const selectPythonEnvironment = useCallback((environment: PythonEnvironment) => {
    setPythonEnvironment(environment); localStorage.setItem("visual-python:environment", JSON.stringify(environment));
    setPythonEnvironmentMenuOpen(false);
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `已选择 Python ${environment.version}：${environment.path}\n` }]);
  }, []);

  const detectPythonEnvironments = useCallback(async () => {
    setDetectingPython(true);
    try {
      const environments = await invoke<PythonEnvironment[]>("detect_python", { selectedPath: pythonEnvironment?.path ?? null });
      setPythonEnvironments(environments);
      const current = pythonEnvironment && environments.find((environment) => environment.path.toLowerCase() === pythonEnvironment.path.toLowerCase());
      if (current) {
        setPythonEnvironment(current);
        localStorage.setItem("visual-python:environment", JSON.stringify(current));
      } else if (environments[0]) {
        selectPythonEnvironment(environments[0]);
      } else {
        setPythonEnvironment(null);
        localStorage.removeItem("visual-python:environment");
      }
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
        if (manimTaskId.current === null) return;
        if (manimTaskId.current === 0) manimTaskId.current = payload.task_id;
        if (manimTaskId.current !== payload.task_id) return;
        enqueueOutput(payload.stream, payload.data);
        manimProgressBuffer.current = `${manimProgressBuffer.current}${payload.data}`.slice(-8000);
        setManimRenderProgress((current) => current ? parseManimRenderProgress(manimProgressBuffer.current, current) : current);
        if (payload.stream === "stderr") manimStderrBuffer.current = `${manimStderrBuffer.current}${payload.data}`.slice(-24000);
      }),
      listen<ManimFinishedEvent>("manim-finished", ({ payload }) => {
        if (manimTaskId.current === null) return;
        if (manimTaskId.current === 0) manimTaskId.current = payload.task_id;
        if (manimTaskId.current !== payload.task_id) return;
        manimTaskId.current = null;
        manimRenderAttempt.current = null;
        setRenderingManim(false);
        if (payload.stopped) {
          enqueueOutput("system", "Manim 渲染已停止。\n");
          return;
        }
        if (payload.success) {
          const message = `Manim 渲染完成：${payload.scene}\n${payload.video_path ? `视频文件：${payload.video_path}` : `输出目录：${payload.work_dir}`}`;
          enqueueOutput("system", `${message}\n`);
          void refreshManimStorage();
          const outputName = payload.video_path?.split(/[\\/]/).pop() || payload.scene;
          void notifyWhenAppIsInBackground(payload.video_path ? "video" : "output", "Manim 渲染完成", `${outputName} 已保存`);
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
        void notifyWhenAppIsInBackground("problems", "Manim 渲染失败", diagnosis.message);
        setProblems([{ id: problemId.current++, kind: "runtime", line, message, blockId, suggestion: diagnosis.suggestion }]);
        setActivePanel("problems");
        if (blockId) requestAnimationFrame(() => focusBlock(blockId));
        enqueueOutput("stderr", `${message}\n`);
        Blockly.dialog.alert(`${message}\n\n修改建议：${diagnosis.suggestion}`);
      }),
    ]);
    return () => { void unlisteners.then((listeners) => listeners.forEach((unlisten) => unlisten())); };
  }, [checkPluginPythonPackages, enqueueOutput, focusBlock, notifyWhenAppIsInBackground, refreshManimStorage]);

  const writeProject = useCallback(async (path: string, sourceOverride?: string, saveAs = false) => {
    if (!workspace.current) return false;
    const currentSceneId = activeSceneIdRef.current;
    const savedSource = sourceOverride ?? sourceCodeRef.current;
    const persistedDocuments = sceneDocumentsRef.current.map((document) => document.id === currentSceneId ? { ...document, code: savedSource, name: sceneDocumentName(savedSource, document.name) } : document);
    const data: ProjectFile = { version: 1, name: path.split(/[\\/]/).pop() || projectName, workspace: Blockly.serialization.workspaces.save(workspace.current), plugins: pluginRegistry.createProjectState(workspace.current), sourceCode: sourceCodeInitialized ? savedSource : undefined, sceneDocuments: persistedDocuments.length ? persistedDocuments : undefined, activeSceneId: currentSceneId || undefined, workspaceMode, resources: projectResourcesRef.current };
    const contents = JSON.stringify(data, null, 2);
    if (saveAs) {
      await invoke("save_project_as", { sourceProjectPath: projectPathRef.current, destinationProjectPath: path, contents });
    } else {
      await invoke("write_project_file", { projectPath: path, contents });
    }
    cancelAutosave();
    projectPathRef.current = path;
    setProjectName(data.name); setProjectPath(path); setDirty(false); localStorage.removeItem("visual-python:draft"); rememberRecent(path, data.name);
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `已保存：${path}\n` }]);
    return true;
  }, [cancelAutosave, projectName, rememberRecent, sourceCodeInitialized, workspaceMode]);

  const removeRecentProjectPath = useCallback((path: string) => {
    setRecentProjects((items) => {
      const next = items.filter((item) => item.path !== path);
      localStorage.setItem("visual-python:recent", JSON.stringify(next));
      return next;
    });
  }, []);

  const commitProjectName = useCallback(async () => {
    if (cancelProjectNameCommit.current) {
      cancelProjectNameCommit.current = false;
      setProjectNameDraft(projectFileBaseName(projectName));
      return;
    }
    if (renamingProject) return;
    const normalizedName = normalizeProjectFileName(projectNameDraft);
    if (!normalizedName) {
      setProjectNameDraft(projectFileBaseName(projectName));
      Blockly.dialog.alert("工程名称不能为空，也不能包含 \\ / : * ? \" < > | 等字符。");
      return;
    }
    if (normalizedName === projectName) {
      setProjectNameDraft(projectFileBaseName(normalizedName));
      return;
    }
    if (!projectPath) {
      setProjectName(normalizedName);
      setDirty(true);
      return;
    }

    setRenamingProject(true);
    try {
      const previousPath = projectPath;
      const renamedPath = await invoke<string>("rename_project_file", { currentPath: previousPath, newName: normalizedName });
      projectPathRef.current = renamedPath;
      setProjectPath(renamedPath);
      setProjectName(normalizedName);
      setProjectNameDraft(projectFileBaseName(normalizedName));
      removeRecentProjectPath(previousPath);
      try {
        await writeProject(renamedPath);
      } catch (error) {
        setDirty(true);
        const message = `工程已重命名，但保存最新内容失败：${String(error)}`;
        setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `${message}\n` }]);
        Blockly.dialog.alert(message);
      }
    } catch (error) {
      setProjectNameDraft(projectFileBaseName(projectName));
      Blockly.dialog.alert(`无法重命名工程：${String(error)}`);
    } finally {
      setRenamingProject(false);
    }
  }, [projectName, projectNameDraft, projectPath, removeRecentProjectPath, renamingProject, writeProject]);

  const saveProjectAs = useCallback(async (sourceOverride?: string) => {
    try {
      const path = await save({ defaultPath: projectPath || projectName, filters: [{ name: "Visual Python", extensions: ["vpy"] }] });
      if (!path) return false;
      const preparedSource = sourceOverride ?? (autoFormatOnSave && workspaceMode === "code" ? await formatCurrentPythonCode(false) : undefined);
      return writeProject(path, preparedSource ?? undefined, true);
    } catch (error) {
      const message = `另存工程失败：${String(error)}`;
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `${message}\n` }]);
      Blockly.dialog.alert(message);
      return false;
    }
  }, [autoFormatOnSave, formatCurrentPythonCode, projectName, projectPath, workspaceMode, writeProject]);

  const saveProject = useCallback(async () => {
    try {
      const sourceOverride = autoFormatOnSave && workspaceMode === "code" ? await formatCurrentPythonCode(false) : undefined;
      const currentPath = projectPathRef.current || projectPath;
      return currentPath ? writeProject(currentPath, sourceOverride ?? undefined) : saveProjectAs(sourceOverride ?? undefined);
    } catch (error) {
      const message = `保存工程失败：${String(error)}`;
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `${message}\n` }]);
      Blockly.dialog.alert(message);
      return false;
    }
  }, [autoFormatOnSave, formatCurrentPythonCode, projectPath, saveProjectAs, workspaceMode, writeProject]);

  const confirmProjectReplacement = useCallback(async () => {
    if (!dirty) return true;
    return new Promise<boolean>((resolve) => {
      projectReplacementResolver.current?.(false);
      projectReplacementResolver.current = resolve;
      setProjectReplacementPromptOpen(true);
    });
  }, [dirty]);

  const finishProjectReplacementPrompt = useCallback((continueOperation: boolean) => {
    setProjectReplacementPromptOpen(false);
    const resolve = projectReplacementResolver.current;
    projectReplacementResolver.current = null;
    resolve?.(continueOperation);
  }, []);

  const saveBeforeProjectReplacement = useCallback(async () => {
    if (savingBeforeProjectReplacement) return;
    setSavingBeforeProjectReplacement(true);
    try {
      finishProjectReplacementPrompt(await saveProject());
    } catch (error) {
      Blockly.dialog.alert(`保存当前工程失败：${String(error)}`);
      finishProjectReplacementPrompt(false);
    } finally {
      setSavingBeforeProjectReplacement(false);
    }
  }, [finishProjectReplacementPrompt, saveProject, savingBeforeProjectReplacement]);

  const loadProject = useCallback(async (path: string, options: { skipDirtyCheck?: boolean } = {}) => {
    if (!workspace.current) return;
    if (!options.skipDirtyCheck && !(await confirmProjectReplacement())) return;
    let projectFileExists = false;
    try {
      const fileContents = await readTextFile(path);
      projectFileExists = true;
      const data = parseProjectFile(fileContents);
      const pluginIssues = await ensureProjectPlugins(data.plugins?.requirements);
      if (pluginIssues.length) {
        setProblems(pluginIssues.map((issue) => ({ id: problemId.current++, kind: "plugin" as const, line: 0, message: issue.message })));
        setActivePanel("problems");
        throw new Error(pluginIssues.map((issue) => issue.message).join("；"));
      }
      const validatedWorkspace = validateWorkspaceState(data.workspace);
      cancelAutosave();
      sceneConsoleStates.current.clear();
      loadingWorkspace.current = true;
      pluginRegistry.clearProjectData();
      pluginRegistry.loadProjectData(data.plugins);
      setVoiceoverRoles(getVoiceoverRoles());
      Blockly.serialization.workspaces.load(validatedWorkspace, workspace.current);
      workspace.current.clearUndo();
      const generatedCode = generateWorkspacePython(workspace.current);
      const loadedMode = normalizeWorkspaceMode(data.workspaceMode);
      const loadedSourceCode = typeof data.sourceCode === "string" ? data.sourceCode : loadedMode === "code" ? generatedCode : "";
      const loadedDocuments = data.sceneDocuments?.length ? data.sceneDocuments : loadedMode === "code" ? [legacySceneDocument(loadedSourceCode)] : [];
      const loadedActiveSceneId = loadedDocuments.some((document) => document.id === data.activeSceneId) ? data.activeSceneId! : loadedDocuments[0]?.id || "";
      const loadedActiveCode = loadedDocuments.find((document) => document.id === loadedActiveSceneId)?.code ?? loadedSourceCode;
      projectPathRef.current = path;
      projectResourcesRef.current = data.resources ?? [];
      setProjectResources(data.resources ?? []);
      setProjectName(data.name || path.split(/[\\/]/).pop() || "untitled.vpy"); setProjectPath(path); setDirty(false); localStorage.removeItem("visual-python:draft");
      setCode(generatedCode); setSceneDocuments(loadedDocuments); setActiveSceneId(loadedActiveSceneId); setSourceCode(loadedActiveCode); setSourceCodeInitialized(typeof data.sourceCode === "string" || loadedMode === "code"); setWorkspaceMode(loadedMode); setProblems([]); setManimVideo(null); rememberRecent(path, data.name);
      setOutput([{ id: outputId.current++, stream: "system", data: `已打开：${path}\n` }]);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        workspace.current?.clearUndo();
        setDirty(false);
        loadingWorkspace.current = false;
      }));
    } catch (error) {
      loadingWorkspace.current = false;
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `无法打开工程：${String(error)}\n` }]);
      if (!projectFileExists) setRecentProjects((items) => { const next = items.filter((item) => item.path !== path); localStorage.setItem("visual-python:recent", JSON.stringify(next)); return next; });
    }
  }, [cancelAutosave, confirmProjectReplacement, rememberRecent]);

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

  const newProject = useCallback(async () => {
    if (!workspace.current) return;
    if (!(await confirmProjectReplacement())) return;
    cancelAutosave();
    pluginRegistry.clearProjectData();
    setVoiceoverRoles(getVoiceoverRoles());
    loadingWorkspace.current = true; Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [] } }, workspace.current);
    workspace.current.clearUndo();
    projectPathRef.current = null;
    projectResourcesRef.current = [];
    setProjectResources([]);
    const initialDocument = workspaceMode === "code" ? createSceneDocument([], "MainScene") : null;
    setProjectName("untitled.vpy"); setProjectPath(null); setDirty(false); setCode(""); setSceneDocuments(initialDocument ? [initialDocument] : []); setActiveSceneId(initialDocument?.id || ""); setSourceCode(initialDocument?.code || ""); setSourceCodeInitialized(workspaceMode === "code"); setProblems([]); setManimVideo(null); localStorage.removeItem("visual-python:draft");
    setOutput([{ id: outputId.current++, stream: "system", data: "已创建新工程。\n" }]);
    setProjectMenuOpen(false); requestAnimationFrame(() => {
      workspace.current?.clearUndo();
      setDirty(false);
      loadingWorkspace.current = false;
    });
  }, [cancelAutosave, confirmProjectReplacement, workspaceMode]);

  const loadExample = useCallback(async (example: ExampleProject) => {
    if (!workspace.current) return;
    if (!(await confirmProjectReplacement())) return;
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
    sceneConsoleStates.current.clear();
    pluginRegistry.clearProjectData();
    pluginRegistry.loadProjectData(example.plugins);
    setVoiceoverRoles(getVoiceoverRoles());
    loadingWorkspace.current = true;
    Blockly.serialization.workspaces.load(migrateWorkspaceState(example.workspace), currentWorkspace);
    currentWorkspace.clearUndo();
    setProjectName(example.projectName);
    projectPathRef.current = null;
    projectResourcesRef.current = [];
    setProjectResources([]);
    setProjectPath(null);
    setDirty(true);
    setCode(generateWorkspacePython(currentWorkspace));
    setSceneDocuments([]);
    setActiveSceneId("");
    setSourceCode("");
    setSourceCodeInitialized(false);
    setWorkspaceMode("split");
    setBottomPanelOpen(true);
    setProblems([]);
    setManimVideo(null);
    setOutput([{ id: outputId.current++, stream: "system", data: `已加载示例：${example.title}\n` }]);
    setExampleMenuOpen(false);
    localStorage.removeItem("visual-python:draft");
    requestAnimationFrame(() => {
      if (workspace.current === currentWorkspace) { currentWorkspace.clearUndo(); currentWorkspace.zoomToFit(); }
      loadingWorkspace.current = false;
    });
  }, [cancelAutosave, confirmProjectReplacement]);

  const exportPython = useCallback(async () => {
    const currentScene = sceneDocuments.find((document) => document.id === activeSceneId);
    const defaultName = `${currentScene?.name || projectName.replace(/\.vpy$/i, "")}.py`;
    const path = await save({ defaultPath: defaultName, filters: [{ name: "Python", extensions: ["py"] }] });
    if (!path) return;
    await writeTextFile(path, activeCode);
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `已导出 Python：${path}\n` }]);
  }, [activeCode, activeSceneId, projectName, sceneDocuments]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (event.shiftKey) void saveProjectAs();
        else void saveProject();
      }
      if (event.key.toLowerCase() === "o") { event.preventDefault(); void openProject(); }
      if (event.key.toLowerCase() === "n") { event.preventDefault(); void newProject(); }
    };
    const closeMenu = () => setProjectMenuOpen(false);
    window.addEventListener("keydown", onKeyDown); window.addEventListener("blur", closeMenu);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("blur", closeMenu); };
  }, [newProject, openProject, saveProject, saveProjectAs]);

  const validateBeforeExecution = useCallback(() => {
    if (!isBlockWorkspaceMode(workspaceMode)) return true;
    const ws = workspace.current;
    if (!ws) return true;
    const issues = validatePythonBlockContexts(ws);
    setContextProblems(contextIssuesToProblems(issues));
    if (!issues.length) return true;
    setActivePanel("problems");
    setBottomPanelOpen(true);
    requestAnimationFrame(() => focusBlock(issues[0].blockId));
    return false;
  }, [focusBlock, workspaceMode]);

  const runCode = useCallback(async () => {
    if (running) return;
    setProblems([]);
    setCodeRuntimeDiagnostic(null);
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
      : { code: sourceCodeRef.current, blockIdByLine: new Map<number, string>() };
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
    void ensureDesktopNotificationPermission();
    setProblems([]);
    setBottomPanelOpen(true);
    if (!validateBeforeExecution()) return;
    const renderSource = isBlockWorkspaceMode(workspaceMode) && workspace.current
      ? generateWorkspacePythonWithBlockMap(workspace.current)
      : { code: sourceCodeRef.current, blockIdByLine: new Map<number, string>() };
    const sceneNames = extractManimSceneNames(renderSource.code);
    const sceneName = sceneNames.includes(manimRenderConfig.selectedScene) ? manimRenderConfig.selectedScene : sceneNames[0];
    if (!sceneName) {
      const message = workspaceMode === "code"
        ? "没有找到 Manim 场景类。请定义一个继承 Scene 的场景类。"
        : "没有找到 Manim 场景类。请先添加“Manim 场景”积木。";
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
    const voiceoverInspection = inspectVoiceovers(renderSource.code, voiceoverRoles.map((role) => role.id));
    if (!voiceoverInspection.valid) {
      const voiceoverProblems = voiceoverInspection.issues.map((issue) => ({
        id: problemId.current++,
        kind: "plugin" as const,
        line: Number(issue.match(/^第 (\d+) 行/)?.[1] || 0),
        message: `配音：${issue}`,
      }));
      setProblems(voiceoverProblems);
      setActivePanel("problems");
      setOutput([{ id: outputId.current++, stream: "stderr", data: `${voiceoverProblems.map((problem) => problem.message).join("\n")}\n` }]);
      return;
    }
    const hasVoiceovers = voiceoverInspection.cueCount + voiceoverInspection.synchronizedCount > 0;
    if (hasVoiceovers) {
      const hasTtsKey = Boolean(ttsApiKey.trim()) || await invoke<boolean>("has_tts_api_key", { config: ttsConfig }).catch(() => false);
      const configurationIssue = !ttsConfig.baseUrl.trim()
        ? "当前代码包含配音，但尚未配置百炼接口地址。请先在 Manim 设置的视频配音中完成配置。"
        : !hasTtsKey
          ? "当前代码包含配音，但尚未配置配音 API Key。请先在 Manim 设置的视频配音中完成配置。"
          : "";
      if (configurationIssue) {
        setProblems([{ id: problemId.current++, kind: "plugin", line: 0, message: configurationIssue }]);
        setActivePanel("problems");
        setOutput([{ id: outputId.current++, stream: "stderr", data: `${configurationIssue}\n` }]);
        setManimSettingsSection("voice");
        setManimRenderSettingsOpen(true);
        Blockly.dialog.alert(`${configurationIssue}\n\n渲染已停止，已为你打开“Manim 设置 > 视频配音”。完成配置后请重新渲染。`);
        return;
      }
    }
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
    const attempt = new ManimRenderAttempt(++manimRenderAttemptId.current);
    manimRenderAttempt.current = attempt;
    const assertActiveAttempt = () => attempt.assertActive(manimRenderAttempt.current);
    manimStderrBuffer.current = "";
    manimProgressBuffer.current = "";
    manimRenderStartedAt.current = Date.now();
    setManimRenderElapsed(0);
    setManimRenderProgress(initialManimRenderProgress(sceneName));
    setRenderingManim(true);
    manimVideoRef.current = null;
    setManimVideo(null);
    setActivePanel("output");
    setOutput([{ id: outputId.current++, stream: "system", data: `> Manim 渲染 ${sceneName}\n\n` }]);
    try {
      const voiceoverConfig = { ...ttsConfig, audioFormat: "wav" as const };
      let cachedVoiceoverClipCount = 0;
      const preparedLocalAudio = await prepareManimLocalAudio(renderSource.code, async (request) => {
        assertActiveAttempt();
        const resolvedPath = resolveProjectResourceReference(request.path, projectResourcesRef.current, projectPathRef.current);
        if (!resolvedPath) throw new ManimLocalAudioError("无法找到工程中的本地音频资源", request);
        request.path = resolvedPath;
        if (!/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(request.path)) throw new ManimLocalAudioError("同步播放需要使用本地音频的绝对路径", request);
        try {
          const durationSeconds = await readLocalAudioDuration(resolvedPath);
          assertActiveAttempt();
          return { path: resolvedPath, durationSeconds };
        } catch {
          assertActiveAttempt();
          throw new ManimLocalAudioError("无法读取本地音频文件或音频时长", request);
        }
      });
      assertActiveAttempt();
      if (preparedLocalAudio.synchronizedSegmentCount) {
        setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `已准备 ${preparedLocalAudio.synchronizedSegmentCount} 段本地音频同步时间轴。\n` }]);
      }
      const preparedVoiceovers = await prepareManimVoiceovers(preparedLocalAudio.code, async ({ text, roleId, blockId }) => {
        assertActiveAttempt();
        const summary = `${text.slice(0, 24)}${text.length > 24 ? "..." : ""}`;
        setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `正在准备配音：${summary}\n` }]);
        const role = resolveVoiceoverRole(roleId);
        const segmentConfig = role ? { ...voiceoverConfig, model: role.model, voice: role.voice, speed: role.speed } : voiceoverConfig;
        let result: TtsPreviewResult;
        try {
          result = await invoke<TtsPreviewResult>("synthesize_tts_preview", { config: segmentConfig, text, apiKey: ttsApiKey.trim() || null, storagePath: ttsStoragePath || null });
        } catch (error) {
          assertActiveAttempt();
          const roleName = role?.name || "默认旁白";
          const textSummary = `${text.slice(0, 28)}${text.length > 28 ? "..." : ""}`;
          throw new ManimVoiceoverError(`角色“${roleName}”的配音生成失败：“${textSummary}”`, { text, roleId, blockId }, String(error));
        }
        assertActiveAttempt();
        recordVoiceoverBlockDuration(blockId, result.durationSeconds);
        if (result.cached) {
          cachedVoiceoverClipCount += 1;
          setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `已复用配音缓存：${summary}\n` }]);
        }
        return { path: result.path, durationSeconds: result.durationSeconds };
      });
      manimTaskId.current = 0;
      assertActiveAttempt();
      preparedVoiceovers.segments.forEach((segment) => recordVoiceoverBlockDuration(segment.blockId, segment.durationSeconds));
      if (preparedVoiceovers.clipCount) {
        setTtsHasApiKey(await invoke<boolean>("has_tts_api_key", { config: voiceoverConfig }));
        assertActiveAttempt();
        setTtsApiKey("");
        const standaloneCount = preparedVoiceovers.segmentCount - preparedVoiceovers.synchronizedSegmentCount;
        const syncDetail = preparedVoiceovers.synchronizedSegmentCount
          ? `，其中 ${preparedVoiceovers.synchronizedSegmentCount} 段与动画同步并自动补足等待`
          : "";
        setOutput((entries) => [...entries, {
          id: outputId.current++,
          stream: "system",
          data: `配音时间轴：${preparedVoiceovers.segmentCount} 段（独立播放 ${standaloneCount} 段${syncDetail}），音频总时长 ${preparedVoiceovers.totalDurationSeconds.toFixed(2)} 秒，复用缓存 ${cachedVoiceoverClipCount} 段。\n`,
        }]);
        setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `已准备 ${preparedVoiceovers.clipCount} 段配音，开始渲染。\n` }]);
      }
      const outputFileName = buildManimOutputFilename(projectName, sceneName, manimRenderConfig.outputFileName);
      const startedTaskId = await invoke<number>("render_manim", { code: preparedVoiceovers.code, sceneName, pythonPath: pythonEnvironment.path, renderConfig: manimRenderConfig, storagePath: manimStoragePath || null, outputFileName });
      if (manimTaskId.current === 0) manimTaskId.current = startedTaskId;
      if (attempt.cancelled || manimRenderAttempt.current !== attempt) {
        await invoke("stop_manim_render", { taskId: startedTaskId });
        throw new ManimRenderCancelledError();
      }
    } catch (error) {
      if (error instanceof ManimRenderCancelledError || attempt.cancelled || manimRenderAttempt.current !== attempt) {
        if (manimRenderAttempt.current === attempt) {
          manimRenderAttempt.current = null;
          manimTaskId.current = null;
          setRenderingManim(false);
          setManimRenderProgress(null);
        }
        return;
      }
      manimRenderAttempt.current = null;
      manimTaskId.current = null;
      setRenderingManim(false);
      if (error instanceof ManimLocalAudioError) {
        const blockId = error.request.blockId;
        const line = blockId ? [...renderSource.blockIdByLine.entries()].find(([, id]) => id === blockId)?.[0] || 0 : 0;
        const suggestion = "请右键该积木重新选择本地音频文件，并确认文件仍然存在且可以正常播放。";
        setProblems([{ id: problemId.current++, kind: "plugin", line, message: error.message, blockId, suggestion }]);
        setActivePanel("problems");
        if (blockId) requestAnimationFrame(() => focusBlock(blockId));
        setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `${error.message}\n${suggestion}\n` }]);
        Blockly.dialog.alert(`${error.message}\n\n${suggestion}`);
        return;
      }
      if (error instanceof ManimVoiceoverError) {
        const blockId = error.request.blockId;
        const line = blockId ? [...renderSource.blockIdByLine.entries()].find(([, id]) => id === blockId)?.[0] || 0 : 0;
        const suggestion = error.detail ? error.detail.replace(/^Error:\s*/, "") : "请检查配音文本、角色音色、接口地址和 API Key。";
        setProblems([{ id: problemId.current++, kind: "plugin", line, message: error.message, blockId, suggestion }]);
        setActivePanel("problems");
        if (blockId) requestAnimationFrame(() => focusBlock(blockId));
        setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `${error.message}\n${suggestion}\n` }]);
        Blockly.dialog.alert(`${error.message}\n\n${suggestion}`);
        return;
      }
      const message = `Manim 渲染启动失败：${String(error)}`;
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `${message}\n` }]);
      Blockly.dialog.alert(message);
    }
  }, [activeCode, ensureDesktopNotificationPermission, focusBlock, manimRenderConfig, manimStoragePath, projectName, pythonEnvironment, recordVoiceoverBlockDuration, renderingManim, ttsApiKey, ttsConfig, ttsStoragePath, validateBeforeExecution, voiceoverRoles, workspaceMode]);

  const stopManimRender = useCallback(async () => {
    const attempt = manimRenderAttempt.current;
    const currentTaskId = manimTaskId.current;
    if (!renderingManim && !attempt && currentTaskId === null) return;
    attempt?.cancel();
    if (currentTaskId === null) {
      if (manimRenderAttempt.current === attempt) manimRenderAttempt.current = null;
      setRenderingManim(false);
      setManimRenderProgress(null);
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: "已取消 Manim 配音准备。\n" }]);
      return;
    }
    setManimRenderProgress((current) => current ? { ...current, phase: "stopping", label: "正在停止渲染", percent: undefined } : current);
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: "正在停止 Manim 渲染...\n" }]);
    try {
      await invoke("stop_manim_render", { taskId: currentTaskId && currentTaskId > 0 ? currentTaskId : null });
      if (currentTaskId > 0) {
        if (manimRenderAttempt.current === attempt) manimRenderAttempt.current = null;
        if (manimTaskId.current === currentTaskId) manimTaskId.current = null;
        setRenderingManim(false);
        setManimRenderProgress(null);
      }
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
  const manimOutputFilenamePreview = buildManimOutputFilename(projectName, manimSceneName || "MainScene", manimRenderConfig.outputFileName);
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
  const visibleBlockOutline = useMemo(() => {
    if (blockOutlineQuery.trim()) return filterBlockOutline(blockOutline, blockOutlineQuery);
    return blockOutlineMode === "structure" ? compactBlockOutline(blockOutline) : blockOutline;
  }, [blockOutline, blockOutlineMode, blockOutlineQuery]);
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
  const persistActiveSceneDocument = () => sceneDocumentsRef.current.map((document) => document.id === activeSceneIdRef.current
    ? { ...document, name: sceneDocumentName(sourceCodeRef.current, document.name), code: sourceCodeRef.current }
    : document);
  const focusManimSceneTab = (sceneId: string) => {
    if (sceneId === activeSceneIdRef.current) return codeEditor.current?.focus();
    if (aiAgentSceneIdRef.current) return Blockly.dialog.alert("AI 正在修改当前场景。请先停止或等待任务完成，再切换场景。");
    if (runningRef.current || renderingManimRef.current) return Blockly.dialog.alert("请先停止当前运行或渲染任务，再切换场景。");
    const documents = persistActiveSceneDocument();
    const document = documents.find((item) => item.id === sceneId);
    if (!document) return;
    switchSceneConsoleState(activeSceneIdRef.current, document.id);
    sceneDocumentsRef.current = documents;
    activeSceneIdRef.current = document.id;
    sourceCodeRef.current = document.code;
    setSceneDocuments(documents);
    setActiveSceneId(document.id);
    setSourceCode(document.code);
    updateManimRenderConfig({ selectedScene: extractManimSceneNames(document.code)[0] || document.name });
    requestAnimationFrame(() => codeEditor.current?.focus());
  };
  const addManimSceneTab = () => {
    if (aiAgentSceneIdRef.current) return Blockly.dialog.alert("AI 正在修改当前场景。请先停止或等待任务完成，再新建场景。");
    const documents = persistActiveSceneDocument();
    const document = createSceneDocument(documents.map((item) => item.name));
    const nextDocuments = [...documents, document];
    switchSceneConsoleState(activeSceneIdRef.current, document.id);
    codeValidationVersion.current += 1;
    sceneDocumentsRef.current = nextDocuments;
    activeSceneIdRef.current = document.id;
    sourceCodeRef.current = document.code;
    setSceneDocuments(nextDocuments);
    setActiveSceneId(document.id);
    setSourceCode(document.code);
    setSourceCodeInitialized(true);
    setCodeSyntaxDiagnostic(null);
    setCodeRuntimeDiagnostic(null);
    setProblems((items) => items.filter((problem) => !["syntax", "runtime", "timeout"].includes(problem.kind)));
    setDirty(true);
    updateManimRenderConfig({ selectedScene: document.name });
    requestAnimationFrame(() => { codeEditor.current?.setPosition({ lineNumber: 6, column: 9 }); codeEditor.current?.focus(); });
  };
  const closeManimSceneTab = (sceneId: string) => {
    if (aiAgentSceneIdRef.current) return Blockly.dialog.alert("AI 正在修改当前场景。请先停止或等待任务完成，再删除场景。");
    const documents = persistActiveSceneDocument();
    const index = documents.findIndex((document) => document.id === sceneId);
    const closing = documents[index];
    if (!closing) return;
    if (documents.length === 1) return Blockly.dialog.alert("工程至少需要保留一个场景。");
    if (!window.confirm(`确定删除场景“${closing.name}”吗？该场景的完整代码都会被删除。`)) return;
    const remainingScenes = documents.filter((document) => document.id !== sceneId);
    const nextActive = sceneId === activeSceneIdRef.current ? remainingScenes[Math.min(index, remainingScenes.length - 1)] : remainingScenes.find((document) => document.id === activeSceneIdRef.current)!;
    codeValidationVersion.current += 1;
    sceneDocumentsRef.current = remainingScenes;
    setSceneDocuments(remainingScenes);
    if (sceneId === activeSceneIdRef.current) {
      switchSceneConsoleState(activeSceneIdRef.current, nextActive.id);
      activeSceneIdRef.current = nextActive.id;
      sourceCodeRef.current = nextActive.code;
      setActiveSceneId(nextActive.id);
      setSourceCode(nextActive.code);
      updateManimRenderConfig({ selectedScene: extractManimSceneNames(nextActive.code)[0] || nextActive.name });
    }
    setCodeSyntaxDiagnostic(null);
    setCodeRuntimeDiagnostic(null);
    setProblems((items) => items.filter((problem) => !["syntax", "runtime", "timeout"].includes(problem.kind)));
    setDirty(true);
    requestAnimationFrame(() => codeEditor.current?.focus());
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
      <button className="block-outline-main" onClick={() => { focusBlock(node.id); setBlockOutlineOpen(false); }} title={`${node.label} · ${node.type}`}>
        <span className={`block-outline-icon outline-${node.kind}`}>{blockOutlineIcon(node)}</span>
        <span className="block-outline-label"><strong>{node.label}</strong></span>
        {node.issueCount > 0 && <span className="block-outline-issues" title={`${node.issueCount} 个问题`}>{node.issueCount}</span>}
        {node.blockCount > 1 && <span className="block-outline-count" title={`${node.blockCount} 个积木`}>{node.blockCount}</span>}
      </button>
      {node.children.length > 0 && <button className="block-outline-collapse" onClick={() => toggleOutlineBlock(node.id)} title={node.collapsed ? "展开画布积木组" : "折叠画布积木组"} aria-label={node.collapsed ? "展开画布积木组" : "折叠画布积木组"}>{node.collapsed ? <ChevronRight size={13}/> : <ChevronDown size={13}/>}</button>}
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
  const missingProjectResources = projectResources.filter((resource) => projectResourceStatus[resource.path]?.exists === false);
  const resourceProblems: CodeProblem[] = missingProjectResources.map((resource) => ({
    id: `resource-missing-${resource.id}`,
    kind: "resource",
    line: 0,
    message: `工程资源“${resource.originalName}”的磁盘文件缺失。`,
    suggestion: "打开工程资源面板，点击替换按钮重新选择文件。",
  }));
  const displayedProblems = workspaceMode === "code"
    ? [...codeSyntaxProblems, ...pyrightProblems, ...codeRuntimeProblems, ...resourceProblems, ...problems.filter((problem) => !(problem.kind === "syntax" && codeSyntaxDiagnostic) && !(problem.kind === "runtime" && codeRuntimeDiagnostic))]
    : [...contextProblems, ...resourceProblems, ...problems];
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
  const projectResourceUsage = useMemo(() => {
    const usage = new Map<string, number>();
    const ws = workspace.current;
    if (!ws) return usage;
    for (const block of ws.getAllBlocks(false)) {
      for (const input of block.inputList) {
        for (const field of input.fieldRow) {
          const value = String(field.getValue() ?? "");
          if (!value.startsWith("resource://")) continue;
          const id = value.slice("resource://".length);
          usage.set(id, (usage.get(id) ?? 0) + 1);
        }
      }
    }
    return usage;
  }, [projectResources, workspaceRevision]);
  const projectResourceFilterCounts = {
    all: projectResources.length,
    used: projectResources.filter((resource) => (projectResourceUsage.get(resource.id) ?? 0) > 0).length,
    unused: projectResources.filter((resource) => !(projectResourceUsage.get(resource.id) ?? 0)).length,
    missing: missingProjectResources.length,
  };
  const visibleProjectResources = projectResources.filter((resource) => {
    const query = projectResourceQuery.trim().toLocaleLowerCase();
    if (query && !`${resource.originalName} ${resource.path}`.toLocaleLowerCase().includes(query)) return false;
    const usageCount = projectResourceUsage.get(resource.id) ?? 0;
    const missing = projectResourceStatus[resource.path]?.exists === false;
    return projectResourceFilter === "all"
      || (projectResourceFilter === "used" && usageCount > 0)
      || (projectResourceFilter === "unused" && usageCount === 0)
      || (projectResourceFilter === "missing" && missing);
  });

  const previewProjectResource = useCallback(async (resource: ProjectResource) => {
    const path = resolveProjectResourceReference(projectResourceReference(resource.id), projectResourcesRef.current, projectPathRef.current);
    if (!path) return Blockly.dialog.alert("无法找到这个工程资源。");
    localAudioPreview.current?.pause();
    if (resourcePreviewId === resource.id) {
      localAudioPreview.current = null;
      setResourcePreviewId(null);
      return;
    }
    const audio = new Audio(convertFileSrc(path));
    localAudioPreview.current = audio;
    setResourcePreviewId(resource.id);
    audio.addEventListener("ended", () => {
      if (localAudioPreview.current === audio) localAudioPreview.current = null;
      setResourcePreviewId((id) => id === resource.id ? null : id);
    }, { once: true });
    try {
      await audio.play();
    } catch (error) {
      localAudioPreview.current = null;
      setResourcePreviewId(null);
      Blockly.dialog.alert(`无法试听音频资源：${String(error)}`);
    }
  }, [resourcePreviewId]);

  const replaceProjectResource = useCallback(async (resource: ProjectResource) => {
    const currentProjectPath = projectPathRef.current;
    if (!currentProjectPath) return;
    const sourcePath = await open({ multiple: false, directory: false, filters: [{ name: "音频文件", extensions: ["wav", "mp3", "ogg", "flac", "m4a", "aac"] }] });
    if (typeof sourcePath !== "string") return;
    try {
      const replacement = await invoke<ProjectResource>("replace_project_audio", { projectPath: currentProjectPath, resourcePath: resource.path, sourcePath });
      const next = projectResourcesRef.current.map((item) => item.id === resource.id ? { ...item, originalName: replacement.originalName, size: replacement.size } : item);
      projectResourcesRef.current = next;
      setProjectResources(next);
      setProjectResourceStatus((status) => ({ ...status, [resource.path]: { path: resource.path, exists: true, size: replacement.size } }));
    } catch (error) {
      Blockly.dialog.alert(`无法替换音频资源：${String(error)}`);
    }
  }, []);

  useEffect(() => {
    if (!projectPath || !projectResources.length) {
      if (!projectResources.length) setProjectResourceStatus({});
      return;
    }
    let disposed = false;
    void invoke<ProjectResourceStatus[]>("inspect_project_resources", { projectPath, resourcePaths: projectResources.map((resource) => resource.path) })
      .then((items) => {
        if (disposed) return;
        setProjectResourceStatus(Object.fromEntries(items.map((item) => [item.path, item])));
      })
      .catch((error) => {
        if (!disposed) Blockly.dialog.alert(`无法检查工程资源：${String(error)}`);
      });
    return () => { disposed = true; };
  }, [projectPath, projectResources]);

  const importAudioFromResourcePanel = useCallback(async () => {
    const currentProjectPath = projectPathRef.current;
    if (!currentProjectPath) {
      Blockly.dialog.alert("请先保存工程，再添加音频资源。");
      return;
    }
    const sourcePath = await open({ multiple: false, directory: false, filters: [{ name: "音频文件", extensions: ["wav", "mp3", "ogg", "flac", "m4a", "aac"] }] });
    if (typeof sourcePath !== "string") return;
    try {
      const resource = await invoke<ImportedProjectResource>("import_project_audio", { projectPath: currentProjectPath, sourcePath, existingResources: projectResourcesRef.current.map(({ id, path, originalName }) => ({ id, path, originalName })) });
      if (resource.deduplicated) {
        setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `已复用工程中的音频资源：${resource.originalName}\n` }]);
        return;
      }
      const next = [...projectResourcesRef.current, importedProjectResourceData(resource)];
      projectResourcesRef.current = next;
      setProjectResources(next);
      setProjectResourceStatus((status) => ({ ...status, [resource.path]: { path: resource.path, exists: true, size: resource.size } }));
    } catch (error) {
      Blockly.dialog.alert(`无法导入音频资源：${String(error)}`);
    }
  }, []);

  useEffect(() => {
    const acceptsResource = (event: DragEvent) => event.dataTransfer?.types.includes("application/x-visual-python-resource") && isBlockWorkspaceMode(workspaceMode);
    const onDragOver = (event: DragEvent) => {
      if (!acceptsResource(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (event: DragEvent) => {
      if (!acceptsResource(event)) return;
      event.preventDefault();
      const id = event.dataTransfer?.getData("application/x-visual-python-resource");
      if (!id) return;
      const ws = workspace.current;
      const hostElement = host.current;
      if (!ws || !hostElement || !hostElement.contains(event.target as Node)) return;
      const resource = projectResourcesRef.current.find((item) => item.id === id);
      if (!resource) return;
      Blockly.Events.setGroup(true);
      try {
        const audioBlock = ws.newBlock("visual_python_manim_play_local_audio");
        const pathBlock = ws.newBlock("text");
        const offsetBlock = ws.newBlock("math_number");
        const gainBlock = ws.newBlock("math_number");
        pathBlock.setFieldValue(projectResourceReference(resource.id), "TEXT");
        offsetBlock.setFieldValue(0, "NUM");
        gainBlock.setFieldValue(0, "NUM");
        for (const block of [audioBlock, pathBlock, offsetBlock, gainBlock]) { block.initSvg(); block.render(); }
        audioBlock.getInput("PATH")?.connection?.connect(pathBlock.outputConnection!);
        audioBlock.getInput("TIME_OFFSET")?.connection?.connect(offsetBlock.outputConnection!);
        audioBlock.getInput("GAIN")?.connection?.connect(gainBlock.outputConnection!);
        const point = Blockly.utils.svgMath.screenToWsCoordinates(ws, new Blockly.utils.Coordinate(event.clientX, event.clientY));
        audioBlock.moveBy(point.x, point.y);
        audioBlock.select();
      } finally {
        Blockly.Events.setGroup(false);
      }
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => { window.removeEventListener("dragover", onDragOver); window.removeEventListener("drop", onDrop); };
  }, [workspaceMode]);

  const deleteProjectResource = useCallback(async (resource: ProjectResource) => {
    const usageCount = projectResourceUsage.get(resource.id) ?? 0;
    if (usageCount) {
      Blockly.dialog.alert(`这个资源仍被 ${usageCount} 个积木使用，请先移除对应积木中的资源引用。`);
      return;
    }
    if (!window.confirm(`确定从工程中删除“${resource.originalName}”吗？此操作会同时删除磁盘文件。`)) return;
    const currentProjectPath = projectPathRef.current;
    if (!currentProjectPath) return;
    try {
      await invoke("delete_project_resource", { projectPath: currentProjectPath, resourcePath: resource.path });
      const next = projectResourcesRef.current.filter((item) => item.id !== resource.id);
      projectResourcesRef.current = next;
      setProjectResources(next);
    } catch (error) {
      Blockly.dialog.alert(`无法删除工程资源：${String(error)}`);
    }
  }, [projectResourceUsage]);

  const unusedProjectResources = useMemo(
    () => projectResources.filter((resource) => !(projectResourceUsage.get(resource.id) ?? 0)),
    [projectResourceUsage, projectResources],
  );

  const cleanUnusedProjectResources = useCallback(async () => {
    const currentProjectPath = projectPathRef.current;
    if (!currentProjectPath || !unusedProjectResources.length) return;
    if (!window.confirm(`确定清理 ${unusedProjectResources.length} 个未使用资源吗？对应的磁盘文件也会被删除。`)) return;
    const deletedIds = new Set<string>();
    const failures: string[] = [];
    for (const resource of unusedProjectResources) {
      try {
        await invoke("delete_project_resource", { projectPath: currentProjectPath, resourcePath: resource.path });
        deletedIds.add(resource.id);
      } catch (error) {
        failures.push(`${resource.originalName}：${String(error)}`);
      }
    }
    if (deletedIds.size) {
      const next = projectResourcesRef.current.filter((resource) => !deletedIds.has(resource.id));
      projectResourcesRef.current = next;
      setProjectResources(next);
      if (resourcePreviewId && deletedIds.has(resourcePreviewId)) {
        localAudioPreview.current?.pause();
        localAudioPreview.current = null;
        setResourcePreviewId(null);
      }
    }
    if (failures.length) Blockly.dialog.alert(`部分资源未能删除：\n${failures.join("\n")}`);
  }, [resourcePreviewId, unusedProjectResources]);

  const revealProjectResource = useCallback(async (resource: ProjectResource) => {
    const currentProjectPath = projectPathRef.current;
    if (!currentProjectPath) return;
    try {
      await invoke("reveal_project_resource", { projectPath: currentProjectPath, resourcePath: resource.path });
    } catch (error) {
      Blockly.dialog.alert(`无法打开资源所在位置：${String(error)}`);
    }
  }, []);

  const formatResourceSize = (size: number) => size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
  const runPrimaryAction = useCallback(() => {
    if (renderingManim) return void stopManimRender();
    if (running) return void stopCode();
    return manimSceneName ? void renderManim() : void runCode();
  }, [manimSceneName, renderManim, renderingManim, runCode, running, stopCode, stopManimRender]);

  useEffect(() => {
    const onWorkbenchShortcut = (event: KeyboardEvent) => {
      const action = getWorkbenchShortcutAction(event);
      if (!action) return;
      const overlayOpen = settingsOpen || pluginsOpen || resourcesOpen || closePromptOpen || manimRenderSettingsOpen || formulaEditorRequest !== null || projectMenuOpen || exampleMenuOpen || shortcutMenuOpen || manimSceneMenuOpen || pythonEnvironmentMenuOpen || codeOutlineOpen;
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
  }, [changeWorkspaceMode, closePromptOpen, codeOutlineOpen, exampleMenuOpen, formulaEditorRequest, manimRenderSettingsOpen, manimSceneMenuOpen, pluginsOpen, projectMenuOpen, pythonEnvironmentMenuOpen, renderManim, renderingManim, resourcesOpen, runPrimaryAction, running, settingsOpen, shortcutMenuOpen]);

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
      const persistedDocuments = sceneDocuments.map((document) => document.id === activeSceneId ? { ...document, code: sourceCode, name: sceneDocumentName(sourceCode, document.name) } : document);
      const draft: DraftProject = {
        version: 1,
        name: projectName,
        path: projectPath,
        savedAt: Date.now(),
        workspace: Blockly.serialization.workspaces.save(workspace.current),
        plugins: pluginRegistry.createProjectState(workspace.current),
        sourceCode: sourceCodeInitialized ? sourceCode : undefined,
        sceneDocuments: persistedDocuments.length ? persistedDocuments : undefined,
        activeSceneId: activeSceneId || undefined,
        workspaceMode,
        resources: projectResourcesRef.current,
      };
      localStorage.setItem("visual-python:draft", JSON.stringify(draft));
    }
    return true;
  }, [activeSceneId, cancelAutosave, dirty, projectName, projectPath, sceneDocuments, sourceCode, sourceCodeInitialized, voiceoverRoles, workspaceMode]);

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
    if (isCorePlugin(record.plugin.manifest.id)) return;
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
    if (workspaceMode !== "split") return;
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
  }, [rightPanelWidth, workspaceMode]);

  const runAiCodeAgentTask = useCallback(async ({
    prompt,
    history,
    onActivity,
    signal,
  }: {
    prompt: string;
    history: AiConversationTurn[];
    onActivity: (activity: AiAgentActivity) => void;
    signal: AbortSignal;
  }): Promise<AiAgentResult> => {
    if (workspaceModeRef.current !== "code") throw new Error("AI 编程助手仅在纯代码模式下可用");
    const agentSceneId = activeSceneIdRef.current;
    aiAgentSceneIdRef.current = agentSceneId;
    setAiAgentBusy(true);
    setSceneAiStatuses((statuses) => ({ ...statuses, [agentSceneId]: "working" }));
    const reportActivity = (activity: AiAgentActivity) => {
      const sceneId = activeSceneIdRef.current || agentSceneId;
      const mutating = activity.toolName && ["create_scene", "rename_scene", "delete_scene", "replace_code", "edit_code", "insert_statements", "replace_function_body", "add_import", "add_voiceover", "add_synchronized_voiceover", "format_code", "undo_code", "redo_code"].includes(activity.toolName);
      if (activity.status === "error") setSceneAiStatuses((statuses) => ({ ...statuses, [sceneId]: "error" }));
      else if (activity.toolName === "switch_scene") setSceneAiStatuses((statuses) => ({ ...statuses, [sceneId]: "working" }));
      else if (activity.toolName === "inspect_rendered_video") setSceneAiStatuses((statuses) => ({ ...statuses, [sceneId]: "rendered" }));
      else if (activity.toolName === "validate_scene") setSceneAiStatuses((statuses) => ({ ...statuses, [sceneId]: "validated" }));
      else if (mutating) setSceneAiStatuses((statuses) => ({ ...statuses, [sceneId]: "changed" }));
      onActivity(activity);
    };
    const taskBeforeDocuments = sceneDocumentsRef.current.map((document) => document.id === agentSceneId
      ? { ...document, code: sourceCodeRef.current, name: sceneDocumentName(sourceCodeRef.current, document.name) }
      : { ...document });
    const taskBeforeActiveSceneId = agentSceneId;
    let projectDirty = dirty;
    let codePreviewOriginal: string | null = null;

    const waitWithSignal = (milliseconds: number) => new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new Error("已停止生成")); return; }
      const timer = window.setTimeout(finish, milliseconds);
      function finish() { signal.removeEventListener("abort", cancel); resolve(); }
      function cancel() { window.clearTimeout(timer); signal.removeEventListener("abort", cancel); reject(new Error("已停止生成")); }
      signal.addEventListener("abort", cancel, { once: true });
    });

    const writeEditorCode = (nextCode: string, syncState = true) => {
      const editor = codeEditor.current;
      const model = editor?.getModel();
      if (editor && model && model.getValue() !== nextCode) {
        editor.executeEdits("ai-code-agent", [{ range: model.getFullModelRange(), text: nextCode, forceMoveMarkers: true }]);
      }
      sourceCodeRef.current = nextCode;
      if (syncState) {
        setSourceCode(nextCode);
        setSourceCodeInitialized(true);
      }
    };

    const previewCode = (nextCode: string) => {
      if (workspaceModeRef.current !== "code") return;
      if (codePreviewOriginal === null) {
        codePreviewOriginal = sourceCodeRef.current;
        aiCodePreviewing.current = true;
        codeEditor.current?.pushUndoStop();
      }
      writeEditorCode(nextCode, false);
    };

    const cancelCodePreview = () => {
      if (codePreviewOriginal === null) return;
      const original = codePreviewOriginal;
      codePreviewOriginal = null;
      aiCodePreviewing.current = false;
      writeEditorCode(original);
      codeEditor.current?.pushUndoStop();
      setDirty(projectDirty);
    };

    const commitCode = (nextCode: string) => {
      if (workspaceModeRef.current !== "code") throw new Error("工作区已经离开纯代码模式");
      const previousCode = codePreviewOriginal ?? sourceCodeRef.current;
      const editor = codeEditor.current;
      const model = editor?.getModel();
      if (codePreviewOriginal === null && editor && model && model.getValue() !== nextCode) {
        editor.pushUndoStop();
      }
      aiCodePreviewing.current = false;
      writeEditorCode(nextCode);
      codePreviewOriginal = null;
      editor?.pushUndoStop();
      codeValidationVersion.current += 1;
      setCodeSyntaxDiagnostic(null);
      setCodeRuntimeDiagnostic(null);
      setProblems((items) => items.filter((problem) => !["syntax", "runtime", "timeout"].includes(problem.kind)));
      setDirty(true);
      projectDirty = true;
      return {
        changed: previousCode !== nextCode,
        diff: createCodeChangePreview(previousCode, nextCode),
        lineCount: nextCode ? nextCode.split("\n").length : 0,
        __codeChange: previousCode !== nextCode ? { before: previousCode, after: nextCode, sceneId: activeSceneIdRef.current, sceneName: sceneDocumentsRef.current.find((document) => document.id === activeSceneIdRef.current)?.name } : undefined,
      };
    };

    const checkedString = (args: Record<string, unknown>, key: string, allowEmpty = false) => {
      const value = args[key];
      if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new Error(`参数 ${key} 必须是${allowEmpty ? "" : "非空"}字符串`);
      return value;
    };

    const toolSummary = (args: Record<string, unknown>, fallback: string) => typeof args.summary === "string" && args.summary.trim() ? args.summary.trim() : fallback;

    const validateCandidateCode = async (candidateCode: string) => {
      try {
        await invoke("validate_python_code", { code: candidateCode, pythonPath: pythonEnvironment?.path || null });
      } catch (error) {
        throw new Error(`候选代码存在语法或缩进错误，未应用到编辑器：${String(error)}`);
      }
    };

    const executeTool = async (name: AiAgentToolName, args: Record<string, unknown>, toolSignal: AbortSignal): Promise<Record<string, unknown>> => {
      if (toolSignal.aborted) throw new Error("已停止生成");
      if (workspaceModeRef.current !== "code") throw new Error("工作区已经离开纯代码模式");

      if (name === "list_scenes") {
        const documents = sceneDocumentsRef.current.map((document) => document.id === activeSceneIdRef.current ? { ...document, code: sourceCodeRef.current, name: sceneDocumentName(sourceCodeRef.current, document.name) } : document);
        return { activeSceneId: activeSceneIdRef.current, scenes: documents.map((document) => ({ id: document.id, name: document.name, lineCount: document.code ? document.code.split("\n").length : 0, active: document.id === activeSceneIdRef.current })) };
      }

      if (name === "get_scene") {
        const sceneId = checkedString(args, "sceneId");
        const document = sceneDocumentsRef.current.find((item) => item.id === sceneId);
        if (!document) throw new Error(`场景不存在：${sceneId}。请重新调用 list_scenes。`);
        const code = document.id === activeSceneIdRef.current ? sourceCodeRef.current : document.code;
        return { id: document.id, name: sceneDocumentName(code, document.name), code, lineCount: code ? code.split("\n").length : 0, active: document.id === activeSceneIdRef.current };
      }

      if (name === "switch_scene") {
        const sceneId = checkedString(args, "sceneId");
        const documents = sceneDocumentsRef.current.map((document) => document.id === activeSceneIdRef.current ? { ...document, code: sourceCodeRef.current, name: sceneDocumentName(sourceCodeRef.current, document.name) } : document);
        const document = documents.find((item) => item.id === sceneId);
        if (!document) throw new Error(`场景不存在：${sceneId}。请重新调用 list_scenes。`);
        if (taskId.current !== null || manimTaskId.current !== null || manimRenderAttempt.current) throw new Error("请先等待或停止当前运行/渲染任务，再切换场景");
        switchSceneConsoleState(activeSceneIdRef.current, document.id);
        sceneDocumentsRef.current = documents;
        activeSceneIdRef.current = document.id;
        sourceCodeRef.current = document.code;
        setSceneDocuments(documents);
        setActiveSceneId(document.id);
        setSourceCode(document.code);
        updateManimRenderConfig({ selectedScene: extractManimSceneNames(document.code)[0] || document.name });
        await waitWithSignal(0);
        return { switched: true, id: document.id, name: document.name, code: document.code, lineCount: document.code ? document.code.split("\n").length : 0 };
      }

      if (name === "create_scene") {
        const requestedName = typeof args.name === "string" && args.name.trim() ? args.name.trim() : "NewScene";
        if (!/^[A-Za-z_]\w*$/.test(requestedName)) throw new Error("场景名称必须是有效的 Python 类名");
        const documents = sceneDocumentsRef.current.map((document) => document.id === activeSceneIdRef.current ? { ...document, code: sourceCodeRef.current, name: sceneDocumentName(sourceCodeRef.current, document.name) } : document);
        const document = createSceneDocument(documents.map((item) => item.name), requestedName);
        const nextDocuments = [...documents, document];
        switchSceneConsoleState(activeSceneIdRef.current, document.id);
        sceneDocumentsRef.current = nextDocuments;
        activeSceneIdRef.current = document.id;
        sourceCodeRef.current = document.code;
        setSceneDocuments(nextDocuments);
        setActiveSceneId(document.id);
        setSourceCode(document.code);
        setSourceCodeInitialized(true);
        setDirty(true);
        projectDirty = true;
        updateManimRenderConfig({ selectedScene: document.name });
        await waitWithSignal(0);
        return { created: true, id: document.id, name: document.name, code: document.code };
      }

      if (name === "rename_scene") {
        const sceneId = checkedString(args, "sceneId");
        const nextName = checkedString(args, "name");
        if (sceneDocumentsRef.current.some((document) => document.id !== sceneId && document.name === nextName)) throw new Error(`场景名称已存在：${nextName}`);
        const currentDocuments = sceneDocumentsRef.current.map((document) => document.id === activeSceneIdRef.current ? { ...document, code: sourceCodeRef.current } : document);
        const target = currentDocuments.find((document) => document.id === sceneId);
        if (!target) throw new Error(`场景不存在：${sceneId}。请重新调用 list_scenes。`);
        const renamed = renameSceneDocument(target, nextName);
        await validateCandidateCode(renamed.code);
        const documents = currentDocuments.map((document) => document.id === sceneId ? renamed : document);
        sceneDocumentsRef.current = documents;
        setSceneDocuments(documents);
        if (sceneId === activeSceneIdRef.current) {
          sourceCodeRef.current = renamed.code;
          setSourceCode(renamed.code);
          updateManimRenderConfig({ selectedScene: nextName });
        }
        setDirty(true);
        projectDirty = true;
        return {
          renamed: true,
          id: sceneId,
          name: nextName,
          diff: createCodeChangePreview(target.code, renamed.code),
          __codeChange: target.code !== renamed.code ? { before: target.code, after: renamed.code, sceneId, sceneName: nextName } : undefined,
        };
      }

      if (name === "delete_scene") {
        const sceneId = checkedString(args, "sceneId");
        const documents = sceneDocumentsRef.current.map((document) => document.id === activeSceneIdRef.current ? { ...document, code: sourceCodeRef.current } : document);
        const index = documents.findIndex((document) => document.id === sceneId);
        const target = documents[index];
        if (!target) throw new Error(`场景不存在：${sceneId}。请重新调用 list_scenes。`);
        if (documents.length === 1) throw new Error("工程至少需要保留一个场景");
        if (!window.confirm(`AI 请求删除场景“${target.name}”。该场景的完整代码都会被删除，是否继续？`)) throw new Error("用户取消了删除场景");
        const remaining = documents.filter((document) => document.id !== sceneId);
        sceneDocumentsRef.current = remaining;
        setSceneDocuments(remaining);
        if (sceneId === activeSceneIdRef.current) {
          const next = remaining[Math.min(index, remaining.length - 1)];
          switchSceneConsoleState(activeSceneIdRef.current, next.id);
          activeSceneIdRef.current = next.id;
          sourceCodeRef.current = next.code;
          setActiveSceneId(next.id);
          setSourceCode(next.code);
          updateManimRenderConfig({ selectedScene: extractManimSceneNames(next.code)[0] || next.name });
          await waitWithSignal(0);
        }
        setDirty(true);
        projectDirty = true;
        return { deleted: true, id: sceneId, name: target.name, activeSceneId: activeSceneIdRef.current };
      }

      if (name === "get_context") {
        const currentDocument = sceneDocumentsRef.current.find((document) => document.id === activeSceneIdRef.current);
        return {
          project: { name: projectName, path: projectPathRef.current, dirty: projectDirty, scene: { id: activeSceneIdRef.current, name: currentDocument?.name || "当前场景" }, sceneCount: sceneDocumentsRef.current.length },
          code: sourceCodeRef.current,
          lineCount: sourceCodeRef.current ? sourceCodeRef.current.split("\n").length : 0,
          pythonEnvironment: pythonEnvironment ? { version: pythonEnvironment.version, path: pythonEnvironment.path } : null,
          running: taskId.current !== null || runningRef.current,
          rendering: manimTaskId.current !== null || renderingManimRef.current,
          ...(args.includeResources === true ? {
            resources: projectResourcesRef.current.map(({ id, type, path, originalName, size }) => ({ id, type, path, originalName, size })),
          } : {}),
        };
      }

      if (name === "validate_scene") {
        const document = sceneDocumentsRef.current.find((item) => item.id === activeSceneIdRef.current);
        if (!document) throw new Error("当前场景不存在");
        const code = sourceCodeRef.current;
        const base = validateStandaloneSceneSource(code, document.name, projectResourcesRef.current, voiceoverRoles.map((role) => role.id));
        const issues = [...base.issues];
        try {
          await invoke("validate_python_code", { code, pythonPath: pythonEnvironment?.path || null });
        } catch (error) {
          issues.push({ code: "python-syntax", severity: "error" as const, message: String(error) });
        }
        if (base.kind === "manim" && base.sceneNames.length === 1 && !issues.some((issue) => issue.code === "python-syntax")) {
          const structure = await invoke<PythonStructure>("inspect_python_structure", { code, pythonPath: pythonEnvironment?.path || null });
          const sceneClass = structure.classes.find((item) => item.name === base.sceneNames[0]);
          const constructCount = sceneClass?.methods.filter((method) => method.name === "construct").length ?? 0;
          if (constructCount === 0) issues.push({ code: "missing-construct", severity: "error", message: `场景类 ${base.sceneNames[0]} 缺少 construct 方法` });
          else if (constructCount > 1) issues.push({ code: "duplicate-construct", severity: "error", message: `场景类 ${base.sceneNames[0]} 包含多个 construct 方法` });
        }
        const referencedResources = [...code.matchAll(/resource:\/\/([A-Za-z0-9_-]+)/g)]
          .map((match) => projectResourcesRef.current.find((resource) => resource.id === match[1]))
          .filter((resource): resource is ProjectResource => Boolean(resource));
        if (projectPathRef.current && referencedResources.length) {
          const statuses = await invoke<ProjectResourceStatus[]>("inspect_project_resources", { projectPath: projectPathRef.current, resourcePaths: referencedResources.map((resource) => resource.path) });
          for (const status of statuses.filter((item) => !item.exists)) issues.push({ code: "missing-resource-file", severity: "error", message: `工程资源文件不存在：${status.path}` });
        }
        const valid = !issues.some((issue) => issue.severity === "error");
        return { valid, kind: base.kind, sceneId: document.id, sceneName: document.name, issues };
      }

      if (name === "list_resources") {
        const requestedType = typeof args.type === "string" ? args.type : "";
        const query = typeof args.query === "string" ? args.query.trim().toLocaleLowerCase() : "";
        let statuses: ProjectResourceStatus[] = [];
        if (projectPathRef.current && projectResourcesRef.current.length) {
          statuses = await invoke<ProjectResourceStatus[]>("inspect_project_resources", { projectPath: projectPathRef.current, resourcePaths: projectResourcesRef.current.map((resource) => resource.path) });
        }
        const byPath = new Map(statuses.map((status) => [status.path, status]));
        return { resources: projectResourcesRef.current
          .filter((resource) => (!requestedType || resource.type === requestedType) && (!query || resource.originalName.toLocaleLowerCase().includes(query) || resource.id.toLocaleLowerCase().includes(query)))
          .map((resource) => ({ ...resource, resolvedPath: resolveProjectResourceReference(projectResourceReference(resource.id), projectResourcesRef.current, projectPathRef.current), exists: byPath.get(resource.path)?.exists ?? null, actualSize: byPath.get(resource.path)?.size ?? resource.size })) };
      }

      if (name === "get_resource") {
        const resourceId = checkedString(args, "resourceId");
        const resource = projectResourcesRef.current.find((item) => item.id === resourceId);
        if (!resource) throw new Error(`工程资源不存在：${resourceId}`);
        let status: ProjectResourceStatus | undefined;
        if (projectPathRef.current) [status] = await invoke<ProjectResourceStatus[]>("inspect_project_resources", { projectPath: projectPathRef.current, resourcePaths: [resource.path] });
        return { ...resource, resolvedPath: resolveProjectResourceReference(projectResourceReference(resource.id), projectResourcesRef.current, projectPathRef.current), exists: status?.exists ?? null, actualSize: status?.size ?? resource.size };
      }

      if (name === "check_resources") {
        const references = [...sourceCodeRef.current.matchAll(/resource:\/\/([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
        const uniqueIds = [...new Set(references)];
        const resources = uniqueIds.map((id) => projectResourcesRef.current.find((resource) => resource.id === id));
        const missingRecords = uniqueIds.filter((_, index) => !resources[index]);
        let statuses: ProjectResourceStatus[] = [];
        const existing = resources.filter((resource): resource is ProjectResource => Boolean(resource));
        if (projectPathRef.current && existing.length) statuses = await invoke<ProjectResourceStatus[]>("inspect_project_resources", { projectPath: projectPathRef.current, resourcePaths: existing.map((resource) => resource.path) });
        const missingFiles = statuses.filter((status) => !status.exists).map((status) => status.path);
        return { valid: !missingRecords.length && !missingFiles.length, references: uniqueIds, missingRecords, missingFiles };
      }

      if (name === "check_dependencies") {
        if (!pythonEnvironment) throw new Error("尚未选择 Python 环境");
        const packages = args.packages;
        if (!Array.isArray(packages) || !packages.length || packages.some((item) => typeof item !== "string" || !/^[A-Za-z0-9_.-]+$/.test(item))) throw new Error("packages 包含无效包名");
        const statuses = await invoke<PythonPackageStatus[]>("check_python_packages", { pythonPath: pythonEnvironment.path, packages });
        return { valid: statuses.every((status) => status.installed), packages: statuses, missing: statuses.filter((status) => !status.installed).map((status) => status.name) };
      }

      if (name === "install_dependencies") {
        if (!pythonEnvironment) throw new Error("尚未选择 Python 环境");
        const packages = args.packages;
        if (!Array.isArray(packages) || !packages.length || packages.some((item) => typeof item !== "string" || !/^[A-Za-z0-9_.-]+$/.test(item))) throw new Error("packages 包含无效包名");
        const statuses = await invoke<PythonPackageStatus[]>("check_python_packages", { pythonPath: pythonEnvironment.path, packages });
        const missing = statuses.filter((status) => !status.installed).map((status) => status.name);
        if (!missing.length) return { installed: true, packages: [], detail: "依赖已经安装" };
        if (!window.confirm(`AI 请求安装 Python 依赖：\n\n${missing.join(", ")}\n\n是否继续？`)) throw new Error("用户取消了依赖安装");
        setInstallingPackages(true);
        let resolveFinished!: (payload: PackageInstallFinishedEvent) => void;
        let rejectFinished!: (error: unknown) => void;
        const finished = new Promise<PackageInstallFinishedEvent>((resolve, reject) => { resolveFinished = resolve; rejectFinished = reject; });
        const unlisten = await listen<PackageInstallFinishedEvent>("package-install-finished", ({ payload }) => resolveFinished(payload));
        const abort = () => {
          void invoke("stop_package_install");
          rejectFinished(new DOMException("已停止依赖安装", "AbortError"));
        };
        signal.addEventListener("abort", abort, { once: true });
        try {
          await invoke("install_python_packages", { pythonPath: pythonEnvironment.path, packages: missing, indexUrl: usePipMirror ? pipMirrorUrl : null });
          const result = await finished;
          if (!result.success) throw new Error(result.stopped ? "依赖安装已停止" : result.error || "依赖安装失败");
          const verified = await invoke<PythonPackageStatus[]>("check_python_packages", { pythonPath: pythonEnvironment.path, packages });
          const stillMissing = verified.filter((status) => !status.installed).map((status) => status.name);
          if (stillMissing.length) throw new Error(`安装完成后仍缺少依赖：${stillMissing.join(", ")}`);
          return { installed: true, packages: missing, verified: true };
        } finally {
          unlisten();
          signal.removeEventListener("abort", abort);
          setInstallingPackages(false);
        }
      }

      if (name === "inspect_rendered_video") {
        const video = manimVideoRef.current;
        if (!video) throw new Error("当前场景还没有渲染视频");
        const result = await inspectVideoQuality(video.url);
        const valid = result.durationSeconds > 0 && result.width > 0 && result.height > 0 && result.blankFrameLikely !== true;
        return { valid, scene: video.scene, path: video.path, ...result, ...(result.blankFrameLikely === true ? { warning: "视频中点画面亮度几乎没有变化，疑似空白画面" } : {}) };
      }

      if (name === "replace_code") {
        const code = checkedString(args, "code", true);
        const existingCode = codePreviewOriginal ?? sourceCodeRef.current;
        if (countFakeVoiceoverApis(code) > countFakeVoiceoverApis(existingCode)) throw new Error("不能在 Python 代码中调用 self.add_voiceover 或 self.add_synchronized_voiceover；请使用 AI 专用配音工具。");
        await validateCandidateCode(code);
        return { summary: toolSummary(args, "重写代码"), ...commitCode(code) };
      }

      if (name === "edit_code") {
        if (!Array.isArray(args.edits) || !args.edits.length) throw new Error("参数 edits 必须是非空数组");
        const edits = args.edits.map((candidate, index): AiCodeEdit => {
          if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error(`第 ${index + 1} 个编辑格式无效`);
          const edit = candidate as Record<string, unknown>;
          if (typeof edit.oldText !== "string" || typeof edit.newText !== "string") throw new Error(`第 ${index + 1} 个编辑必须包含字符串 oldText 和 newText`);
          return { oldText: edit.oldText, newText: edit.newText, replaceAll: edit.replaceAll === true };
        });
        const nextCode = applyExactCodeEdits(sourceCodeRef.current, edits);
        if (countFakeVoiceoverApis(nextCode) > countFakeVoiceoverApis(sourceCodeRef.current)) throw new Error("不能在 Python 代码中调用 self.add_voiceover 或 self.add_synchronized_voiceover；请使用 AI 专用配音工具。");
        await validateCandidateCode(nextCode);
        return { summary: toolSummary(args, "修改代码"), editCount: args.edits.length, ...commitCode(nextCode) };
      }

      if (name === "inspect_python_structure") {
        return invoke<PythonStructure>("inspect_python_structure", { code: sourceCodeRef.current, pythonPath: pythonEnvironment?.path || null });
      }

      if (name === "insert_statements" || name === "replace_function_body" || name === "add_import") {
        const currentCode = sourceCodeRef.current;
        const structure = await invoke<PythonStructure>("inspect_python_structure", { code: currentCode, pythonPath: pythonEnvironment?.path || null });
        let nextCode: string;
        if (name === "insert_statements") {
          if (!Array.isArray(args.statements) || !args.statements.length || args.statements.some((item) => typeof item !== "string" || !item.trim())) throw new Error("statements 必须是非空 Python 语句字符串数组");
          nextCode = insertPythonStatements(currentCode, structure, {
            ...(typeof args.className === "string" && args.className.trim() ? { className: args.className.trim() } : {}),
            functionName: checkedString(args, "functionName"),
            position: args.position === "start" ? "start" : args.position === "end" ? "end" : (() => { throw new Error("position 必须是 start 或 end"); })(),
            statements: args.statements as string[],
          });
        } else if (name === "replace_function_body") {
          nextCode = replacePythonFunctionBody(currentCode, structure, {
            ...(typeof args.className === "string" && args.className.trim() ? { className: args.className.trim() } : {}),
            functionName: checkedString(args, "functionName"),
            body: checkedString(args, "body"),
          });
        } else {
          const names = args.names === undefined ? [] : args.names;
          if (!Array.isArray(names) || names.some((item) => typeof item !== "string")) throw new Error("names 必须是字符串数组");
          nextCode = addPythonImport(currentCode, structure, checkedString(args, "module"), names as string[]);
        }
        if (countFakeVoiceoverApis(nextCode) > countFakeVoiceoverApis(currentCode)) throw new Error("不能在 Python 代码中调用 self.add_voiceover 或 self.add_synchronized_voiceover；请使用 AI 专用配音工具。");
        await validateCandidateCode(nextCode);
        return { summary: toolSummary(args, name === "insert_statements" ? "插入语句" : name === "replace_function_body" ? "重建函数" : "添加导入"), ...commitCode(nextCode) };
      }

      if (name === "get_voiceover_context") {
        const hasApiKey = await invoke<boolean>("has_tts_api_key", { config: ttsConfig });
        return {
          configured: Boolean(ttsConfig.baseUrl.trim() && hasApiKey),
          hasApiKey,
          provider: ttsConfig.provider,
          defaultVoice: { model: ttsConfig.model, voice: ttsConfig.voice, speed: ttsConfig.speed },
          roles: [
            { id: "default", name: "默认旁白", model: ttsConfig.model, voice: ttsConfig.voice, speed: ttsConfig.speed },
            ...voiceoverRoles.map(({ id, name: roleName, model, voice, speed }) => ({ id, name: roleName, model, voice, speed })),
          ],
        };
      }

      if (name === "add_voiceover" || name === "add_synchronized_voiceover") {
        const hasApiKey = Boolean(ttsApiKey.trim()) || await invoke<boolean>("has_tts_api_key", { config: ttsConfig }).catch(() => false);
        if (!ttsConfig.baseUrl.trim() || !hasApiKey) {
          throw new Error("配音服务尚未配置完成。请让用户先在 Manim 设置的视频配音中填写百炼接口地址和 API Key。不要继续添加配音或尝试渲染。");
        }
        const summary = toolSummary(args, name === "add_synchronized_voiceover" ? "添加同步配音" : "添加配音");
        const text = checkedString(args, "text");
        const roleId = typeof args.roleId === "string" && args.roleId.trim() ? args.roleId.trim() : "default";
        if (roleId !== "default" && !voiceoverRoles.some((role) => role.id === roleId)) throw new Error(`配音角色不存在：${roleId}。请重新调用 get_voiceover_context。`);
        const currentCode = sourceCodeRef.current;
        const nextCode = name === "add_voiceover"
          ? insertStandaloneVoiceover(
            currentCode,
            checkedString(args, "anchorText"),
            text,
            roleId,
            args.placement === "after" ? "after" : "before",
          )
          : insertSynchronizedVoiceover(currentCode, checkedString(args, "targetText"), text, roleId);
        await validateCandidateCode(nextCode);
        return { summary, roleId, synchronized: name === "add_synchronized_voiceover", ...commitCode(nextCode) };
      }

      if (name === "check_voiceover") {
        const inspection = inspectVoiceovers(sourceCodeRef.current, voiceoverRoles.map((role) => role.id));
        setProblems((items) => [
          ...items.filter((problem) => problem.kind !== "plugin" || !problem.message.startsWith("配音：")),
          ...inspection.issues.map((message) => ({ id: problemId.current++, kind: "plugin" as const, line: Number(message.match(/^第 (\d+) 行/)?.[1] || 0), message: `配音：${message}` })),
        ]);
        if (!inspection.valid) setActivePanel("problems");
        return inspection;
      }

      if (name === "check_code") {
        const code = sourceCodeRef.current;
        try {
          await invoke("validate_python_code", { code, pythonPath: pythonEnvironment?.path || null });
          setCodeSyntaxDiagnostic(null);
          setProblems((items) => items.filter((problem) => problem.kind !== "syntax"));
          return { valid: true, lineCount: code ? code.split("\n").length : 0 };
        } catch (error) {
          const traceback = String(error);
          const diagnostic = parsePythonSyntaxDiagnostic(traceback, code);
          if (diagnostic) setCodeSyntaxDiagnostic(diagnostic);
          setProblems((items) => [
            ...items.filter((problem) => problem.kind !== "syntax"),
            { id: problemId.current++, kind: "syntax", line: diagnostic?.line ?? 0, message: diagnostic?.message || traceback, suggestion: diagnostic?.suggestion },
          ]);
          setActivePanel("problems");
          return { valid: false, error: traceback, diagnostic };
        }
      }

      if (name === "format_code") {
        const formatted = await formatCurrentPythonCode(false);
        if (formatted === null) throw new Error("代码格式化失败，请先检查语法问题");
        sourceCodeRef.current = formatted;
        return { formatted: true, lineCount: formatted ? formatted.split("\n").length : 0 };
      }

      if (name === "undo_code" || name === "redo_code") {
        const editor = codeEditor.current;
        if (!editor) throw new Error("代码编辑器尚未就绪");
        editor.trigger("ai-code-agent", name === "undo_code" ? "undo" : "redo", null);
        await waitWithSignal(0);
        const code = editor.getValue();
        sourceCodeRef.current = code;
        setSourceCode(code);
        setDirty(true);
        return { lineCount: code ? code.split("\n").length : 0 };
      }

      if (name === "run_project") {
        await runCode();
        return { started: taskId.current !== null, next: "使用 wait 后调用 get_execution_state" };
      }

      if (name === "render_manim") {
        await renderManim();
        const started = manimTaskId.current !== null || manimRenderAttempt.current !== null;
        if (!started) throw new Error(problemsRef.current.at(-1)?.message || "Manim 渲染未能启动");
        return { started, next: "使用 wait 后调用 get_execution_state" };
      }

      if (name === "get_execution_state") {
        return {
          running: taskId.current !== null,
          rendering: manimTaskId.current !== null || manimRenderAttempt.current !== null,
          output: outputRef.current.slice(-120).map(({ stream, data }) => ({ stream, data })),
          problems: problemsRef.current.map(({ kind, line, message, suggestion }) => ({ kind, line, message, suggestion })),
          video: manimVideoRef.current ? { scene: manimVideoRef.current.scene, path: manimVideoRef.current.path } : null,
        };
      }

      if (name === "wait") {
        const requested = typeof args.milliseconds === "number" ? args.milliseconds : 1000;
        const milliseconds = Math.max(100, Math.min(10_000, Math.round(requested)));
        await waitWithSignal(milliseconds);
        return { waitedMilliseconds: milliseconds, running: taskId.current !== null, rendering: manimTaskId.current !== null || manimRenderAttempt.current !== null };
      }

      if (name === "stop_execution") {
        if (manimTaskId.current !== null || manimRenderAttempt.current) await stopManimRender();
        if (taskId.current !== null) await stopCode();
        return { stopped: true };
      }

      if (name === "save_project") {
        const path = projectPathRef.current;
        if (!path) throw new Error("当前工程还没有保存路径，请先使用“另存为”选择位置");
        const saved = await writeProject(path, sourceCodeRef.current);
        if (saved) projectDirty = false;
        return { saved, path };
      }

      throw new Error(`未实现工具 ${name}`);
    };

    try {
      const result = await runAiCodeAgent({
        prompt,
        history,
        onActivity: reportActivity,
        signal,
        host: {
          executeTool,
          previewCode,
          cancelCodePreview,
          getSnapshot: () => {
            const document = sceneDocumentsRef.current.find((item) => item.id === activeSceneIdRef.current);
            return {
              project: { name: projectName, path: projectPathRef.current, dirty: projectDirty, scene: { id: activeSceneIdRef.current, name: document?.name || "当前场景" }, sceneCount: sceneDocumentsRef.current.length },
              code: sourceCodeRef.current,
              running: taskId.current !== null,
              rendering: manimTaskId.current !== null || manimRenderAttempt.current !== null,
            };
          },
          getLineCount: () => sourceCodeRef.current ? sourceCodeRef.current.split("\n").length : 0,
        },
      });
      const taskAfterDocuments = sceneDocumentsRef.current.map((document) => document.id === activeSceneIdRef.current
        ? { ...document, code: sourceCodeRef.current, name: sceneDocumentName(sourceCodeRef.current, document.name) }
        : { ...document });
      const changed = JSON.stringify(taskBeforeDocuments) !== JSON.stringify(taskAfterDocuments);
      setSceneAiStatuses((statuses) => {
        const next = { ...statuses };
        if (next[agentSceneId] === "working") delete next[agentSceneId];
        for (const document of taskAfterDocuments) {
          const before = taskBeforeDocuments.find((item) => item.id === document.id);
          if ((!before || before.code !== document.code || before.name !== document.name) && !next[document.id]) next[document.id] = "changed";
        }
        return next;
      });
      return {
        ...result,
        ...(changed ? { taskChange: { before: taskBeforeDocuments, after: taskAfterDocuments, beforeActiveSceneId: taskBeforeActiveSceneId, afterActiveSceneId: activeSceneIdRef.current } } : {}),
      };
    } catch (error) {
      setSceneAiStatuses((statuses) => ({ ...statuses, [activeSceneIdRef.current || agentSceneId]: "error" }));
      const restored = taskBeforeDocuments.map((document) => ({ ...document }));
      const active = restored.find((document) => document.id === taskBeforeActiveSceneId) ?? restored[0];
      if (active) switchSceneConsoleState(activeSceneIdRef.current, active.id);
      sceneDocumentsRef.current = restored;
      activeSceneIdRef.current = active?.id || "";
      sourceCodeRef.current = active?.code || "";
      setSceneDocuments(restored);
      setActiveSceneId(active?.id || "");
      setSourceCode(active?.code || "");
      setDirty(dirty);
      if (active) updateManimRenderConfig({ selectedScene: extractManimSceneNames(active.code)[0] || active.name });
      throw error;
    } finally {
      window.setTimeout(() => {
        aiAgentSceneIdRef.current = null;
        setAiAgentBusy(false);
      }, 0);
    }
  }, [dirty, formatCurrentPythonCode, projectName, pythonEnvironment, renderManim, runCode, stopCode, stopManimRender, ttsConfig, voiceoverRoles, writeProject]);

  const applyAiTaskSnapshot = useCallback((change: AiTaskChangeSnapshot, direction: "undo" | "apply") => {
    if (aiAgentSceneIdRef.current) return false;
    const expected = direction === "undo" ? change.after : change.before;
    const replacement = direction === "undo" ? change.before : change.after;
    const current = persistActiveSceneDocument();
    if (JSON.stringify(current) !== JSON.stringify(expected)) {
      Blockly.dialog.alert(direction === "undo" ? "任务完成后场景代码又发生了变化，无法整体撤销。" : "撤销后场景代码又发生了变化，无法重新应用。");
      return false;
    }
    const documents = replacement.map((document) => ({ ...document }));
    const requestedActiveId = direction === "undo" ? change.beforeActiveSceneId : change.afterActiveSceneId;
    const active = documents.find((document) => document.id === requestedActiveId) ?? documents[0];
    switchSceneConsoleState(activeSceneIdRef.current, active.id);
    sceneDocumentsRef.current = documents;
    activeSceneIdRef.current = active.id;
    sourceCodeRef.current = active.code;
    setSceneDocuments(documents);
    setActiveSceneId(active.id);
    setSourceCode(active.code);
    setDirty(true);
    updateManimRenderConfig({ selectedScene: extractManimSceneNames(active.code)[0] || active.name });
    return true;
  }, []);

  const revealAiCodeChange = useCallback((diff: string, requestedLine?: number) => {
    const editor = codeEditor.current;
    const monaco = codeEditorMonaco.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return;
    const startLine = Number(diff.match(/^@@ 第 (\d+) 行 @@/)?.[1]);
    if (!Number.isInteger(startLine) || startLine < 1) return;
    const lines = diff.split("\n").slice(1);
    const removedLines = lines.filter((line) => line.startsWith("- ")).map((line) => line.slice(2));
    const addedLines = lines.filter((line) => line.startsWith("+ ")).map((line) => line.slice(2));
    clearAiCodeChange();
    if (addedLines.length) {
      const lastAddedLine = Math.min(model.getLineCount(), startLine + addedLines.length - 1);
      if (startLine <= lastAddedLine) {
        aiCodeChangeDecorations.current = editor.createDecorationsCollection([{
          range: new monaco.Range(startLine, 1, lastAddedLine, model.getLineMaxColumn(lastAddedLine)),
          options: { isWholeLine: true, className: "ai-code-diff-added-line", linesDecorationsClassName: "ai-code-diff-added-gutter" },
        }]);
      }
    }
    if (removedLines.length) {
      const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
      const codeNode = document.createElement("div");
      codeNode.className = "ai-code-diff-removed-zone";
      codeNode.style.lineHeight = `${lineHeight}px`;
      removedLines.forEach((text) => {
        const row = document.createElement("div");
        row.textContent = text || " ";
        codeNode.appendChild(row);
      });
      const marginNode = document.createElement("div");
      marginNode.className = "ai-code-diff-removed-margin";
      marginNode.style.lineHeight = `${lineHeight}px`;
      removedLines.forEach((_, index) => {
        const row = document.createElement("div");
        row.textContent = String(startLine + index);
        marginNode.appendChild(row);
      });
      editor.changeViewZones((accessor) => {
        aiCodeChangeViewZone.current = accessor.addZone({
          afterLineNumber: Math.max(0, startLine - 1),
          heightInLines: removedLines.length,
          domNode: codeNode,
          marginDomNode: marginNode,
          suppressMouseDown: true,
        });
      });
    }
    const line = Math.max(1, Math.min(model.getLineCount(), Math.round(requestedLine ?? startLine)));
    editor.revealLineInCenter(line);
    editor.focus();
  }, [clearAiCodeChange]);

  const undoAiCodeChange = useCallback((change: AiCodeChangeSnapshot): boolean => {
    if (change.sceneId && change.sceneId !== activeSceneIdRef.current) {
      const documents = persistActiveSceneDocument();
      const target = documents.find((document) => document.id === change.sceneId);
      if (!target || target.code !== change.after) {
        Blockly.dialog.alert(`场景“${change.sceneName || change.sceneId}”在这次 AI 修改后又发生了变化，无法直接撤销此记录。`);
        return false;
      }
      const updated = { ...target, code: change.before, name: sceneDocumentName(change.before, target.name) };
      const nextDocuments = documents.map((document) => document.id === target.id ? updated : document);
      sceneDocumentsRef.current = nextDocuments;
      activeSceneIdRef.current = updated.id;
      sourceCodeRef.current = updated.code;
      setSceneDocuments(nextDocuments);
      setActiveSceneId(updated.id);
      setSourceCode(updated.code);
      updateManimRenderConfig({ selectedScene: extractManimSceneNames(updated.code)[0] || updated.name });
      setDirty(true);
      return true;
    }
    const editor = codeEditor.current;
    const model = editor?.getModel();
    if (!editor || !model) return false;
    if (model.getValue() !== change.after) {
      Blockly.dialog.alert("当前代码在这次 AI 修改后又发生了变化。为避免覆盖后续修改，无法直接撤销此记录。请使用编辑器的撤销功能逐步回退。");
      return false;
    }
    clearAiCodeChange();
    editor.pushUndoStop();
    editor.executeEdits("ai-code-change-undo", [{ range: model.getFullModelRange(), text: change.before, forceMoveMarkers: true }]);
    editor.pushUndoStop();
    sourceCodeRef.current = change.before;
    setSourceCode(change.before);
    setSourceCodeInitialized(true);
    codeValidationVersion.current += 1;
    setCodeSyntaxDiagnostic(null);
    setCodeRuntimeDiagnostic(null);
    setProblems((items) => items.filter((problem) => !["syntax", "runtime", "timeout"].includes(problem.kind)));
    setDirty(true);
    editor.focus();
    return true;
  }, [clearAiCodeChange]);

  const applyAiCodeChange = useCallback((change: AiCodeChangeSnapshot): boolean => {
    if (change.sceneId && change.sceneId !== activeSceneIdRef.current) {
      const documents = persistActiveSceneDocument();
      const target = documents.find((document) => document.id === change.sceneId);
      if (!target || target.code !== change.before) {
        Blockly.dialog.alert(`场景“${change.sceneName || change.sceneId}”在撤销后又发生了变化，无法重新应用此记录。`);
        return false;
      }
      const updated = { ...target, code: change.after, name: sceneDocumentName(change.after, target.name) };
      const nextDocuments = documents.map((document) => document.id === target.id ? updated : document);
      sceneDocumentsRef.current = nextDocuments;
      activeSceneIdRef.current = updated.id;
      sourceCodeRef.current = updated.code;
      setSceneDocuments(nextDocuments);
      setActiveSceneId(updated.id);
      setSourceCode(updated.code);
      updateManimRenderConfig({ selectedScene: extractManimSceneNames(updated.code)[0] || updated.name });
      setDirty(true);
      return true;
    }
    const editor = codeEditor.current;
    const model = editor?.getModel();
    if (!editor || !model) return false;
    if (model.getValue() !== change.before) {
      Blockly.dialog.alert("当前代码在撤销后又发生了变化。为避免覆盖后续修改，无法重新应用此记录。");
      return false;
    }
    clearAiCodeChange();
    editor.pushUndoStop();
    editor.executeEdits("ai-code-change-apply", [{ range: model.getFullModelRange(), text: change.after, forceMoveMarkers: true }]);
    editor.pushUndoStop();
    sourceCodeRef.current = change.after;
    setSourceCode(change.after);
    setSourceCodeInitialized(true);
    codeValidationVersion.current += 1;
    setCodeSyntaxDiagnostic(null);
    setCodeRuntimeDiagnostic(null);
    setProblems((items) => items.filter((problem) => !["syntax", "runtime", "timeout"].includes(problem.kind)));
    setDirty(true);
    editor.focus();
    return true;
  }, [clearAiCodeChange]);
  const startAiPanelResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!aiAssistantOpen) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = aiPanelWidth;
    document.body.classList.add("resizing-ai-panel");
    const move = (moveEvent: PointerEvent) => {
      setAiPanelWidth(Math.min(520, Math.max(340, startWidth + startX - moveEvent.clientX)));
    };
    const stop = () => {
      document.body.classList.remove("resizing-ai-panel");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }, [aiAssistantOpen, aiPanelWidth]);

  const startBottomPanelResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!effectiveBottomPanelOpen) return;
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
  }, [bottomPanelHeight, effectiveBottomPanelOpen]);

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

  const closeManagementCenter = () => {
    setSettingsOpen(false);
    setManimRenderSettingsOpen(false);
    setPluginsOpen(false);
    setResourcesOpen(false);
  };
  const openApplicationSettings = (section: SettingsSection) => {
    closeManagementCenter();
    setSettingsSection(section);
    setSettingsOpen(true);
  };
  const openManimSettings = (section: ManimSettingsSection) => {
    closeManagementCenter();
    setManimSettingsSection(section);
    setManimRenderSettingsOpen(true);
  };
  const openManagementPage = (page: "plugins" | "resources") => {
    closeManagementCenter();
    if (page === "plugins") setPluginsOpen(true);
    else setResourcesOpen(true);
  };
  const renderManagementNavigation = () => <aside className="management-navigation" aria-label="管理中心导航">
    <header><span className="management-brand"><Settings size={18}/></span><span><strong>管理中心</strong><small>Visual Python</small></span></header>
    <div className="management-navigation-scroll">
      <section><h3>应用设置</h3><button className={settingsOpen && settingsSection === "appearance" ? "selected" : ""} onClick={() => openApplicationSettings("appearance")}><Settings size={16}/><span>外观与主题</span></button><button className={settingsOpen && settingsSection === "editor" ? "selected" : ""} onClick={() => openApplicationSettings("editor")}><Code2 size={16}/><span>代码编辑器</span></button><button className={settingsOpen && settingsSection === "python" ? "selected" : ""} onClick={() => openApplicationSettings("python")}><Braces size={16}/><span>Python 环境</span></button><button className={settingsOpen && settingsSection === "ai" ? "selected" : ""} onClick={() => openApplicationSettings("ai")}><Sparkles size={16}/><span>AI 模型</span></button><button className={settingsOpen && settingsSection === "behavior" ? "selected" : ""} onClick={() => openApplicationSettings("behavior")}><Power size={16}/><span>应用行为</span></button></section>
      {manimPluginActive && <section><h3>Manim</h3><button className={manimRenderSettingsOpen && manimSettingsSection === "output" ? "selected" : ""} onClick={() => openManimSettings("output")}><Film size={16}/><span>渲染与输出</span></button><button className={manimRenderSettingsOpen && manimSettingsSection === "renderer" ? "selected" : ""} onClick={() => openManimSettings("renderer")}><Play size={16}/><span>渲染器</span></button><button className={manimRenderSettingsOpen && manimSettingsSection === "voice" ? "selected" : ""} onClick={() => openManimSettings("voice")}><Volume2 size={16}/><span>配音</span></button><button className={manimRenderSettingsOpen && manimSettingsSection === "storage" ? "selected" : ""} onClick={() => openManimSettings("storage")}><FolderOpen size={16}/><span>存储</span></button></section>}
      <section><h3>管理</h3><button className={pluginsOpen ? "selected" : ""} onClick={() => openManagementPage("plugins")}><Plug size={16}/><span>插件</span></button><button className={resourcesOpen ? "selected" : ""} onClick={() => openManagementPage("resources")}><Box size={16}/><span>工程资源</span>{missingProjectResources.length > 0 && <em>{missingProjectResources.length}</em>}</button></section>
    </div>
    <footer><button onClick={closeManagementCenter}><ArrowLeft size={16}/><span>返回编辑器</span></button></footer>
  </aside>;

  return <main className="app-shell">
    <header className="topbar" data-tauri-drag-region onContextMenu={(event) => { if (!(event.target as HTMLElement).closest("input")) event.preventDefault(); }} onPointerDownCapture={prepareNativeWindowDrag} onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest("button,input")) void appWindow.toggleMaximize(); }}>
      <div className="brand" data-tauri-drag-region><span className="brand-mark" data-tauri-drag-region><Braces size={17} data-tauri-drag-region/></span><strong data-tauri-drag-region>Visual Python</strong><div className="top-menu-group" data-tauri-drag-region ref={topMenuRef}><div className="project-menu-wrap"><button className="project-menu-trigger" aria-expanded={projectMenuOpen} onClick={() => { setProjectMenuOpen((open) => !open); setExampleMenuOpen(false); setShortcutMenuOpen(false); }}>工程 <ChevronDown size={13}/></button>{projectMenuOpen && <div className="project-menu project-main-menu">
        <button onClick={newProject}><FilePlus2 size={15}/><span>新建工程</span><kbd>Ctrl+N</kbd></button>
        <button onClick={() => { setProjectMenuOpen(false); void openProject(); }}><FolderOpen size={15}/><span>打开工程</span><kbd>Ctrl+O</kbd></button>
        <button onClick={() => { setProjectMenuOpen(false); void saveProject(); }}><Save size={15}/><span>保存</span><kbd>Ctrl+S</kbd></button>
        <button onClick={() => { setProjectMenuOpen(false); void saveProjectAs(); }}><SaveAll size={15}/><span>另存为</span><kbd>Ctrl+Shift+S</kbd></button>
        <button onClick={() => { setProjectMenuOpen(false); void exportPython(); }}><Download size={15}/><span>导出 Python</span></button>
        <div className="project-menu-category recent-projects-category"><button aria-haspopup="menu"><FileCode2 size={15}/><span>最近工程</span><ChevronRight size={14}/></button><div className="project-menu project-submenu recent-projects-menu" role="menu" aria-label="最近工程">{recentProjects.length > 0 ? recentProjects.map((item) => <button className="recent-project" role="menuitem" key={item.path} title={item.path} onClick={() => { setProjectMenuOpen(false); void loadProject(item.path); }}><FileCode2 size={15}/><span><strong>{item.name}</strong><small>{item.path}</small></span></button>) : <button className="recent-project-empty" role="menuitem" disabled><FileCode2 size={15}/><span>暂无最近工程</span></button>}</div></div>
      </div>}</div><div className="project-menu-wrap"><button className="project-menu-trigger" aria-expanded={exampleMenuOpen} onClick={() => { setExampleMenuOpen((open) => !open); setProjectMenuOpen(false); setShortcutMenuOpen(false); }}>示例 <ChevronDown size={13}/></button>{exampleMenuOpen && <div className="project-menu example-menu">
        <div className="example-category"><button className="example-category-trigger"><BookOpen size={15}/><span>Python 基础</span><ChevronRight size={14}/></button><div className="project-menu example-submenu grouped-example-submenu">{pythonDifficultyOrder.map((difficulty) => <div className="example-difficulty-group" key={difficulty}><div className="example-difficulty-label">{pythonDifficultyLabels[difficulty]}</div>{pythonExampleCatalog.filter((item) => item.difficulty === difficulty).map((item) => <button key={item.id} disabled={!item.example} onClick={() => item.example && void loadExample(item.example)}><BookOpen size={15}/><span>{item.title}</span></button>)}</div>)}</div></div>
        <div className="example-category"><button className="example-category-trigger"><Film size={15}/><span>Manim</span><ChevronRight size={14}/></button><div className="project-menu example-submenu manim-example-submenu">{manimDifficultyOrder.map((difficulty) => <div className="example-difficulty-group" key={difficulty}><div className="example-difficulty-label">{manimDifficultyLabels[difficulty]}</div>{manimExampleCatalog.filter((item) => item.difficulty === difficulty).map((item) => <button key={item.id} disabled={!item.example} onClick={() => item.example && void loadExample(item.example)}><Film size={15}/><span>{item.title}</span></button>)}</div>)}</div></div>
      </div>}</div><div className="project-menu-wrap">
        <button className="project-menu-trigger" aria-expanded={shortcutMenuOpen} disabled={workspaceMode !== "code"} onClick={() => { setShortcutMenuOpen((open) => !open); setProjectMenuOpen(false); setExampleMenuOpen(false); }}>编辑 <ChevronDown size={13}/></button>
        {shortcutMenuOpen && <div className="project-menu shortcut-menu" role="menu" aria-label="编辑">
          <button role="menuitem" disabled={workspaceMode !== "code" || formattingCode} onClick={() => { setShortcutMenuOpen(false); void formatCurrentPythonCode(); }}><AlignLeft size={15}/><span>{formattingCode ? "正在格式化" : "格式化 Python 代码"}</span><kbd>Shift+Alt+F</kbd></button>
          <button role="menuitem" disabled={workspaceMode !== "code"} onClick={() => runCodeEditorAction("actions.find")}><Search size={15}/><span>查找</span><kbd>Ctrl+F</kbd></button>
          <button role="menuitem" disabled={workspaceMode !== "code"} onClick={() => runCodeEditorAction("editor.action.startFindReplaceAction")}><Replace size={15}/><span>查找并替换</span><kbd>Ctrl+H</kbd></button>
          <button role="menuitem" disabled={workspaceMode !== "code"} onClick={() => runCodeEditorAction("editor.action.gotoLine")}><ListOrdered size={15}/><span>跳转到行</span><kbd>Ctrl+G</kbd></button>
        </div>}
      </div></div></div>
      <div className="project-title" data-tauri-drag-region title={projectPath || "尚未保存"}><input value={projectNameDraft} onChange={(event) => setProjectNameDraft(projectFileBaseName(event.target.value))} onBlur={() => void commitProjectName()} onFocus={(event) => event.currentTarget.select()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } else if (event.key === "Escape") { event.preventDefault(); cancelProjectNameCommit.current = true; setProjectNameDraft(projectFileBaseName(projectName)); event.currentTarget.blur(); } }} disabled={renamingProject} aria-label="工程文件名" title={renamingProject ? "正在重命名工程" : projectPath || "尚未保存"} spellCheck={false}/>{dirty ? <span className="dirty-dot" data-tauri-drag-region title="未保存"/> : <span className="saved-dot" data-tauri-drag-region title="已保存"/>}</div>
      <div className="toolbar" data-tauri-drag-region>
        <div className="workspace-mode-switch" role="group" aria-label="工作区模式">
          <button className={workspaceMode === "visual" ? "selected" : ""} aria-pressed={workspaceMode === "visual"} aria-label="纯图形化模式" title="纯图形化" disabled={running || renderingManim} onClick={() => changeWorkspaceMode("visual")}><Blocks size={15}/></button>
          <button className={workspaceMode === "split" ? "selected" : ""} aria-pressed={workspaceMode === "split"} aria-label="图形化和代码模式" title="图形化和代码" disabled={running || renderingManim} onClick={() => changeWorkspaceMode("split")}><Columns2 size={15}/></button>
          <button className={workspaceMode === "code" ? "selected" : ""} aria-pressed={workspaceMode === "code"} aria-label="代码模式" title="代码" disabled={running || renderingManim} onClick={() => changeWorkspaceMode("code")}><Code2 size={15}/></button>
        </div>
        <div className="history-controls" role="group" aria-label="编辑历史"><button className="icon-button" title="撤销（Ctrl+Z）" disabled={running || renderingManim} onClick={() => workspaceMode === "code" ? codeEditor.current?.trigger("toolbar", "undo", null) : workspace.current?.undo(false)}><Undo2 size={16}/></button><button className="icon-button" title="重做（Ctrl+Y）" disabled={running || renderingManim} onClick={() => workspaceMode === "code" ? codeEditor.current?.trigger("toolbar", "redo", null) : workspace.current?.undo(true)}><Redo2 size={16}/></button></div>
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
    <section className={`workbench mode-${workspaceMode} ${aiAssistantOpen ? "ai-panel-open" : ""} ${effectiveBottomPanelOpen ? "" : "bottom-panel-collapsed"}`} style={{ "--right-panel-width": `${rightPanelWidth}px`, "--bottom-panel-height": `${bottomPanelHeight}px`, "--ai-panel-width": `${aiPanelWidth}px` } as CSSProperties}>
      <aside className="activity-rail" onContextMenu={(event) => event.preventDefault()}>
        <button className={`activity ${isBlockWorkspaceMode(workspaceMode) ? "active" : ""}`} title="切换到纯图形化" disabled={running || renderingManim} onClick={() => changeWorkspaceMode("visual")}><Blocks size={20}/></button>
        <button className={`activity ${aiAssistantOpen ? "active" : ""}`} title={workspaceMode === "code" ? "AI 编程助手" : "AI 编程助手仅在纯代码模式可用"} aria-label="AI 编程助手" aria-pressed={aiAssistantOpen} disabled={workspaceMode !== "code"} onClick={() => setAiAssistantOpen((open) => !open)}><Sparkles size={20}/></button>
        <div className="rail-spacer"/><button className={`activity ${settingsOpen || manimRenderSettingsOpen || pluginsOpen || resourcesOpen ? "active" : ""}`} title="设置" onClick={() => openApplicationSettings("appearance")}><Settings size={20}/></button>
      </aside>
      <section className="workspace-shell">
        <div className="workspace-content">
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
            <header><div className="block-outline-heading"><strong>积木大纲</strong><span>{blockOutline.reduce((total, node) => total + node.blockCount, 0)} 个积木</span></div><div className="block-outline-view-switch" role="tablist" aria-label="大纲显示模式"><button role="tab" aria-selected={blockOutlineMode === "structure"} className={blockOutlineMode === "structure" ? "selected" : ""} onClick={() => setBlockOutlineMode("structure")}>结构</button><button role="tab" aria-selected={blockOutlineMode === "all"} className={blockOutlineMode === "all" ? "selected" : ""} onClick={() => setBlockOutlineMode("all")}>全部</button></div></header>
            <div className="block-outline-search"><Search size={13}/><input value={blockOutlineQuery} onChange={(event) => setBlockOutlineQuery(event.target.value)} placeholder="搜索积木" aria-label="搜索画布中的积木" spellCheck={false}/>{blockOutlineQuery && <button onClick={() => setBlockOutlineQuery("")} title="清空搜索" aria-label="清空搜索"><X size={12}/></button>}</div>
            <div className="block-outline-tree">{visibleBlockOutline.length ? renderBlockOutline(visibleBlockOutline) : <div className="block-outline-empty">没有找到匹配的积木</div>}</div>
          </div>}
        </div>
        <div ref={host} className="blockly-host"/>
      </section>
      <div className="panel-resizer" onPointerDown={startRightPanelResize} role="separator" aria-label="调整辅助面板宽度" aria-orientation="vertical"/>
      <aside className="right-panel">
        <div className="panel-head"><div className="code-scene-tabs" role="tablist" aria-label="Python 场景">{workspaceMode === "code" ? sceneDocuments.map((scene) => { const aiStatus = sceneAiStatuses[scene.id]; const aiStatusLabel = aiStatus ? ({ working: "AI 正在处理", changed: "AI 已修改", error: "AI 处理出错", validated: "AI 已校验", rendered: "AI 已检查渲染" } as const)[aiStatus] : ""; return <div key={scene.id} className={`scene-tab ${scene.id === activeSceneId ? "active" : ""}`} role="tab" aria-selected={scene.id === activeSceneId}><button className="scene-tab-label" onClick={() => focusManimSceneTab(scene.id)} title={`打开场景 ${scene.name}`}><Film size={13}/><span>{scene.name}</span>{aiStatus && <i className={`scene-ai-status ${aiStatus}`} title={aiStatusLabel} aria-label={aiStatusLabel}/>}</button><button className="scene-tab-close" onClick={() => closeManimSceneTab(scene.id)} title={`删除场景 ${scene.name}`} aria-label={`删除场景 ${scene.name}`}><X size={12}/></button></div>; }) : <div className="panel-tab active"><Braces size={14}/> Python</div>}{workspaceMode === "code" && <button className="scene-tab-add" onClick={addManimSceneTab} title="新建独立 Manim 场景" aria-label="新建独立 Manim 场景"><Plus size={14}/></button>}</div><div className="panel-head-actions"><span className="read-only">{workspaceMode === "code" ? "独立场景" : "实时生成"}</span>{workspaceMode === "code" && <div className="code-outline-wrap" ref={codeOutlineRef}><button ref={codeOutlineTriggerRef} className="code-outline-trigger" disabled={!codeOutline.length} aria-label="代码结构大纲" title="代码结构大纲" aria-haspopup="menu" aria-expanded={codeOutlineOpen} onClick={() => setCodeOutlineOpen((open) => !open)}><ListTree size={15}/></button>{codeOutlineOpen && <div className="code-outline-menu" role="menu" aria-label="代码结构">{codeOutline.map((item) => <button key={`${item.kind}-${item.lineNumber}-${item.label}`} role="menuitem" onClick={() => focusCodeOutlineItem(item)} title={`第 ${item.lineNumber} 行`}><span className={`code-outline-icon outline-${item.kind}`}>{item.kind === "function" ? <Braces size={14}/> : <Box size={14}/>}</span><span className="code-outline-label"><strong>{item.label}</strong><small>{item.kind === "function" ? item.signature : `class ${item.label}`}</small></span><span className="code-outline-line">{item.lineNumber}</span></button>)}</div>}</div>}</div></div>
        <div className="editor-wrap"><Suspense fallback={<div className="editor-loading"/>}><Editor key={workspaceMode === "code" ? activeSceneId || "source" : "generated"} path={workspaceMode === "code" ? `scene-${activeSceneId || "source"}.py` : "generated.py"} keepCurrentModel language="python" value={activeCode} onChange={updateSourceCode} onMount={mountCodeEditor} theme={monacoThemes[visualThemeId]} options={{ readOnly: workspaceMode !== "code", minimap: { enabled: false }, fontFamily: editorFontFamily, fontSize: editorFontSize, lineHeight: editorFontSize + 9, tabSize: editorIndentSize, insertSpaces: true, detectIndentation: false, padding: { top: 14 }, scrollBeyondLastLine: false, automaticLayout: true, fixedOverflowWidgets: true, renderLineHighlight: workspaceMode === "code" ? "line" : "none", wordWrap: "off", quickSuggestions: { other: true, comments: false, strings: false }, suggestOnTriggerCharacters: true, acceptSuggestionOnEnter: "on", tabCompletion: "on", snippetSuggestions: "top", parameterHints: { enabled: true, cycle: false }, scrollbar: { horizontal: "auto", alwaysConsumeMouseWheel: false }, overviewRulerBorder: false }}/></Suspense></div>
      </aside>
        </div>
        <div className={`console-resizer ${!effectiveBottomPanelOpen ? "collapsed" : ""}`} onPointerDown={startBottomPanelResize} role="separator" aria-label="调整输出面板高度" aria-orientation="horizontal" aria-valuemin={160} aria-valuemax={600} aria-valuenow={bottomPanelHeight}/>
        <div ref={consolePanelRef} className={`console-panel ${effectiveBottomPanelOpen ? "" : "collapsed"}`} onContextMenu={openConsoleContextMenu}>
          <div className="console-tabs"><button className={activePanel === "output" ? "active" : ""} onClick={() => openConsolePanel("output")}><Terminal size={13}/> 输出</button><button className={activePanel === "problems" ? "active" : ""} onClick={() => openConsolePanel("problems")}>问题 <span className="count">{displayedProblems.length}</span></button><button className={activePanel === "video" ? "active" : ""} onClick={() => openConsolePanel("video")}><Film size={13}/> 视频</button><span className="console-spacer"/><button className="clear-output" onClick={clearConsole} title="清空输出" aria-label="清空输出"><Trash2 size={13}/></button><button className="panel-collapse" onClick={() => setBottomPanelOpen((open) => !open)} title={effectiveBottomPanelOpen ? "折叠输出面板" : "展开输出面板"} aria-label={effectiveBottomPanelOpen ? "折叠输出面板" : "展开输出面板"}>{effectiveBottomPanelOpen ? <PanelBottomClose size={14}/> : <PanelBottomOpen size={14}/>}</button></div>
          <div className={`console-content ${renderingManim && manimRenderProgress ? "has-manim-render-status" : ""}`}>
            {renderingManim && manimRenderProgress && <div className={`manim-render-status phase-${manimRenderProgress.phase}`} role="progressbar" aria-label={`${manimRenderProgress.scene} ${manimRenderProgress.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={manimRenderProgress.percent}>
              <div className="manim-render-status-text"><Film size={13}/><strong>{manimRenderProgress.scene}</strong><span>{manimRenderProgress.label}</span></div>
              <time>{formatRenderElapsed(manimRenderElapsed)}</time>
              <div className={`manim-render-progress-track ${manimRenderProgress.percent === undefined ? "indeterminate" : ""}`}><span style={manimRenderProgress.percent === undefined ? undefined : { width: `${manimRenderProgress.percent}%` }}/></div>
            </div>}
            {activePanel === "output" ? <div className="console-scroll"><pre>{output.map((entry) => <span key={entry.id} className={`output-${entry.stream}`}>{entry.data}</span>)}</pre></div> : activePanel === "problems" ? <div className="problem-list">{displayedProblems.length ? displayedProblems.map((problem) => { const resourceProblem = problem.kind === "resource"; const locatable = resourceProblem || Boolean(problem.blockId || (workspaceMode === "code" && problem.line > 0)); const problemTypeLabel = { context: "积木语法问题", syntax: "Python 语法问题", runtime: "运行时错误", timeout: "执行超时", environment: "Python 环境问题", plugin: "插件问题", resource: "工程资源问题" }[problem.kind]; return <div key={problem.id} data-problem-id={String(problem.id)} className={`problem-${problem.kind} ${locatable ? "problem-locatable" : ""}`} onClick={() => resourceProblem ? setResourcesOpen(true) : locatable && focusProblem(problem)} title={resourceProblem ? "点击打开工程资源" : problem.blockId ? "点击定位到积木" : locatable ? "点击定位到代码" : undefined}><span className="problem-badge" title={problemTypeLabel} aria-label={problemTypeLabel}>{{ context: <Braces size={11}/>, syntax: <Braces size={11}/>, runtime: <Terminal size={11}/>, timeout: <RefreshCw size={11}/>, environment: <Settings size={11}/>, plugin: <Plug size={11}/>, resource: <Box size={11}/> }[problem.kind]}</span><span><strong>{problem.message}</strong>{problem.suggestion && <em>{problem.suggestion}</em>}<small>{resourceProblem ? "工程资源 · 点击打开资源面板" : problem.blockId ? problem.kind === "context" ? "编辑期语法检查 · 点击定位到积木" : "已定位到相关积木" : problem.line ? `Python 第 ${problem.line} 行${workspaceMode === "code" ? " · 点击定位" : ""}` : { context: "编辑期语法检查", syntax: "语法检查", runtime: "运行时错误", timeout: "执行超时", environment: "Python 环境", plugin: "插件依赖", resource: "工程资源" }[problem.kind]}</small></span></div>; }) : <div className="no-problems">没有检测到问题。</div>}</div> : <div className="video-preview-panel">{manimVideo ? <><div className="video-preview-actions"><button onClick={() => void openSystemVideo()} title="使用本地播放器打开"><ExternalLink size={14}/></button><button onClick={() => void revealVideoInFolder()} title="打开所在文件夹"><FolderOpen size={14}/></button></div><video key={manimVideo.url} src={manimVideo.url} controls/></> : <div className="empty-video-preview"><Film size={24}/><strong>暂无渲染视频</strong><span>渲染 Manim 场景后会在这里预览。</span></div>}</div>}
            {activePanel === "output" && <div className="stdin-row"><span className="stdin-prompt">›</span><input value={stdinValue} onChange={(event) => setStdinValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void sendInput(); }} placeholder={running ? "输入内容并按 Enter" : "程序运行时可输入"} disabled={!running}/><button onClick={sendInput} disabled={!running || !stdinValue.length} title="发送输入"><Send size={14}/></button></div>}
          </div>
        </div>
      </section>
      <div className={`ai-panel-resizer ${aiAssistantOpen ? "" : "collapsed"}`} onPointerDown={startAiPanelResize} role="separator" aria-label="调整 AI 智能体宽度" aria-orientation="vertical" aria-valuemin={340} aria-valuemax={520} aria-valuenow={aiPanelWidth}/>
      <aside className={`ai-drawer ${aiAssistantOpen ? "open" : ""}`} aria-hidden={!aiAssistantOpen}>
        <AiAssistantPanel key={(aiAgentBusy ? aiAgentSceneIdRef.current : activeSceneId) || "no-scene"} conversationScope={(aiAgentBusy ? aiAgentSceneIdRef.current : activeSceneId) || "no-scene"} lineCount={sourceCode ? sourceCode.split("\n").length : 0} sceneName={sceneDocuments.find((document) => document.id === activeSceneId)?.name || "当前场景"} onOpenSettings={() => openApplicationSettings("ai")} onClose={() => setAiAssistantOpen(false)} onRunAgent={runAiCodeAgentTask} onRevealCodeChange={revealAiCodeChange} onUndoCodeChange={undoAiCodeChange} onApplyCodeChange={applyAiCodeChange} onUndoTaskChange={(change) => applyAiTaskSnapshot(change, "undo")} onApplyTaskChange={(change) => applyAiTaskSnapshot(change, "apply")}/>
      </aside>
    </section>
    <footer className="statusbar" onContextMenu={(event) => event.preventDefault()}><div className="python-environment-switcher" ref={pythonEnvironmentMenuRef}><button className="environment-status" aria-haspopup="menu" aria-expanded={pythonEnvironmentMenuOpen} disabled={running || renderingManim} onClick={() => { const next = !pythonEnvironmentMenuOpen; setPythonEnvironmentMenuOpen(next); if (next) void detectPythonEnvironments(); }}><span>{pythonEnvironment ? `Python ${pythonEnvironment.version}` : "未选择 Python"}</span></button>{pythonEnvironmentMenuOpen && <div className="python-environment-menu" role="menu" aria-label="切换 Python 解释器"><header><span><strong>Python 解释器</strong><small>{supportedPythonRangeLabel}</small></span><button className="python-environment-refresh" onClick={() => void detectPythonEnvironments()} disabled={detectingPython} title="重新检测" aria-label="重新检测 Python 解释器"><RefreshCw size={13} className={detectingPython ? "spin" : ""}/></button></header><div className="python-environment-options">{pythonEnvironments.length ? pythonEnvironments.map((environment) => { const selected = pythonEnvironment?.path.toLowerCase() === environment.path.toLowerCase(); return <button key={environment.path} className={`python-environment-option ${selected ? "selected" : ""}`} role="menuitemradio" aria-checked={selected} title={environment.path} onClick={() => selectPythonEnvironment(environment)}><span className="python-environment-option-check">{selected && <Check size={12}/>}</span><span><strong>Python {environment.version}</strong><small>{environment.implementation}{environment.virtual_env ? " · 虚拟环境" : ""}</small><code>{environment.path}</code></span></button>; }) : <div className="python-environment-empty"><Braces size={18}/><span>{detectingPython ? "正在检测 Python..." : `未检测到${supportedPythonRangeLabel}`}</span></div>}</div></div>}</div><span className="status-spacer"/>{workspaceMode === "code" && <div className="editor-status-items"><button onClick={() => runCodeEditorAction("editor.action.gotoLine")} title="跳转到行">行 {codeCursorPosition.lineNumber}，列 {codeCursorPosition.column}</button><span title="Python 缩进宽度">空格: {codeIndentSize}</span><span title="文件编码">UTF-8</span></div>}<span>{running ? "正在运行" : renderingManim ? "正在渲染" : "就绪"}</span></footer>
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
      <button role="menuitem" onClick={() => runConsoleContextAction(() => setBottomPanelOpen(false))}><PanelBottomClose size={15}/><span>折叠面板</span></button>
    </div>}
    {formulaEditorRequest && <Suspense fallback={<div className="formula-editor-backdrop"><div className="formula-editor-loading"><Braces size={22}/><span>正在准备公式编辑器...</span></div></div>}><FormulaEditorDialog request={formulaEditorRequest} onClose={() => setFormulaEditorRequest(null)}/></Suspense>}
    {manimRenderSettingsOpen && <div className="settings-backdrop management-center">{renderManagementNavigation()}<section className="settings-dialog manim-render-settings-dialog management-page" role="region" aria-label="Manim 渲染配置">
      <header><div><span className="settings-icon manim-settings-icon"><Film size={18}/></span><div><h2>Manim 渲染配置</h2><p>配置保存在当前工程中</p></div></div><button className="dialog-close" onClick={() => setManimRenderSettingsOpen(false)} title="关闭"><X size={18}/></button></header>
      <div className="manim-settings-shell"><nav className="settings-navigation manim-settings-navigation" aria-label="Manim 渲染配置分类">{([
        { id: "output", label: "输出", detail: "质量与帧率", icon: <Film size={18}/> },
        { id: "renderer", label: "渲染器", detail: "引擎与缓存", icon: <Settings size={18}/> },
        { id: "voice", label: "配音", detail: "模型与试听", icon: <Volume2 size={18}/> },
        { id: "storage", label: "存储", detail: "文件与空间", icon: <FolderOpen size={18}/> },
      ] as Array<{ id: ManimSettingsSection; label: string; detail: string; icon: ReactNode }>).map((item) => <button key={item.id} className={manimSettingsSection === item.id ? "selected" : ""} aria-current={manimSettingsSection === item.id ? "page" : undefined} onClick={() => setManimSettingsSection(item.id)}><span>{item.icon}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><ChevronRight size={16}/></button>)}</nav><div className="manim-settings-pane">
        {manimSettingsSection === "output" && <section className="manim-settings-page"><div className="manim-settings-page-header"><h3>输出</h3><p>设置视频清晰度与播放流畅度。</p></div><div className="manim-option-group"><div><strong>质量预设</strong><small>分辨率越高，渲染时间和文件体积越大</small></div><div className="manim-segmented">{([{ value: "preview", label: "预览", detail: "360p" }, { value: "low", label: "低", detail: "480p" }, { value: "medium", label: "中", detail: "720p" }, { value: "high", label: "高", detail: "1080p" }, { value: "four_k", label: "4K", detail: "2160p" }] as const).map((option) => <button key={option.value} className={manimRenderConfig.quality === option.value ? "selected" : ""} onClick={() => updateManimRenderConfig({ quality: option.value })}><strong>{option.label}</strong><small>{option.detail}</small></button>)}</div></div><div className="manim-option-group"><div><strong>帧率</strong><small>更高帧率适合快速运动和复杂动画</small></div><div className="manim-choice-row">{([15, 30, 60] as const).map((fps) => <button key={fps} className={manimRenderConfig.fps === fps ? "selected" : ""} onClick={() => updateManimRenderConfig({ fps })}>{fps} FPS</button>)}</div></div></section>}
        {manimSettingsSection === "renderer" && <section className="manim-settings-page"><div className="manim-settings-page-header"><h3>渲染器</h3><p>选择渲染引擎并控制缓存策略。</p></div><div className="manim-option-group"><div><strong>渲染引擎</strong><small>根据场景类型选择合适的渲染方式</small></div><div className="manim-renderer-options"><button className={manimRenderConfig.renderer === "cairo" ? "selected" : ""} onClick={() => updateManimRenderConfig({ renderer: "cairo" })}><strong>Cairo</strong><small>兼容性更好，适合大多数 2D 场景</small></button><button className={manimRenderConfig.renderer === "opengl" ? "selected" : ""} onClick={() => updateManimRenderConfig({ renderer: "opengl" })}><strong>OpenGL</strong><small>适合实时预览与需要 GPU 的场景</small></button></div></div><div className="manim-cache-row"><div><strong>禁用缓存</strong><small>每次渲染都重新生成全部内容，排查缓存问题时使用</small></div><button className={`plugin-toggle ${manimRenderConfig.disableCaching ? "enabled" : ""}`} role="switch" aria-checked={manimRenderConfig.disableCaching} aria-label="禁用 Manim 渲染缓存" onClick={() => updateManimRenderConfig({ disableCaching: !manimRenderConfig.disableCaching })}><span/></button></div></section>}
        {manimSettingsSection === "voice" && <section className="manim-settings-page manim-tts-section"><div className="manim-settings-page-header"><h3>视频配音</h3><p>配置文字转语音服务并试听当前旁白效果。</p></div>
          <div className="tts-fields">
            <label><span>百炼接口地址</span><input value={ttsConfig.baseUrl} onChange={(event) => updateTtsConfig({ baseUrl: event.target.value })} placeholder="https://<WorkspaceId>.cn-beijing.maas.aliyuncs.com" spellCheck={false}/><small>填写百炼工作空间域名或完整 SpeechSynthesizer 地址</small></label>
            <div className="tts-field-row"><label><span>模型</span><div className="tts-select-control"><select value={ttsConfig.model} onChange={(event) => updateTtsConfig({ model: event.target.value })} aria-label="百炼配音模型">{bailianTtsModels.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><ChevronDown size={15}/></div></label><label><span>音色</span><div className="tts-select-control"><select value={ttsConfig.voice} onChange={(event) => updateTtsConfig({ voice: event.target.value })} aria-label="百炼配音音色">{getBailianVoiceOptions(ttsConfig.model).map((option) => <option key={option.id} value={option.id}>{option.label} · {option.id}</option>)}</select><ChevronDown size={15}/></div></label></div>
            <label className="tts-api-key"><span>API Key</span><div className={ttsHasApiKey ? "has-key" : ""}><input type="password" value={ttsApiKey} onChange={(event) => setTtsApiKey(event.target.value)} placeholder="输入 API Key" autoComplete="off" spellCheck={false}/>{ttsHasApiKey && <button onClick={() => void forgetTtsApiKey()} title="删除 API Key" aria-label="删除 API Key"><Trash2 size={15}/></button>}</div></label>
            <div className="tts-field-row tts-compact-row"><label><span>语速 <output>{ttsConfig.speed.toFixed(2)}x</output></span><input type="range" min={0.5} max={2} step={0.05} value={ttsConfig.speed} onChange={(event) => updateTtsConfig({ speed: Number(event.target.value) })}/></label><label><span>音频格式</span><div className="tts-format-options"><button className={ttsConfig.audioFormat === "wav" ? "selected" : ""} onClick={() => updateTtsConfig({ audioFormat: "wav" })}>WAV</button><button className={ttsConfig.audioFormat === "mp3" ? "selected" : ""} onClick={() => updateTtsConfig({ audioFormat: "mp3" })}>MP3</button></div></label></div>
          </div>
          <div className="tts-preview"><label><span>全局试听文本 <small>使用上方默认模型、音色和语速</small></span><textarea value={ttsPreviewText} onChange={(event) => setTtsPreviewText(event.target.value)} maxLength={2000} placeholder="输入一段文字，试听默认配音效果"/></label><div className="tts-preview-footer"><button className="tts-test-button" onClick={() => void testTts()} disabled={testingTts || !ttsPreviewText.trim() || !ttsConfig.baseUrl.trim()}>{testingTts ? <RefreshCw size={16} className="spin"/> : <Play size={16}/>} {testingTts ? "正在合成" : "生成试听"}</button>{ttsPreviewUrl && <audio key={ttsPreviewUrl} src={ttsPreviewUrl} controls autoPlay/>}</div>{ttsPreviewError && <p role="alert">{ttsPreviewError}</p>}</div>
          <div className="voiceover-section-divider" role="separator"/>
          <div className="voiceover-roles">
            <div className="voiceover-roles-header"><div><strong>配音角色</strong><small>为不同人物保存独立的模型、音色和语速</small></div><div className="voiceover-role-file-actions"><button onClick={() => void importVoiceoverRoles()}><Upload size={15}/>导入</button><button onClick={() => void exportVoiceoverRoles()} disabled={!voiceoverRoles.length}><Download size={15}/>导出</button><button onClick={addVoiceoverRole} disabled={voiceoverRoles.length >= 20}><Plus size={15}/>添加角色</button></div></div>
            {voiceoverRoles.length === 0 ? <p className="voiceover-roles-empty">当前只有默认旁白。添加角色后，可在配音积木中直接选择。</p> : <div className="voiceover-role-list">{voiceoverRoles.map((role, roleIndex) =>
              <article className="voiceover-role-card" key={role.id}>
                <div className="voiceover-role-name">
                  <input value={role.name} onChange={(event) => setVoiceoverRoles((current) => current.map((item) => item.id === role.id ? { ...item, name: event.target.value } : item))} onBlur={() => persistVoiceoverRoles(voiceoverRoles)} maxLength={24} aria-label="角色名称"/>
                  <button onClick={() => moveVoiceoverRole(role.id, -1)} disabled={roleIndex === 0} title="上移角色" aria-label={`上移角色 ${role.name}`}><ChevronUp size={14}/></button>
                  <button onClick={() => moveVoiceoverRole(role.id, 1)} disabled={roleIndex === voiceoverRoles.length - 1} title="下移角色" aria-label={`下移角色 ${role.name}`}><ChevronDown size={14}/></button>
                  <button className="role-preview" onClick={() => void testVoiceoverRole(role)} disabled={testingVoiceoverRoleId !== null} title="试听角色" aria-label={`试听角色 ${role.name}`}>{testingVoiceoverRoleId === role.id ? <RefreshCw size={14} className="spin"/> : <Play size={14}/>}</button>
                  <button onClick={() => duplicateVoiceoverRole(role)} disabled={voiceoverRoles.length >= 20} title="复制角色" aria-label={`复制角色 ${role.name}`}><Copy size={14}/></button>
                  <button onClick={() => removeVoiceoverRole(role.id)} title="删除角色" aria-label={`删除角色 ${role.name}`}><Trash2 size={14}/></button>
                </div>
                <div className="voiceover-role-fields"><label><span>模型</span><select value={role.model} onChange={(event) => updateVoiceoverRole(role.id, { model: event.target.value })}>{bailianTtsModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select></label><label><span>音色</span><select value={role.voice} onChange={(event) => updateVoiceoverRole(role.id, { voice: event.target.value })}>{getBailianVoiceOptions(role.model).map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}</select></label><label><span>语速 <output>{role.speed.toFixed(2)}x</output></span><input type="range" min={0.5} max={2} step={0.05} value={role.speed} onChange={(event) => updateVoiceoverRole(role.id, { speed: Number(event.target.value) })}/></label></div>
                <label className="voiceover-role-preview-text"><span>角色试听台词</span><input value={role.previewText} onChange={(event) => setVoiceoverRoles((current) => current.map((item) => item.id === role.id ? { ...item, previewText: event.target.value } : item))} onBlur={() => persistVoiceoverRoles(voiceoverRoles)} maxLength={500} placeholder="留空时使用上方的全局试听文本"/></label>
              </article>)}</div>}
          </div>
        </section>}
        {manimSettingsSection === "storage" && <section className="manim-settings-page manim-storage-section">
          <div className="manim-settings-page-header"><h3>渲染存储</h3><p>查看当前工程产生的渲染文件与占用空间。</p></div>
          <div className="manim-storage-summary"><div><small>渲染占用</small><strong>{loadingManimStorage ? "正在计算..." : formatStorageSize(manimStorageInfo?.sizeBytes || 0)}</strong></div><div><small>渲染记录</small><strong>{manimStorageInfo?.renderCount || 0} 次</strong></div><div><small>配音缓存</small><strong>{loadingManimStorage ? "正在计算..." : formatStorageSize(ttsCacheInfo?.sizeBytes || 0)}</strong><em>{ttsCacheInfo?.clipCount || 0} 个片段</em></div></div>
          <label className="manim-output-name"><span>输出文件名</span><input value={manimRenderConfig.outputFileName} onChange={(event) => updateManimRenderConfig({ outputFileName: event.target.value })} placeholder="留空后自动命名" maxLength={160} spellCheck={false}/><small>留空时使用“工程名-场景名-日期时间”；同名文件会自动添加编号。</small><code title={manimOutputFilenamePreview}>{manimOutputFilenamePreview}</code></label>
          <div className="manim-storage-location"><span>存储位置</span><code title={manimStorageInfo?.path}>{manimStorageInfo?.path || "正在读取渲染目录..."}</code><small>此位置仅影响后续渲染，不会迁移已有文件。</small></div>
          <div className="manim-storage-actions"><button onClick={() => void chooseManimStorageFolder()} disabled={loadingManimStorage || renderingManim}><FolderOpen size={16}/>更改位置</button><button onClick={() => void openManimRenderFolder()} disabled={loadingManimStorage}><ExternalLink size={16}/>打开目录</button>{manimStoragePath && <button onClick={resetManimStorageFolder} disabled={loadingManimStorage || renderingManim}><Undo2 size={16}/>恢复默认</button>}<button className="danger" onClick={() => void clearManimRenderFiles()} disabled={loadingManimStorage || clearingManimStorage || renderingManim}><Trash2 size={16}/>{clearingManimStorage ? "正在清理..." : "清理渲染文件"}</button></div>
          <div className="manim-storage-location tts-storage-location"><span>配音缓存位置</span><code title={ttsCacheInfo?.path}>{ttsCacheInfo?.path || "正在读取配音缓存目录..."}</code><small>更改位置只影响之后生成的配音，不会迁移或删除原目录中的缓存。</small></div>
          <div className="manim-storage-actions"><button onClick={() => void chooseTtsStorageFolder()} disabled={loadingManimStorage || renderingManim}><FolderOpen size={16}/>更改位置</button><button onClick={() => void openTtsCacheFolder()} disabled={loadingManimStorage}><ExternalLink size={16}/>打开目录</button>{ttsStoragePath && <button onClick={resetTtsStorageFolder} disabled={loadingManimStorage || renderingManim}><Undo2 size={16}/>恢复默认</button>}<button className="cache-danger" onClick={() => void clearTtsCache()} disabled={loadingManimStorage || clearingTtsCache || renderingManim}><Trash2 size={16}/>{clearingTtsCache ? "正在清理..." : "清理配音缓存"}</button></div>
        </section>}
      </div></div>
    </section></div>}
    {projectReplacementPromptOpen && <div className="settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingBeforeProjectReplacement) finishProjectReplacementPrompt(false); }}><section className="settings-dialog project-replacement-dialog" role="dialog" aria-modal="true" aria-label="未保存的修改">
      <header><div><span className="settings-icon"><Save size={18}/></span><div><h2>保存当前工程？</h2><p>当前工程包含尚未保存的修改</p></div></div><button className="dialog-close" onClick={() => finishProjectReplacementPrompt(false)} disabled={savingBeforeProjectReplacement} title="取消"><X size={18}/></button></header>
      <div className="project-replacement-content"><p>继续操作前，你希望如何处理当前修改？</p><div className="project-replacement-actions"><button className="save-current" onClick={() => void saveBeforeProjectReplacement()} disabled={savingBeforeProjectReplacement}><Save size={17}/><span><strong>{savingBeforeProjectReplacement ? "正在保存..." : "保存并继续"}</strong><small>保存当前工程后继续操作</small></span></button><button className="discard-current" onClick={() => finishProjectReplacementPrompt(true)} disabled={savingBeforeProjectReplacement}><Trash2 size={17}/><span><strong>放弃修改</strong><small>不保存当前修改并继续</small></span></button><button onClick={() => finishProjectReplacementPrompt(false)} disabled={savingBeforeProjectReplacement}><X size={17}/><span><strong>取消</strong><small>返回当前工程</small></span></button></div></div>
    </section></div>}
    {closePromptOpen && <div className="settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setClosePromptOpen(false); }}><section className="settings-dialog close-choice-dialog" role="dialog" aria-modal="true" aria-label="关闭 Visual Python">
      <header><div><span className="settings-icon close-choice-icon"><Power size={18}/></span><div><h2>关闭 Visual Python</h2><p>选择关闭按钮的行为</p></div></div><button className="dialog-close" onClick={() => setClosePromptOpen(false)} title="取消"><X size={18}/></button></header>
      <div className="close-choice-content"><p>你希望 Visual Python 接下来如何运行？</p><div className="close-choice-options"><button className="close-choice-option tray-choice" onClick={() => void minimizeToTray(rememberCloseChoice)}><span className="close-option-icon"><Minimize2 size={20}/></span><span><strong>最小化到托盘</strong><small>应用继续在后台运行，可从系统托盘重新打开</small></span><ChevronRight size={18}/></button><button className="close-choice-option exit-choice" onClick={() => void quitApplication(rememberCloseChoice)}><span className="close-option-icon"><Power size={20}/></span><span><strong>退出应用</strong><small>完全结束应用以及当前正在运行的后台任务</small></span><ChevronRight size={18}/></button></div><label><input type="checkbox" checked={rememberCloseChoice} onChange={(event) => setRememberCloseChoice(event.target.checked)}/>记住我的选择，下次不再询问</label></div>
      <footer className="close-choice-actions"><button onClick={() => setClosePromptOpen(false)}>取消</button></footer>
    </section></div>}
    {settingsOpen && <div className="settings-backdrop management-center">{renderManagementNavigation()}<section className="settings-dialog app-settings-dialog management-page" role="region" aria-label="应用设置">
      <header><div><span className="settings-icon"><Settings size={18}/></span><div><h2>设置</h2><p>配置 Visual Python 的工作方式</p></div></div><button className="dialog-close" onClick={() => setSettingsOpen(false)} title="关闭"><X size={18}/></button></header>
      <div className="settings-shell"><nav className="settings-navigation" aria-label="设置分类">{([
        { id: "appearance", label: "外观", detail: "主题与界面", icon: <Columns2 size={18}/> },
        { id: "editor", label: "代码编辑", detail: "字号与格式化", icon: <Code2 size={18}/> },
        { id: "python", label: "Python 环境", detail: "解释器选择", icon: <Braces size={18}/> },
        { id: "ai", label: "AI 模型", detail: "接口与模型", icon: <Sparkles size={18}/> },
        { id: "behavior", label: "应用行为", detail: "关闭方式", icon: <Power size={18}/> },
      ] as Array<{ id: SettingsSection; label: string; detail: string; icon: ReactNode }>).map((item) => <button key={item.id} className={settingsSection === item.id ? "selected" : ""} aria-current={settingsSection === item.id ? "page" : undefined} onClick={() => setSettingsSection(item.id)}><span>{item.icon}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><ChevronRight size={16}/></button>)}</nav><div className="settings-pane">
      {settingsSection === "appearance" && <section className="theme-section"><div className="settings-pane-header"><h3>外观</h3><p>选择适合当前工作环境的界面主题。</p></div><div className="theme-picker">{themeOptions.map((theme) => <button key={theme.id} className={visualThemeId === theme.id ? "selected" : ""} onClick={() => setVisualThemeId(theme.id)}><span className={`theme-swatch swatch-${theme.id}`}/><span><strong>{theme.label}</strong><small>{theme.description}</small></span>{visualThemeId === theme.id && <Check size={16}/>}</button>)}</div></section>}
      {settingsSection === "editor" && <section className="code-preferences-section"><div className="settings-pane-header"><h3>代码编辑</h3><p>调整纯代码模式的阅读、缩进和保存体验。</p></div><div className="code-preferences-grid">
        <div className="code-preference-row"><div><strong>代码字体</strong><small>选择 Python 代码编辑区使用的等宽字体</small></div><label className="editor-font-family-control"><select value={editorFontId} onChange={(event) => applyEditorFont(event.currentTarget.value)} aria-label="代码字体" style={{ fontFamily: editorFontFamily }}>{editorFontOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><ChevronDown size={15}/></label></div>
        <div className="code-preference-row"><div><strong>编辑器字号</strong><small id="editor-font-size-help">只影响 Python 代码编辑区，可设置 {editorFontSizeMin}–{editorFontSizeMax} px</small></div><div className="editor-font-size-control" role="group" aria-label="编辑器字号"><button onClick={() => applyEditorFontSize(editorFontSize - 1)} disabled={editorFontSize <= editorFontSizeMin} title="减小字号" aria-label="减小字号"><Minus size={15}/></button><label><input type="text" inputMode="numeric" value={editorFontSizeDraft} role="spinbutton" aria-valuemin={editorFontSizeMin} aria-valuemax={editorFontSizeMax} aria-valuenow={editorFontSize} aria-describedby="editor-font-size-help" onChange={(event) => { const value = event.currentTarget.value.replace(/\D/g, "").slice(0, 3); setEditorFontSizeDraft(value); const parsed = Number(value); if (value && parsed >= editorFontSizeMin && parsed <= editorFontSizeMax) applyEditorFontSize(parsed); }} onBlur={() => applyEditorFontSize(editorFontSizeDraft)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); else if (event.key === "ArrowUp") { event.preventDefault(); applyEditorFontSize(editorFontSize + 1); } else if (event.key === "ArrowDown") { event.preventDefault(); applyEditorFontSize(editorFontSize - 1); } }}/><span>px</span></label><button onClick={() => applyEditorFontSize(editorFontSize + 1)} disabled={editorFontSize >= editorFontSizeMax} title="增大字号" aria-label="增大字号"><Plus size={15}/></button></div></div>
        <div className="code-preference-row"><div><strong>缩进宽度</strong><small>始终使用空格进行 Python 缩进</small></div><div className="code-preference-segmented" role="group" aria-label="Python 缩进宽度">{editorIndentSizes.map((size) => <button key={size} className={editorIndentSize === size ? "selected" : ""} aria-pressed={editorIndentSize === size} onClick={() => applyEditorIndentSize(size)}>{size}</button>)}</div></div>
        <div className="code-preference-row"><div><strong>保存时自动格式化</strong><small>使用 Ruff 整理源码后再保存工程</small></div><button className={`plugin-toggle ${autoFormatOnSave ? "enabled" : ""}`} role="switch" aria-checked={autoFormatOnSave} aria-label="保存时自动格式化 Python" onClick={() => setAutoFormatOnSave((enabled) => !enabled)}><span/></button></div>
      </div></section>}
      {settingsSection === "ai" && <AiModelSettings/>}
      {settingsSection === "behavior" && <section className="close-behavior-section"><div className="settings-pane-header"><h3>应用行为</h3><p>设置点击窗口关闭按钮时执行的操作。</p></div><div className="close-behavior-options"><button className={closeBehavior === "ask" ? "selected" : ""} onClick={() => updateCloseBehavior("ask")}><strong>每次询问</strong><small>关闭时显示选择界面</small></button><button className={closeBehavior === "tray" ? "selected" : ""} onClick={() => updateCloseBehavior("tray")}><strong>最小化到托盘</strong><small>应用继续在后台运行</small></button><button className={closeBehavior === "exit" ? "selected" : ""} onClick={() => updateCloseBehavior("exit")}><strong>退出应用</strong><small>完全结束 Visual Python</small></button></div></section>}
      {settingsSection === "python" && <section className="python-settings-section">
        <div className="python-settings-header"><div className="settings-pane-header"><h3>Python 环境</h3><p>选择运行当前工程使用的解释器，仅显示 {supportedPythonRangeLabel}。</p></div><div className="settings-actions"><button onClick={() => void detectPythonEnvironments()} disabled={detectingPython}><RefreshCw size={15} className={detectingPython ? "spin" : ""}/>{detectingPython ? "检测中" : "重新检测"}</button><button onClick={() => void choosePythonExecutable()}><FolderOpen size={15}/>选择解释器</button></div></div>
        <div className="environment-list">{pythonEnvironments.length ? pythonEnvironments.map((environment) => {
          const selected = pythonEnvironment?.path.toLowerCase() === environment.path.toLowerCase();
          return <button key={environment.path} className={`environment-item ${selected ? "selected" : ""}`} onClick={() => selectPythonEnvironment(environment)}><span className="environment-check">{selected && <Check size={15}/>}</span><span className="environment-info"><strong>Python {environment.version}</strong><span>{environment.implementation}{environment.virtual_env ? " · 虚拟环境" : " · 系统环境"}</span><code>{environment.path}</code></span></button>;
        }) : <div className="empty-environments"><Braces size={24}/><strong>未检测到支持的 Python</strong><span>请安装 {supportedPythonRangeLabel}，或手动选择 python.exe</span></div>}</div>
      </section>}
      </div></div>
    </section></div>}
    {resourcesOpen && <div className={`settings-backdrop management-center ${resourceDragging ? "resource-dragging" : ""}`}>{renderManagementNavigation()}<section className="settings-dialog resource-manager-dialog management-page" role="region" aria-label="工程资源">
      <header><div><span className="settings-icon resource-manager-icon"><Box size={18}/></span><div><h2>工程资源</h2><p>{projectPath ? `${projectResources.length} 个资源随工程保存` : "保存工程后可以导入资源"}</p></div></div><div className="resource-header-actions"><button className="resource-clean" onClick={() => void cleanUnusedProjectResources()} disabled={!unusedProjectResources.length} title={unusedProjectResources.length ? `清理 ${unusedProjectResources.length} 个未使用资源` : "没有可清理的资源"}><Trash2 size={14}/>清理未使用</button><button className="resource-import" onClick={() => void importAudioFromResourcePanel()}><Plus size={14}/>添加音频</button><button className="dialog-close" onClick={() => setResourcesOpen(false)} title="关闭"><X size={18}/></button></div></header>
      <div className="resource-manager-content">{projectResources.length ? <><div className="resource-browser-tools"><label className="resource-search"><Search size={14}/><input value={projectResourceQuery} onChange={(event) => setProjectResourceQuery(event.currentTarget.value)} placeholder="搜索资源名称" aria-label="搜索工程资源" spellCheck={false}/>{projectResourceQuery && <button onClick={() => setProjectResourceQuery("")} title="清空搜索"><X size={12}/></button>}</label><div className="resource-filters" role="group" aria-label="筛选工程资源">{(["all", "used", "unused", "missing"] as const).map((filter) => <button key={filter} className={projectResourceFilter === filter ? "selected" : ""} onClick={() => setProjectResourceFilter(filter)}>{({ all: "全部", used: "正在使用", unused: "未使用", missing: "缺失" } as const)[filter]}<span>{projectResourceFilterCounts[filter]}</span></button>)}</div></div>{visibleProjectResources.length ? <div className="resource-list">{visibleProjectResources.map((resource) => {
        const usageCount = projectResourceUsage.get(resource.id) ?? 0;
        const missing = projectResourceStatus[resource.path]?.exists === false;
        const actualSize = projectResourceStatus[resource.path]?.size ?? resource.size;
        return <article className={`resource-item ${missing ? "resource-missing" : ""}`} key={resource.id} draggable={isBlockWorkspaceMode(workspaceMode) && !missing} onDragStart={(event) => { event.dataTransfer.setData("application/x-visual-python-resource", resource.id); event.dataTransfer.effectAllowed = "copy"; setResourceDragging(true); }} onDragEnd={() => { setResourceDragging(false); setResourcesOpen(false); }} title={missing ? "资源文件缺失，请重新选择文件修复" : isBlockWorkspaceMode(workspaceMode) ? "拖到画布可创建播放音频积木" : undefined}><span className="resource-type-icon"><Volume2 size={18}/></span><div className="resource-info"><div><strong title={resource.originalName}>{resource.originalName}</strong>{missing ? <span className="resource-usage missing">文件缺失</span> : <span className={`resource-usage ${usageCount ? "used" : "unused"}`}>{usageCount ? `${usageCount} 处使用` : "未使用"}</span>}</div><span>{missing ? "无法找到磁盘文件" : `${formatResourceSize(actualSize)} · 音频`}</span><code title={resource.path}>{resource.path}</code></div><div className="resource-actions"><button onClick={() => void previewProjectResource(resource)} title={resourcePreviewId === resource.id ? "停止试听" : "试听"} disabled={missing}>{resourcePreviewId === resource.id ? <Square size={14}/> : <Play size={14}/>}</button><button className={missing ? "repair" : ""} onClick={() => void replaceProjectResource(resource)} title={missing ? "重新选择文件修复" : "替换文件"}><Replace size={14}/></button><button onClick={() => void revealProjectResource(resource)} title="打开所在文件夹" disabled={missing}><FolderOpen size={14}/></button><button className="danger" onClick={() => void deleteProjectResource(resource)} title={usageCount ? "资源正在使用，不能删除" : "删除资源"} disabled={usageCount > 0}><Trash2 size={14}/></button></div></article>;
      })}</div> : <div className="empty-resources filtered"><Search size={28}/><strong>没有匹配的资源</strong><span>调整搜索内容或切换筛选条件。</span></div>}</> : <div className="empty-resources"><Box size={30}/><strong>还没有工程资源</strong><span>{projectPath ? "在本地音频积木上点击右键，选择音频文件后会自动加入这里。" : "请先保存工程，然后通过本地音频积木导入文件。"}</span></div>}</div>
    </section></div>}
    {pluginsOpen && <div className="settings-backdrop management-center">{renderManagementNavigation()}<section className="settings-dialog plugin-manager-dialog management-page" role="region" aria-label="插件管理">
      <header><div><span className="settings-icon"><Plug size={18}/></span><div><h2>插件</h2><p>管理 Visual Python 的功能扩展</p></div></div><button className="dialog-close" onClick={() => setPluginsOpen(false)} title="关闭"><X size={18}/></button></header>
      <div className="settings-content">
      <section className="plugin-settings-section"><div className="plugin-settings-heading"><div><span className="settings-label">插件列表</span></div><div className="plugin-heading-actions"><span>{pluginRecords.filter((record) => record.state === "active").length} / {pluginRecords.length} 已启用</span><label className="plugin-mirror-toggle"><input type="checkbox" checked={usePipMirror} onChange={(event) => setUsePipMirror(event.target.checked)}/>使用国内镜像</label>{allMissingPythonPackages.length || installingPackages ? <button className={`plugin-install-all-deps ${installingPackages ? "stopping" : ""}`} onClick={() => installingPackages ? void stopPackageInstall() : void installMissingPythonPackages(allMissingPythonPackages)} disabled={checkingPackages}>{installingPackages ? "停止安装" : "安装全部缺失依赖"}</button> : null}<button onClick={() => void installExternalPluginZip()} disabled={discoveringPlugins}><FolderOpen size={13}/>安装插件</button></div></div><div className="plugin-card-grid">{pluginRecords.map((record) => {
        const manifest = record.plugin.manifest;
        const enabled = record.state === "active" || record.state === "loading";
        const corePlugin = isCorePlugin(manifest.id);
        const externalDiscovery = manifest.builtin ? undefined : externalPlugins.find((entry) => entry.manifest?.id === manifest.id);
        const pluginError = record.error || externalPluginErrors[manifest.id];
        return <article className={`plugin-card plugin-${record.state} ${corePlugin ? "plugin-core" : ""}`} key={manifest.id}>{externalDiscovery && <button className="plugin-delete" title="删除插件" disabled={record.state === "loading"} onClick={() => void deleteExternalPlugin(externalDiscovery)}><X size={12}/></button>}<div className="plugin-card-head"><span className="plugin-card-icon"><Blocks size={22}/></span>{!corePlugin && <button className={`plugin-toggle ${enabled ? "enabled" : ""}`} role="switch" aria-checked={enabled} aria-label={`${enabled ? "停用" : "启用"}${manifest.name}`} disabled={record.state === "loading"} onClick={() => void togglePlugin(record)}><span/></button>}</div><div className="plugin-card-body"><div><strong>{manifest.name}</strong><span className="plugin-tag">{manifest.builtin ? "内置" : "外部"}</span><span className={`plugin-state state-${record.state}`}>{pluginStateLabels[record.state]}</span></div><p>{manifest.description || "暂无描述"}</p>{renderPluginPackageStatus(manifest.python?.packages)}</div><div className="plugin-card-footer"><small>v{manifest.version} · API {manifest.apiVersion}{manifest.entry ? ` · ${manifest.entry}` : ""}</small></div>{pluginError && <code>{pluginError}</code>}</article>;
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
