import type { listen as listenFunction } from "@tauri-apps/api/event";
import type { editor as MonacoEditor } from "monaco-editor";
import { addPythonImport, insertPythonStatements, replacePythonFunctionBody, type PythonStructure } from "../pythonStructuredEdits";
import { parsePythonSyntaxDiagnostic, type PythonCodeDiagnostic } from "../pythonSyntaxDiagnostics";
import { createCodeDocument, renameCodeDocument, type CodeDocument } from "../sceneDocuments";
import { projectResourceReference, resolveProjectResourceReference, type ProjectResource } from "../projectResources";
import { applyExactCodeEdits, createCodeChangePreview } from "./codeChanges";
import { missingPluginDraftError, pluginAuthoringContract, pluginDraftSummary, validatePluginDraft, type PluginDraft, type PluginDraftFiles, type PluginDraftStore, type PluginPlanBlock, type PluginRuntimeValidation } from "./pluginAuthoring";
import { readPluginGuide } from "./pluginGuide";
import { parsePluginPlanOperations, pluginIrSummary, PluginIrError } from "./pluginIr";
import type { AgentCapability, AgentHost, AiCodeEdit } from "./types";

type Ref<T> = { current: T };
type StateSetter<T> = (value: T | ((current: T) => T)) => void;
type Invoke = <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;
type OutputEntry = { stream: "stdout" | "stderr" | "system" | "input"; data: string };
type ProblemKind = "context" | "syntax" | "runtime" | "timeout" | "environment" | "plugin" | "resource";
type CodeProblem = { id: number | string; kind: ProblemKind; line: number; message: string; blockId?: string; suggestion?: string };
type PythonEnvironment = { path: string; version: string };
type PythonPackageStatus = { name: string; installed: boolean };
type PackageInstallFinishedEvent = { success: boolean; stopped: boolean; error?: string | null; packages: string[] };
type ProjectResourceStatus = { path: string; exists: boolean; size: number };
type InstalledPluginSummary = { id: string; name: string; version: string; active: boolean; valid?: boolean; errors?: string[] };
type CodeEditor = MonacoEditor.IStandaloneCodeEditor;

/** 「运行」的结果。MicroPython 工作台不是本机进程，所以要把“是否真的跑起来了”明确回传。 */
export type HostRunResult = {
  started: boolean;
  target?: "host" | "device";
  /** 设备运行的编号，便于在设备日志里对号入座。 */
  runId?: number;
  message?: string;
};

/** 设备（开发板）上的执行状态，供 AI 工具轮询与停止使用。 */
export type HostDeviceExecutionState = {
  deviceRunning: boolean;
  devicePhase: string;
  devicePort: string | null;
  deviceConnected: boolean;
};

export type HostWorkbenchContext = {
  id: string;
  label: string;
  kind: "python" | "micropython";
  boardId?: string;
};

export type VisualPythonHostServices = {
  workspaceModeRef: Ref<string>;
  documentsRef: Ref<CodeDocument[]>;
  activeDocumentIdRef: Ref<string>;
  sourceCodeRef: Ref<string>;
  projectPathRef: Ref<string | null>;
  projectResourcesRef: Ref<ProjectResource[]>;
  taskId: Ref<number | null>;
  runningRef: Ref<boolean>;
  pythonRunStartedAt: Ref<number>;
  pythonRunElapsed: Ref<number>;
  outputRef: Ref<OutputEntry[]>;
  problemsRef: Ref<CodeProblem[]>;
  codeEditor: Ref<CodeEditor | null>;
  aiCodePreviewing: Ref<boolean>;
  codeValidationVersion: Ref<number>;
  projectName: string;
  pythonEnvironment: PythonEnvironment | null;
  usePipMirror: boolean;
  pipMirrorUrl: string;
  getProjectDirty: () => boolean;
  setProjectDirty: (dirty: boolean) => void;
  setDocuments: (documents: CodeDocument[]) => void;
  setActiveDocumentId: (documentId: string) => void;
  setSourceCode: (code: string) => void;
  setSourceCodeInitialized: (initialized: boolean) => void;
  setDirty: (dirty: boolean) => void;
  setProblems: StateSetter<CodeProblem[]>;
  setCodeSyntaxDiagnostic: (diagnostic: PythonCodeDiagnostic | null) => void;
  setCodeRuntimeDiagnostic: (diagnostic: null) => void;
  setActivePanel: (panel: "problems") => void;
  setInstallingPackages: (installing: boolean) => void;
  switchDocumentConsoleState: (fromDocumentId: string, toDocumentId: string) => void;
  formatCurrentPythonCode: (announce?: boolean) => Promise<string | null>;
  runCode: () => Promise<HostRunResult | void>;
  stopCode: () => Promise<void>;
  /** 当前界面不是硬件工作台时返回 undefined，AI 工具结果里就不会出现设备字段。 */
  getDeviceExecutionState?: () => HostDeviceExecutionState | undefined;
  stopDeviceExecution?: () => Promise<void>;
  stopPluginExecutions?: () => Promise<void>;
  getPluginExecutionState?: () => Record<string, unknown>;
  getWorkbench?: () => HostWorkbenchContext;
  writeProject: (path: string, sourceOverride?: string) => Promise<boolean>;
  saveProject: () => Promise<boolean>;
  invoke: Invoke;
  listen: typeof listenFunction;
  pluginDraftStore?: PluginDraftStore;
  listInstalledPlugins?: () => Promise<InstalledPluginSummary[]>;
  readInstalledPluginFiles?: (pluginId: string) => Promise<{ files: PluginDraftFiles; skipped?: string[] }>;
  runPluginDraftChecks?: (draft: PluginDraft, signal: AbortSignal) => Promise<PluginRuntimeValidation>;
  installPluginDraft?: (draft: PluginDraft, signal: AbortSignal) => Promise<Record<string, unknown>>;
  assertActive: (signal: AbortSignal) => void;
  agentCapabilities?: AgentCapability[];
  getAgentCapabilities?: () => AgentCapability[];
};

const checkedString = (args: Record<string, unknown>, key: string, allowEmpty = false) => {
  const value = args[key];
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new Error(`参数 ${key} 必须是${allowEmpty ? "" : "非空"}字符串`);
  return value;
};

const toolSummary = (args: Record<string, unknown>, fallback: string) => typeof args.summary === "string" && args.summary.trim() ? args.summary.trim() : fallback;

const checkedDraftFiles = (args: Record<string, unknown>): PluginDraftFiles => {
  const value = args.files;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("files 必须是文件路径到文本内容的对象");
  const files: PluginDraftFiles = {};
  for (const [path, content] of Object.entries(value as Record<string, unknown>)) {
    if (typeof content !== "string") throw new Error(`文件内容必须是文本：${path}`);
    files[path] = content;
  }
  return files;
};

const waitWithSignal = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) return reject(new Error("已停止生成"));
  const timer = window.setTimeout(finish, milliseconds);
  function finish() { signal.removeEventListener("abort", cancel); resolve(); }
  function cancel() { window.clearTimeout(timer); signal.removeEventListener("abort", cancel); reject(new Error("已停止生成")); }
  signal.addEventListener("abort", cancel, { once: true });
});

export function previewStreamingEditorCode(services: VisualPythonHostServices, nextCode: string) {
  if (services.workspaceModeRef.current !== "code") return;
  services.aiCodePreviewing.current = true;
  const editor = services.codeEditor.current;
  const model = editor?.getModel();
  if (editor && model && model.getValue() !== nextCode) {
    editor.executeEdits("ai-code-stream", [{ range: model.getFullModelRange(), text: nextCode, forceMoveMarkers: true }]);
    editor.revealLineInCenterIfOutsideViewport(model.getLineCount());
  }
  services.sourceCodeRef.current = nextCode;
  services.setSourceCode(nextCode);
  services.setSourceCodeInitialized(true);
}

export function createVisualPythonToolExecutor(services: VisualPythonHostServices): AgentHost["executeTool"] {
  const writeEditorCode = (nextCode: string, origin = "ai-code-agent") => {
    const editor = services.codeEditor.current;
    const model = editor?.getModel();
    if (editor && model && model.getValue() !== nextCode) {
      editor.executeEdits(origin, [{ range: model.getFullModelRange(), text: nextCode, forceMoveMarkers: true }]);
      if (origin === "ai-code-stream") editor.revealLineInCenterIfOutsideViewport(model.getLineCount());
    }
    services.sourceCodeRef.current = nextCode;
    services.setSourceCode(nextCode);
    services.setSourceCodeInitialized(true);
  };

  const markDirty = () => {
    services.setProjectDirty(true);
    services.setDirty(true);
  };

  const commitCode = (nextCode: string, signal: AbortSignal) => {
    services.assertActive(signal);
    const previousCode = services.sourceCodeRef.current;
    const editor = services.codeEditor.current;
    if (editor?.getValue() !== nextCode) editor?.pushUndoStop();
    services.aiCodePreviewing.current = false;
    writeEditorCode(nextCode, "ai-code-agent");
    editor?.pushUndoStop();
    services.codeValidationVersion.current += 1;
    services.setCodeSyntaxDiagnostic(null);
    services.setCodeRuntimeDiagnostic(null);
    services.setProblems((items) => items.filter((problem) => !["syntax", "runtime", "timeout"].includes(problem.kind)));
    markDirty();
    const document = services.documentsRef.current.find((item) => item.id === services.activeDocumentIdRef.current);
    return {
      changed: previousCode !== nextCode,
      diff: createCodeChangePreview(previousCode, nextCode),
      lineCount: nextCode ? nextCode.split("\n").length : 0,
      __codeChange: previousCode !== nextCode ? { before: previousCode, after: nextCode, documentId: services.activeDocumentIdRef.current, documentName: document?.name } : undefined,
    };
  };

  const validateCandidateCode = async (candidateCode: string) => {
    try { await services.invoke("validate_python_code", { code: candidateCode, pythonPath: services.pythonEnvironment?.path || null }); }
    catch (error) { throw new Error(`候选代码存在语法或缩进错误，未应用到编辑器：${String(error)}`); }
  };
  const getAgentCapabilities = () => services.getAgentCapabilities?.() ?? services.agentCapabilities ?? [];
  const pluginValidationContext = () => ({
    availableCapabilities: getAgentCapabilities().map((capability) => ({ id: capability.id, ...capability.codegen })),
  });

  return async (name, args, signal) => {
    if (signal.aborted) throw new Error("已停止生成");
    if (["inspect_plugin_api", "read_plugin_guide", "create_plugin_plan", "list_installed_plugins", "import_installed_plugin_draft", "read_plugin_draft", "read_plugin_draft_file", "apply_plugin_plan", "create_plugin_draft", "update_plugin_draft", "edit_plugin_draft_file", "validate_plugin_draft", "run_plugin_draft_checks", "install_plugin_draft"].includes(name)) {
      if (name === "inspect_plugin_api") return { contract: pluginAuthoringContract };
      if (name === "read_plugin_guide") {
        return readPluginGuide({
          ...(typeof args.section === "string" ? { section: args.section } : {}),
          ...(typeof args.offset === "number" ? { offset: args.offset } : {}),
          ...(typeof args.maxChars === "number" ? { maxChars: args.maxChars } : {}),
        });
      }
      const store = services.pluginDraftStore;
      if (!store) throw new Error("插件草稿服务尚未就绪");
      if (name === "create_plugin_plan") {
        const plan = store.createPlan({
          id: checkedString(args, "id"),
          name: checkedString(args, "name"),
          description: checkedString(args, "description"),
          ...(args.kind === "extension" ? { kind: "extension" as const } : {}),
          ...(typeof args.provider === "string" && args.provider.trim() ? { provider: args.provider.trim() } : {}),
          ...(Array.isArray(args.runtimeNames) ? { runtimeNames: args.runtimeNames.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) } : {}),
          ...(Array.isArray(args.files) ? { files: args.files.filter((item): item is { path: string; purpose: string } => Boolean(item && typeof item === "object" && typeof (item as Record<string, unknown>).path === "string" && typeof (item as Record<string, unknown>).purpose === "string")) } : {}),
          ...(Array.isArray(args.blocks) ? { blocks: args.blocks as PluginPlanBlock[] } : {}),
          ...(Array.isArray(args.dependencies) ? { dependencies: args.dependencies.filter((item): item is string => typeof item === "string") } : {}),
        });
        return { planned: true, ...plan };
      }
      if (name === "list_installed_plugins") {
        if (!services.listInstalledPlugins) throw new Error("已安装插件查询服务尚未就绪");
        return { plugins: await services.listInstalledPlugins() };
      }
      if (name === "import_installed_plugin_draft") {
        if (!services.readInstalledPluginFiles) throw new Error("已安装插件读取服务尚未就绪");
        const pluginId = checkedString(args, "pluginId");
        const { files, skipped } = await services.readInstalledPluginFiles(pluginId);
        const imported = store.createFromFiles(files, { skippedFiles: skipped });
        const summary = pluginDraftSummary(imported, pluginValidationContext());
        if (summary.validation.manifest?.id !== pluginId) throw new Error(`插件文件 ID 与请求不一致：${pluginId}`);
        return { imported: true, pluginId, ...summary };
      }
      if (name === "create_plugin_draft") {
        const draft = store.create({
          id: checkedString(args, "id"),
          name: checkedString(args, "name"),
          description: checkedString(args, "description"),
          ...(typeof args.version === "string" && args.version.trim() ? { version: args.version.trim() } : {}),
          ...(typeof args.planId === "string" && args.planId.trim() ? { planId: args.planId.trim() } : {}),
          ...(args.files !== undefined ? { files: checkedDraftFiles(args) } : {}),
        });
        return { created: true, ...pluginDraftSummary(draft, pluginValidationContext()), files: draft.files };
      }
      const draftId = checkedString(args, "draftId");
      const draft = store.get(draftId);
      if (!draft) throw missingPluginDraftError(draftId, store.listIds());
      if (name === "read_plugin_draft") {
        if (!draft.ir) {
          return { draftId, mode: draft.mode, ir: null, files: Object.keys(draft.files), message: "该草稿是文件模式（导入的插件）：请用 read_plugin_draft_file 读取文件原文，或直接编辑文件。" };
        }
        const blockRef = typeof args.blockRef === "string" && args.blockRef.trim() ? args.blockRef.trim() : "";
        if (blockRef) {
          const block = draft.ir.blocks.find((item) => item.ref === blockRef);
          if (!block) throw new Error(`积木 ref 不存在：${blockRef}。请先用 read_plugin_draft 查看草稿摘要。`);
          return { draftId, blockRef, block };
        }
        return { draftId, mode: draft.mode, ...pluginIrSummary(draft.ir), validation: validatePluginDraft(draft, pluginValidationContext()) };
      }
      if (name === "apply_plugin_plan") {
        let parsedOperations;
        try {
          parsedOperations = parsePluginPlanOperations({ version: 1, operations: args.operations });
        } catch (error) {
          if (error instanceof PluginIrError) return { applied: false, changed: false, issues: [error.issue] };
          throw error;
        }
        try {
          const updated = store.applyOperations(draft.id, parsedOperations);
          return { applied: true, changed: true, ...pluginDraftSummary(updated, pluginValidationContext()) };
        } catch (error) {
          if (error instanceof PluginIrError) return { applied: false, changed: false, issues: [error.issue] };
          throw error;
        }
      }
      if (name === "read_plugin_draft_file") {
        const path = checkedString(args, "path");
        const content = draft.files[path];
        if (typeof content !== "string") throw new Error(`插件草稿文件不存在：${path}`);
        const offset = typeof args.offset === "number" && Number.isInteger(args.offset) ? Math.max(0, args.offset) : 0;
        const maxChars = typeof args.maxChars === "number" && Number.isInteger(args.maxChars) ? Math.max(1, Math.min(5000, args.maxChars)) : 5000;
        const page = content.slice(offset, offset + maxChars);
        const nextOffset = offset + page.length;
        return {
          draftId,
          path,
          offset,
          content: page,
          totalChars: content.length,
          truncated: nextOffset < content.length,
          ...(nextOffset < content.length ? { nextOffset } : {}),
        };
      }
      if (name === "update_plugin_draft") {
        const updated = store.update(draftId, checkedDraftFiles(args));
        return { updated: true, ...pluginDraftSummary(updated, pluginValidationContext()), files: updated.files };
      }
      if (name === "edit_plugin_draft_file") {
        const updated = store.editFile(
          draftId,
          checkedString(args, "path"),
          checkedString(args, "oldText"),
          checkedString(args, "newText", true),
          args.replaceAll === true,
        );
        return { edited: true, ...pluginDraftSummary(updated, pluginValidationContext()), files: updated.files };
      }
      const validation = validatePluginDraft(draft, pluginValidationContext());
      if (name === "validate_plugin_draft") {
        const validated = store.markValidation(draft.id, validation);
        return { ...pluginDraftSummary(validated, pluginValidationContext()), validation };
      }
      if (name === "run_plugin_draft_checks") {
        const validated = store.markValidation(draft.id, validation);
        if (!validation.valid) return { ...pluginDraftSummary(validated, pluginValidationContext()), runtimeValidation: { valid: false, checks: [], issues: validation.issues } };
        if (!services.runPluginDraftChecks) throw new Error("插件运行检查服务尚未就绪");
        const runtimeValidation = await services.runPluginDraftChecks(validated, signal);
        const checked = store.markRuntimeValidation(draft.id, runtimeValidation);
        return { ...pluginDraftSummary(checked, pluginValidationContext()), ...runtimeValidation, runtimeValidation };
      }
      const validated = store.markValidation(draft.id, validation);
      if (!validation.valid) return { installed: false, ...pluginDraftSummary(validated, pluginValidationContext()), validation };
      if (validated.phase !== "ready" || validated.runtimeValidation?.valid !== true) {
        return { installed: false, ...pluginDraftSummary(validated, pluginValidationContext()), validation, error: "插件必须先通过运行检查" };
      }
      if (!services.installPluginDraft) throw new Error("插件安装服务尚未就绪");
      const installed = await services.installPluginDraft(draft, signal);
      const marked = store.markInstalled(draft.id);
      return { installed: true, ...installed, ...pluginDraftSummary(marked, pluginValidationContext()), capabilities: getAgentCapabilities(), validation };
    }
    const codeOnly = new Set(["list_documents", "get_document", "switch_document", "create_document", "rename_document", "delete_document", "inspect_python_structure", "replace_code", "edit_code", "insert_statements", "replace_function_body", "add_import", "check_code", "format_code", "undo_code", "redo_code"]);
    if (codeOnly.has(name) && services.workspaceModeRef.current !== "code") throw new Error("当前工具只适用于纯代码工作区");

    if (name === "list_documents") {
      const documents = services.documentsRef.current.map((document) => document.id === services.activeDocumentIdRef.current ? { ...document, code: services.sourceCodeRef.current } : document);
      return { activeDocumentId: services.activeDocumentIdRef.current, documents: documents.map(({ id, name: documentName, code }) => ({ id, name: documentName, lineCount: code ? code.split("\n").length : 0, active: id === services.activeDocumentIdRef.current })) };
    }
    if (name === "get_document") {
      const documentId = checkedString(args, "documentId");
      const document = services.documentsRef.current.find((item) => item.id === documentId);
      if (!document) throw new Error(`代码文档不存在：${documentId}。请重新调用 list_documents。`);
      const code = document.id === services.activeDocumentIdRef.current ? services.sourceCodeRef.current : document.code;
      return { id: document.id, name: document.name, code, lineCount: code ? code.split("\n").length : 0, active: document.id === services.activeDocumentIdRef.current };
    }
    if (name === "switch_document") {
      const documentId = checkedString(args, "documentId");
      const documents = services.documentsRef.current.map((document) => document.id === services.activeDocumentIdRef.current ? { ...document, code: services.sourceCodeRef.current } : document);
      const document = documents.find((item) => item.id === documentId);
      if (!document) throw new Error(`代码文档不存在：${documentId}。请重新调用 list_documents。`);
      if (services.taskId.current !== null || Object.values(services.getPluginExecutionState?.() || {}).some((value) => value === true)) throw new Error("请先等待或停止当前任务，再切换文档");
      services.switchDocumentConsoleState(services.activeDocumentIdRef.current, document.id);
      services.documentsRef.current = documents;
      services.activeDocumentIdRef.current = document.id;
      services.sourceCodeRef.current = document.code;
      services.setDocuments(documents);
      services.setActiveDocumentId(document.id);
      services.setSourceCode(document.code);
      return { switched: true, id: document.id, name: document.name, code: document.code, lineCount: document.code ? document.code.split("\n").length : 0 };
    }
    if (name === "create_document") {
      const requestedName = typeof args.name === "string" && args.name.trim() ? args.name.trim() : "main";
      const documents = services.documentsRef.current.map((document) => document.id === services.activeDocumentIdRef.current ? { ...document, code: services.sourceCodeRef.current } : document);
      const document = createCodeDocument(documents.map((item) => item.name), requestedName);
      const nextDocuments = [...documents, document];
      services.switchDocumentConsoleState(services.activeDocumentIdRef.current, document.id);
      services.documentsRef.current = nextDocuments;
      services.activeDocumentIdRef.current = document.id;
      services.sourceCodeRef.current = document.code;
      services.setDocuments(nextDocuments);
      services.setActiveDocumentId(document.id);
      services.setSourceCode(document.code);
      services.setSourceCodeInitialized(true);
      markDirty();
      return { created: true, changed: true, id: document.id, name: document.name, template: "python", code: document.code };
    }
    if (name === "rename_document") {
      const documentId = checkedString(args, "documentId");
      const nextName = checkedString(args, "name");
      const documents = services.documentsRef.current.map((document) => document.id === services.activeDocumentIdRef.current ? { ...document, code: services.sourceCodeRef.current } : document);
      if (documents.some((document) => document.id !== documentId && document.name === nextName)) throw new Error(`代码文档名称已存在：${nextName}`);
      const target = documents.find((document) => document.id === documentId);
      if (!target) throw new Error(`代码文档不存在：${documentId}`);
      const renamed = renameCodeDocument(target, nextName);
      const nextDocuments = documents.map((document) => document.id === documentId ? renamed : document);
      services.documentsRef.current = nextDocuments;
      services.setDocuments(nextDocuments);
      markDirty();
      return { renamed: true, changed: target.name !== renamed.name, id: documentId, name: renamed.name };
    }
    if (name === "delete_document") {
      const documentId = checkedString(args, "documentId");
      const documents = services.documentsRef.current.map((document) => document.id === services.activeDocumentIdRef.current ? { ...document, code: services.sourceCodeRef.current } : document);
      const index = documents.findIndex((document) => document.id === documentId);
      const target = documents[index];
      if (!target) throw new Error(`代码文档不存在：${documentId}`);
      if (documents.length === 1) throw new Error("工程至少需要保留一个代码文档");
      const remaining = documents.filter((document) => document.id !== documentId);
      services.documentsRef.current = remaining;
      services.setDocuments(remaining);
      if (documentId === services.activeDocumentIdRef.current) {
        const next = remaining[Math.min(index, remaining.length - 1)];
        services.switchDocumentConsoleState(documentId, next.id);
        services.activeDocumentIdRef.current = next.id;
        services.sourceCodeRef.current = next.code;
        services.setActiveDocumentId(next.id);
        services.setSourceCode(next.code);
      }
      markDirty();
      return { deleted: true, changed: true, id: documentId, name: target.name, activeDocumentId: services.activeDocumentIdRef.current };
    }
    if (name === "get_context") {
      const currentDocument = services.documentsRef.current.find((document) => document.id === services.activeDocumentIdRef.current);
      return {
        workspaceMode: services.workspaceModeRef.current,
        workbench: services.getWorkbench?.() ?? null,
        project: { name: services.projectName, path: services.projectPathRef.current, dirty: services.getProjectDirty(), activeDocument: { id: services.activeDocumentIdRef.current, name: currentDocument?.name || "当前文档" }, documentCount: services.documentsRef.current.length },
        code: services.sourceCodeRef.current,
        lineCount: services.sourceCodeRef.current ? services.sourceCodeRef.current.split("\n").length : 0,
        pythonEnvironment: services.pythonEnvironment ? { version: services.pythonEnvironment.version, path: services.pythonEnvironment.path } : null,
        running: services.taskId.current !== null || services.runningRef.current,
        pluginExecutions: services.getPluginExecutionState?.() || {},
        capabilities: getAgentCapabilities(),
        documents: services.documentsRef.current.map(({ id, name: documentName, code }) => ({ id, name: documentName, lineCount: code ? code.split("\n").length : 0, active: id === services.activeDocumentIdRef.current })),
        ...(args.includeResources === true ? { resources: services.projectResourcesRef.current.map(({ id, type, path, originalName, size }) => ({ id, type, path, originalName, size })) } : {}),
      };
    }
    if (name === "get_diagnostics") {
      const limit = Math.max(1, Math.min(200, Math.round(typeof args.limit === "number" ? args.limit : 80)));
      const includeOutput = args.includeOutput !== false;
      const includeProblems = args.includeProblems !== false;
      const output = includeOutput
        ? services.outputRef.current.slice(-limit).map(({ stream, data }) => ({ stream, data }))
        : undefined;
      const problems = includeProblems
        ? services.problemsRef.current.slice(-limit).map(({ kind, line, message, suggestion }) => ({ kind, line, message, suggestion }))
        : undefined;
      return {
        ...(output ? { output } : {}),
        ...(problems ? { problems } : {}),
        hasErrors: Boolean(output?.some((entry) => entry.stream === "stderr") || problems?.length),
      };
    }
    if (name === "list_resources") {
      const requestedType = typeof args.type === "string" ? args.type : "";
      const query = typeof args.query === "string" ? args.query.trim().toLocaleLowerCase() : "";
      const statuses = services.projectPathRef.current && services.projectResourcesRef.current.length ? await services.invoke<ProjectResourceStatus[]>("inspect_project_resources", { projectPath: services.projectPathRef.current, resourcePaths: services.projectResourcesRef.current.map((resource) => resource.path) }) : [];
      const byPath = new Map(statuses.map((status) => [status.path, status]));
      return { resources: services.projectResourcesRef.current.filter((resource) => (!requestedType || resource.type === requestedType) && (!query || resource.originalName.toLocaleLowerCase().includes(query) || resource.id.toLocaleLowerCase().includes(query))).map((resource) => ({ ...resource, resolvedPath: resolveProjectResourceReference(projectResourceReference(resource.id), services.projectResourcesRef.current, services.projectPathRef.current), exists: byPath.get(resource.path)?.exists ?? null, actualSize: byPath.get(resource.path)?.size ?? resource.size })) };
    }
    if (name === "get_resource") {
      const resourceId = checkedString(args, "resourceId");
      const resource = services.projectResourcesRef.current.find((item) => item.id === resourceId);
      if (!resource) throw new Error(`工程资源不存在：${resourceId}`);
      const statuses = services.projectPathRef.current ? await services.invoke<ProjectResourceStatus[]>("inspect_project_resources", { projectPath: services.projectPathRef.current, resourcePaths: [resource.path] }) : [];
      return { ...resource, resolvedPath: resolveProjectResourceReference(projectResourceReference(resource.id), services.projectResourcesRef.current, services.projectPathRef.current), exists: statuses[0]?.exists ?? null, actualSize: statuses[0]?.size ?? resource.size };
    }
    if (name === "check_resources") {
      const uniqueIds = [...new Set([...services.sourceCodeRef.current.matchAll(/resource:\/\/([A-Za-z0-9_-]+)/g)].map((match) => match[1]))];
      const resources = uniqueIds.map((id) => services.projectResourcesRef.current.find((resource) => resource.id === id));
      const missingRecords = uniqueIds.filter((_, index) => !resources[index]);
      const existing = resources.filter((resource): resource is ProjectResource => Boolean(resource));
      const statuses = services.projectPathRef.current && existing.length ? await services.invoke<ProjectResourceStatus[]>("inspect_project_resources", { projectPath: services.projectPathRef.current, resourcePaths: existing.map((resource) => resource.path) }) : [];
      const missingFiles = statuses.filter((status) => !status.exists).map((status) => status.path);
      return { valid: !missingRecords.length && !missingFiles.length, references: uniqueIds, missingRecords, missingFiles };
    }
    if (name === "check_dependencies" || name === "install_dependencies") {
      if (!services.pythonEnvironment) throw new Error("尚未选择 Python 环境");
      const packages = args.packages;
      if (!Array.isArray(packages) || !packages.length || packages.some((item) => typeof item !== "string" || !/^[A-Za-z0-9_.-]+$/.test(item))) throw new Error("packages 包含无效包名");
      const statuses = await services.invoke<PythonPackageStatus[]>("check_python_packages", { pythonPath: services.pythonEnvironment.path, packages });
      const missing = statuses.filter((status) => !status.installed).map((status) => status.name);
      if (name === "check_dependencies") return { ok: true, checked: true, allInstalled: missing.length === 0, packages: statuses, missing };
      if (!missing.length) return { installed: true, packages: [], detail: "依赖已经安装" };
      services.setInstallingPackages(true);
      let finish!: (payload: PackageInstallFinishedEvent) => void;
      const finished = new Promise<PackageInstallFinishedEvent>((resolve) => { finish = resolve; });
      const unlisten = await services.listen<PackageInstallFinishedEvent>("package-install-finished", ({ payload }) => finish(payload));
      const abort = () => { void services.invoke("stop_package_install"); };
      signal.addEventListener("abort", abort, { once: true });
      try {
        await services.invoke("install_python_packages", { pythonPath: services.pythonEnvironment.path, packages: missing, indexUrl: services.usePipMirror ? services.pipMirrorUrl : null });
        const result = await finished;
        if (!result.success) throw new Error(result.stopped ? "依赖安装已停止" : result.error || "依赖安装失败");
        const verified = await services.invoke<PythonPackageStatus[]>("check_python_packages", { pythonPath: services.pythonEnvironment.path, packages });
        const stillMissing = verified.filter((status) => !status.installed).map((status) => status.name);
        if (stillMissing.length) throw new Error(`安装完成后仍缺少依赖：${stillMissing.join(", ")}`);
        return { installed: true, packages: missing, verified: true };
      } finally { unlisten(); signal.removeEventListener("abort", abort); services.setInstallingPackages(false); }
    }
    if (name === "inspect_python_structure") return services.invoke<PythonStructure>("inspect_python_structure", { code: services.sourceCodeRef.current, pythonPath: services.pythonEnvironment?.path || null });
    if (name === "replace_code") {
      const code = checkedString(args, "code", true);
      await validateCandidateCode(code);
      return { summary: toolSummary(args, "重写代码"), ...commitCode(code, signal) };
    }
    if (name === "edit_code") {
      if (!Array.isArray(args.edits) || !args.edits.length) throw new Error("参数 edits 必须是非空数组");
      const edits = args.edits.map((candidate, index): AiCodeEdit => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error(`第 ${index + 1} 个编辑格式无效`);
        const edit = candidate as Record<string, unknown>;
        if (typeof edit.oldText !== "string" || typeof edit.newText !== "string") throw new Error(`第 ${index + 1} 个编辑必须包含字符串 oldText 和 newText`);
        return { oldText: edit.oldText, newText: edit.newText, replaceAll: edit.replaceAll === true };
      });
      const nextCode = applyExactCodeEdits(services.sourceCodeRef.current, edits);
      await validateCandidateCode(nextCode);
      return { summary: toolSummary(args, "修改代码"), editCount: edits.length, ...commitCode(nextCode, signal) };
    }
    if (name === "insert_statements" || name === "replace_function_body" || name === "add_import") {
      const currentCode = services.sourceCodeRef.current;
      const structure = await services.invoke<PythonStructure>("inspect_python_structure", { code: currentCode, pythonPath: services.pythonEnvironment?.path || null });
      let nextCode = currentCode;
      if (name === "insert_statements") {
        if (!Array.isArray(args.statements) || !args.statements.length || args.statements.some((item) => typeof item !== "string" || !item.trim())) throw new Error("statements 必须是非空 Python 语句字符串数组");
        nextCode = insertPythonStatements(currentCode, structure, { ...(typeof args.className === "string" && args.className.trim() ? { className: args.className.trim() } : {}), functionName: checkedString(args, "functionName"), position: args.position === "start" ? "start" : args.position === "end" ? "end" : (() => { throw new Error("position 必须是 start 或 end"); })(), statements: args.statements as string[] });
      } else if (name === "replace_function_body") nextCode = replacePythonFunctionBody(currentCode, structure, { ...(typeof args.className === "string" && args.className.trim() ? { className: args.className.trim() } : {}), functionName: checkedString(args, "functionName"), body: checkedString(args, "body") });
      else {
        const names = args.names === undefined ? [] : args.names;
        if (!Array.isArray(names) || names.some((item) => typeof item !== "string")) throw new Error("names 必须是字符串数组");
        nextCode = addPythonImport(currentCode, structure, checkedString(args, "module"), names as string[]);
      }
      await validateCandidateCode(nextCode);
      return { summary: toolSummary(args, name === "insert_statements" ? "插入语句" : name === "replace_function_body" ? "修改函数" : "添加导入"), ...commitCode(nextCode, signal) };
    }
    if (name === "check_code") {
      const code = services.sourceCodeRef.current;
      try {
        await validateCandidateCode(code);
        services.setCodeSyntaxDiagnostic(null);
        services.setProblems((items) => items.filter((problem) => problem.kind !== "syntax"));
        return { valid: true, lineCount: code ? code.split("\n").length : 0 };
      } catch (error) {
        const traceback = String(error);
        const diagnostic = parsePythonSyntaxDiagnostic(traceback, code);
        if (diagnostic) services.setCodeSyntaxDiagnostic(diagnostic);
        services.setProblems((items) => [...items.filter((problem) => problem.kind !== "syntax"), { id: `syntax-${Date.now()}`, kind: "syntax", line: diagnostic?.line ?? 0, message: diagnostic?.message || traceback, suggestion: diagnostic?.suggestion }]);
        services.setActivePanel("problems");
        return { valid: false, error: traceback, diagnostic };
      }
    }
    if (name === "format_code") {
      const previousCode = services.sourceCodeRef.current;
      const formatted = await services.formatCurrentPythonCode(false);
      if (formatted === null) throw new Error("代码格式化失败，请先检查语法问题");
      if (signal.aborted) throw new Error("已停止生成");
      services.sourceCodeRef.current = formatted;
      const changed = previousCode !== formatted;
      return { formatted: true, changed, diff: changed ? createCodeChangePreview(previousCode, formatted) : "", lineCount: formatted ? formatted.split("\n").length : 0, __codeChange: changed ? { before: previousCode, after: formatted, documentId: services.activeDocumentIdRef.current, documentName: services.documentsRef.current.find((document) => document.id === services.activeDocumentIdRef.current)?.name } : undefined };
    }
    if (name === "undo_code" || name === "redo_code") {
      const editor = services.codeEditor.current;
      if (!editor) throw new Error("代码编辑器尚未就绪");
      const previousCode = editor.getValue();
      editor.trigger("ai-code-agent", name === "undo_code" ? "undo" : "redo", null);
      await waitWithSignal(0, signal);
      const code = editor.getValue();
      const changed = previousCode !== code;
      services.sourceCodeRef.current = code;
      services.setSourceCode(code);
      if (changed) markDirty();
      return { changed, diff: changed ? createCodeChangePreview(previousCode, code) : "", lineCount: code ? code.split("\n").length : 0, __codeChange: changed ? { before: previousCode, after: code, documentId: services.activeDocumentIdRef.current, documentName: services.documentsRef.current.find((document) => document.id === services.activeDocumentIdRef.current)?.name } : undefined };
    }
    if (name === "run_project") {
      const result = await services.runCode();
      const device = services.getDeviceExecutionState?.();
      return {
        started: result?.started ?? services.taskId.current !== null,
        ...(result?.target ? { target: result.target, runId: result.runId, message: result.message } : {}),
        ...(device ? { deviceRunning: device.deviceRunning, devicePort: device.devicePort } : {}),
      };
    }
    if (name === "get_execution_state") {
      const device = services.getDeviceExecutionState?.();
      const running = services.taskId.current !== null || Boolean(device?.deviceRunning);
      return { running, pythonElapsedSeconds: running && services.pythonRunStartedAt.current ? Math.max(0, Math.floor((Date.now() - services.pythonRunStartedAt.current) / 1000)) : services.pythonRunElapsed.current, output: services.outputRef.current.slice(-120).map(({ stream, data }) => ({ stream, data })), problems: services.problemsRef.current.map(({ kind, line, message, suggestion }) => ({ kind, line, message, suggestion })), ...(device ? { deviceRunning: device.deviceRunning, devicePhase: device.devicePhase, devicePort: device.devicePort, deviceConnected: device.deviceConnected } : {}), ...(services.getPluginExecutionState?.() || {}) };
    }
    if (name === "wait") {
      const milliseconds = Math.max(100, Math.min(10_000, Math.round(typeof args.milliseconds === "number" ? args.milliseconds : 1000)));
      await waitWithSignal(milliseconds, signal);
      const device = services.getDeviceExecutionState?.();
      return { waitedMilliseconds: milliseconds, running: services.taskId.current !== null || Boolean(device?.deviceRunning), ...(device ? { deviceRunning: device.deviceRunning, devicePhase: device.devicePhase } : {}), ...(services.getPluginExecutionState?.() || {}) };
    }
    if (name === "stop_execution") { await services.stopPluginExecutions?.(); if (services.taskId.current !== null) await services.stopCode(); await services.stopDeviceExecution?.(); return { stopped: true }; }
    if (name === "save_project") {
      const path = services.projectPathRef.current;
      const saved = path ? await services.writeProject(path, services.sourceCodeRef.current) : await services.saveProject();
      if (saved) services.setProjectDirty(false);
      return { saved, path: services.projectPathRef.current };
    }
    throw new Error(`未实现工具 ${name}`);
  };
}
