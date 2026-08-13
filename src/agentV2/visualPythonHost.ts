import type { listen as listenFunction } from "@tauri-apps/api/event";
import type { editor as MonacoEditor } from "monaco-editor";
import type { ManimRenderConfig } from "../plugins/builtin/manim/renderConfig";
import { countFakeVoiceoverApis, inspectVoiceovers, insertStandaloneVoiceover, insertSynchronizedVoiceover } from "../aiVoiceover";
import { addPythonImport, insertPythonStatements, replacePythonFunctionBody, type PythonStructure } from "../pythonStructuredEdits";
import { isPythonIdentifier } from "../pythonIdentifiers";
import { parsePythonSyntaxDiagnostic, type PythonCodeDiagnostic } from "../pythonSyntaxDiagnostics";
import { validateStandaloneSceneSource } from "../sceneValidation";
import { createSceneDocument, renameSceneDocument, sceneDocumentName, type SceneDocument } from "../sceneDocuments";
import { extractManimSceneNames } from "../plugins/builtin/manim/sceneNames";
import { projectResourceReference, resolveProjectResourceReference, type ProjectResource } from "../projectResources";
import { ManimRenderAttempt } from "../manimRenderCancellation";
import { applyExactCodeEdits, createCodeChangePreview } from "./codeChanges";
import type { AgentHost, AiCodeEdit } from "./types";

type Ref<T> = { current: T };
type StateSetter<T> = (value: T | ((current: T) => T)) => void;
type Invoke = <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;
type Listen = typeof listenFunction;
type OutputEntry = { stream: "stdout" | "stderr" | "system" | "input"; data: string };
type ProblemKind = "context" | "syntax" | "runtime" | "timeout" | "environment" | "plugin" | "resource";
type CodeProblem = { id: number | string; kind: ProblemKind; line: number; message: string; blockId?: string; suggestion?: string };
type PythonEnvironment = { path: string; version: string };
type PythonPackageStatus = { name: string; installed: boolean };
type PackageInstallFinishedEvent = { success: boolean; stopped: boolean; error?: string | null; packages: string[] };
type ProjectResourceStatus = { path: string; exists: boolean; size: number };
type TtsExpression = { emotion: string; tone: string; intonation: string; readingStyle: string; customInstruction: string };
type TtsConfig = TtsExpression & { baseUrl: string; provider: string; model: string; voice: string; speed: number };
type VoiceoverRole = TtsExpression & { id: string; name: string; model: string; voice: string; speed: number };
type RenderOutput = { type: "video" | "image"; scene: string; path: string; url: string; workDir: string; transparentBackground: boolean };
type CodeEditor = MonacoEditor.IStandaloneCodeEditor;
type RenderOptions = { outputType?: "video" | "image"; transparentBackground?: boolean; imageWidth?: number; imageHeight?: number; imageCaptureMode?: "final" | "animation"; imageAnimationStep?: number };

export type VisualPythonHostServices = {
  workspaceModeRef: Ref<string>;
  sceneDocumentsRef: Ref<SceneDocument[]>;
  activeSceneIdRef: Ref<string>;
  sourceCodeRef: Ref<string>;
  projectPathRef: Ref<string | null>;
  projectResourcesRef: Ref<ProjectResource[]>;
  taskId: Ref<number | null>;
  manimTaskId: Ref<number | null>;
  manimRenderAttempt: Ref<ManimRenderAttempt | null>;
  runningRef: Ref<boolean>;
  renderingManimRef: Ref<boolean>;
  pythonRunStartedAt: Ref<number>;
  pythonRunElapsed: Ref<number>;
  manimRenderStartedAt: Ref<number>;
  manimRenderElapsedRef: Ref<number>;
  manimRenderProgressRef: Ref<Record<string, unknown> | null>;
  outputRef: Ref<OutputEntry[]>;
  problemsRef: Ref<CodeProblem[]>;
  problemIdRef: Ref<number>;
  manimRenderOutputRef: Ref<RenderOutput | null>;
  codeEditor: Ref<CodeEditor | null>;
  aiCodePreviewing: Ref<boolean>;
  codeValidationVersion: Ref<number>;
  projectName: string;
  pythonEnvironment: PythonEnvironment | null;
  voiceoverRoles: VoiceoverRole[];
  ttsConfig: TtsConfig;
  ttsApiKey: string;
  usePipMirror: boolean;
  pipMirrorUrl: string;
  manimRenderConfig: ManimRenderConfig;
  getProjectDirty: () => boolean;
  setProjectDirty: (dirty: boolean) => void;
  setSceneDocuments: (documents: SceneDocument[]) => void;
  setActiveSceneId: (sceneId: string) => void;
  setSourceCode: (code: string) => void;
  setSourceCodeInitialized: (initialized: boolean) => void;
  setDirty: (dirty: boolean) => void;
  setProblems: StateSetter<CodeProblem[]>;
  setCodeSyntaxDiagnostic: (diagnostic: PythonCodeDiagnostic | null) => void;
  setCodeRuntimeDiagnostic: (diagnostic: null) => void;
  setActivePanel: (panel: "problems") => void;
  setInstallingPackages: (installing: boolean) => void;
  switchSceneConsoleState: (fromSceneId: string, toSceneId: string) => void;
  updateManimRenderConfig: (patch: Partial<ManimRenderConfig>) => void;
  formatCurrentPythonCode: (announce?: boolean) => Promise<string | null>;
  runCode: () => Promise<void>;
  renderManim: (options?: RenderOptions) => Promise<void>;
  stopManimRender: () => Promise<void>;
  stopCode: () => Promise<void>;
  writeProject: (path: string, sourceOverride?: string) => Promise<boolean>;
  saveProject: () => Promise<boolean>;
  inspectImageQuality: (url: string) => Promise<Record<string, unknown>>;
  inspectVideoQuality: (url: string) => Promise<Record<string, unknown>>;
  invoke: Invoke;
  listen: Listen;
  assertActive: (signal: AbortSignal) => void;
};

function checkedString(args: Record<string, unknown>, key: string, allowEmpty = false): string {
  const value = args[key];
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new Error(`参数 ${key} 必须是${allowEmpty ? "" : "非空"}字符串`);
  return value;
}

function toolSummary(args: Record<string, unknown>, fallback: string): string {
  return typeof args.summary === "string" && args.summary.trim() ? args.summary.trim() : fallback;
}

function waitWithSignal(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error("已停止生成")); return; }
    const timer = window.setTimeout(finish, milliseconds);
    function finish() { signal.removeEventListener("abort", cancel); resolve(); }
    function cancel() { window.clearTimeout(timer); signal.removeEventListener("abort", cancel); reject(new Error("已停止生成")); }
    signal.addEventListener("abort", cancel, { once: true });
  });
}

export function createVisualPythonToolExecutor(services: VisualPythonHostServices): AgentHost["executeTool"] {
  let codePreviewOriginal: string | null = null;

  const writeEditorCode = (nextCode: string, syncState = true) => {
    const editor = services.codeEditor.current;
    const model = editor?.getModel();
    if (editor && model && model.getValue() !== nextCode) {
      editor.executeEdits("ai-code-agent", [{ range: model.getFullModelRange(), text: nextCode, forceMoveMarkers: true }]);
    }
    services.sourceCodeRef.current = nextCode;
    if (syncState) {
      services.setSourceCode(nextCode);
      services.setSourceCodeInitialized(true);
    }
  };

  const markDirty = () => {
    services.setProjectDirty(true);
    services.setDirty(true);
  };

  const commitCode = (nextCode: string, signal: AbortSignal) => {
    services.assertActive(signal);
    const previousCode = codePreviewOriginal ?? services.sourceCodeRef.current;
    const editor = services.codeEditor.current;
    const model = editor?.getModel();
    if (codePreviewOriginal === null && editor && model && model.getValue() !== nextCode) editor.pushUndoStop();
    services.aiCodePreviewing.current = false;
    writeEditorCode(nextCode);
    codePreviewOriginal = null;
    editor?.pushUndoStop();
    services.codeValidationVersion.current += 1;
    services.setCodeSyntaxDiagnostic(null);
    services.setCodeRuntimeDiagnostic(null);
    services.setProblems((items) => items.filter((problem) => !["syntax", "runtime", "timeout"].includes(problem.kind)));
    markDirty();
    return {
      changed: previousCode !== nextCode,
      diff: createCodeChangePreview(previousCode, nextCode),
      lineCount: nextCode ? nextCode.split("\n").length : 0,
      __codeChange: previousCode !== nextCode ? { before: previousCode, after: nextCode, sceneId: services.activeSceneIdRef.current, sceneName: services.sceneDocumentsRef.current.find((document) => document.id === services.activeSceneIdRef.current)?.name } : undefined,
    };
  };

  const validateCandidateCode = async (candidateCode: string) => {
    try {
      await services.invoke("validate_python_code", { code: candidateCode, pythonPath: services.pythonEnvironment?.path || null });
    } catch (error) {
      throw new Error(`候选代码存在语法或缩进错误，未应用到编辑器：${String(error)}`);
    }
  };

  const executeTool = async (name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>> => {
    if (signal.aborted) throw new Error("已停止生成");
    if (services.workspaceModeRef.current !== "code") throw new Error("工作区已经离开纯代码模式");

    if (name === "list_scenes") {
      const documents = services.sceneDocumentsRef.current.map((document) => document.id === services.activeSceneIdRef.current ? { ...document, code: services.sourceCodeRef.current, name: sceneDocumentName(services.sourceCodeRef.current, document.name) } : document);
      return { activeSceneId: services.activeSceneIdRef.current, scenes: documents.map((document) => ({ id: document.id, name: document.name, lineCount: document.code ? document.code.split("\n").length : 0, active: document.id === services.activeSceneIdRef.current })) };
    }

    if (name === "get_scene") {
      const sceneId = checkedString(args, "sceneId");
      const document = services.sceneDocumentsRef.current.find((item) => item.id === sceneId);
      if (!document) throw new Error(`场景不存在：${sceneId}。请重新调用 list_scenes。`);
      const code = document.id === services.activeSceneIdRef.current ? services.sourceCodeRef.current : document.code;
      return { id: document.id, name: sceneDocumentName(code, document.name), code, lineCount: code ? code.split("\n").length : 0, active: document.id === services.activeSceneIdRef.current };
    }

    if (name === "switch_scene") {
      const sceneId = checkedString(args, "sceneId");
      const documents = services.sceneDocumentsRef.current.map((document) => document.id === services.activeSceneIdRef.current ? { ...document, code: services.sourceCodeRef.current, name: sceneDocumentName(services.sourceCodeRef.current, document.name) } : document);
      const document = documents.find((item) => item.id === sceneId);
      if (!document) throw new Error(`场景不存在：${sceneId}。请重新调用 list_scenes。`);
      if (services.taskId.current !== null || services.manimTaskId.current !== null || services.manimRenderAttempt.current) throw new Error("请先等待或停止当前运行/渲染任务，再切换场景");
      services.switchSceneConsoleState(services.activeSceneIdRef.current, document.id);
      services.sceneDocumentsRef.current = documents;
      services.activeSceneIdRef.current = document.id;
      services.sourceCodeRef.current = document.code;
      services.setSceneDocuments(documents);
      services.setActiveSceneId(document.id);
      services.setSourceCode(document.code);
      services.updateManimRenderConfig({ selectedScene: extractManimSceneNames(document.code)[0] || document.name });
      await waitWithSignal(0, signal);
      return { switched: true, id: document.id, name: document.name, code: document.code, lineCount: document.code ? document.code.split("\n").length : 0 };
    }

    if (name === "create_scene") {
      const requestedName = typeof args.name === "string" && args.name.trim() ? args.name.trim() : "NewScene";
      if (!isPythonIdentifier(requestedName)) throw new Error("场景名称必须是有效的 Python 类名");
      const documents = services.sceneDocumentsRef.current.map((document) => document.id === services.activeSceneIdRef.current ? { ...document, code: services.sourceCodeRef.current, name: sceneDocumentName(services.sourceCodeRef.current, document.name) } : document);
      const document = createSceneDocument(documents.map((item) => item.name), requestedName);
      const nextDocuments = [...documents, document];
      services.switchSceneConsoleState(services.activeSceneIdRef.current, document.id);
      services.sceneDocumentsRef.current = nextDocuments;
      services.activeSceneIdRef.current = document.id;
      services.sourceCodeRef.current = document.code;
      services.setSceneDocuments(nextDocuments);
      services.setActiveSceneId(document.id);
      services.setSourceCode(document.code);
      services.setSourceCodeInitialized(true);
      markDirty();
      services.updateManimRenderConfig({ selectedScene: document.name });
      await waitWithSignal(0, signal);
      return { created: true, changed: true, id: document.id, name: document.name, code: document.code };
    }

    if (name === "rename_scene") {
      const sceneId = checkedString(args, "sceneId");
      const nextName = checkedString(args, "name");
      if (services.sceneDocumentsRef.current.some((document) => document.id !== sceneId && document.name === nextName)) throw new Error(`场景名称已存在：${nextName}`);
      const currentDocuments = services.sceneDocumentsRef.current.map((document) => document.id === services.activeSceneIdRef.current ? { ...document, code: services.sourceCodeRef.current } : document);
      const target = currentDocuments.find((document) => document.id === sceneId);
      if (!target) throw new Error(`场景不存在：${sceneId}。请重新调用 list_scenes。`);
      const renamed = renameSceneDocument(target, nextName);
      await validateCandidateCode(renamed.code);
      if (signal.aborted) throw new Error("已停止生成");
      const documents = currentDocuments.map((document) => document.id === sceneId ? renamed : document);
      services.sceneDocumentsRef.current = documents;
      services.setSceneDocuments(documents);
      if (sceneId === services.activeSceneIdRef.current) {
        services.sourceCodeRef.current = renamed.code;
        services.setSourceCode(renamed.code);
        services.updateManimRenderConfig({ selectedScene: nextName });
      }
      markDirty();
      return {
        renamed: true,
        changed: target.name !== renamed.name || target.code !== renamed.code,
        id: sceneId,
        name: nextName,
        diff: createCodeChangePreview(target.code, renamed.code),
        __codeChange: target.code !== renamed.code ? { before: target.code, after: renamed.code, sceneId, sceneName: nextName } : undefined,
      };
    }

    if (name === "delete_scene") {
      const sceneId = checkedString(args, "sceneId");
      const documents = services.sceneDocumentsRef.current.map((document) => document.id === services.activeSceneIdRef.current ? { ...document, code: services.sourceCodeRef.current } : document);
      const index = documents.findIndex((document) => document.id === sceneId);
      const target = documents[index];
      if (!target) throw new Error(`场景不存在：${sceneId}。请重新调用 list_scenes。`);
      if (documents.length === 1) throw new Error("工程至少需要保留一个场景");
      const remaining = documents.filter((document) => document.id !== sceneId);
      services.sceneDocumentsRef.current = remaining;
      services.setSceneDocuments(remaining);
      if (sceneId === services.activeSceneIdRef.current) {
        const next = remaining[Math.min(index, remaining.length - 1)];
        services.switchSceneConsoleState(services.activeSceneIdRef.current, next.id);
        services.activeSceneIdRef.current = next.id;
        services.sourceCodeRef.current = next.code;
        services.setActiveSceneId(next.id);
        services.setSourceCode(next.code);
        services.updateManimRenderConfig({ selectedScene: extractManimSceneNames(next.code)[0] || next.name });
        await waitWithSignal(0, signal);
      }
      markDirty();
      return { deleted: true, changed: true, id: sceneId, name: target.name, activeSceneId: services.activeSceneIdRef.current };
    }

    if (name === "get_context") {
      const currentDocument = services.sceneDocumentsRef.current.find((document) => document.id === services.activeSceneIdRef.current);
      return {
        project: { name: services.projectName, path: services.projectPathRef.current, dirty: services.getProjectDirty(), scene: { id: services.activeSceneIdRef.current, name: currentDocument?.name || "当前场景" }, sceneCount: services.sceneDocumentsRef.current.length },
        code: services.sourceCodeRef.current,
        lineCount: services.sourceCodeRef.current ? services.sourceCodeRef.current.split("\n").length : 0,
        pythonEnvironment: services.pythonEnvironment ? { version: services.pythonEnvironment.version, path: services.pythonEnvironment.path } : null,
        running: services.taskId.current !== null || services.runningRef.current,
        rendering: services.manimTaskId.current !== null || services.renderingManimRef.current,
        ...(args.includeResources === true ? { resources: services.projectResourcesRef.current.map(({ id, type, path, originalName, size }) => ({ id, type, path, originalName, size })) } : {}),
      };
    }

    if (name === "validate_scene") {
      const document = services.sceneDocumentsRef.current.find((item) => item.id === services.activeSceneIdRef.current);
      if (!document) throw new Error("当前场景不存在");
      const code = services.sourceCodeRef.current;
      const base = validateStandaloneSceneSource(code, document.name, services.projectResourcesRef.current, services.voiceoverRoles.map((role) => role.id));
      const issues = [...base.issues];
      try {
        await services.invoke("validate_python_code", { code, pythonPath: services.pythonEnvironment?.path || null });
      } catch (error) {
        issues.push({ code: "python-syntax", severity: "error" as const, message: String(error) });
      }
      if (base.kind === "manim" && base.sceneNames.length === 1 && !issues.some((issue) => issue.code === "python-syntax")) {
        const structure = await services.invoke<PythonStructure>("inspect_python_structure", { code, pythonPath: services.pythonEnvironment?.path || null });
        const sceneClass = structure.classes.find((item) => item.name === base.sceneNames[0]);
        const constructCount = sceneClass?.methods.filter((method) => method.name === "construct").length ?? 0;
        if (constructCount === 0) issues.push({ code: "missing-construct", severity: "error", message: `场景类 ${base.sceneNames[0]} 缺少 construct 方法` });
        else if (constructCount > 1) issues.push({ code: "duplicate-construct", severity: "error", message: `场景类 ${base.sceneNames[0]} 包含多个 construct 方法` });
      }
      const referencedResources = [...code.matchAll(/resource:\/\/([A-Za-z0-9_-]+)/g)].map((match) => services.projectResourcesRef.current.find((resource) => resource.id === match[1])).filter((resource): resource is ProjectResource => Boolean(resource));
      if (services.projectPathRef.current && referencedResources.length) {
        const statuses = await services.invoke<ProjectResourceStatus[]>("inspect_project_resources", { projectPath: services.projectPathRef.current, resourcePaths: referencedResources.map((resource) => resource.path) });
        for (const status of statuses.filter((item) => !item.exists)) issues.push({ code: "missing-resource-file", severity: "error", message: `工程资源文件不存在：${status.path}` });
      }
      return { valid: !issues.some((issue) => issue.severity === "error"), kind: base.kind, sceneId: document.id, sceneName: document.name, issues };
    }

    if (name === "list_resources") {
      const requestedType = typeof args.type === "string" ? args.type : "";
      const query = typeof args.query === "string" ? args.query.trim().toLocaleLowerCase() : "";
      let statuses: ProjectResourceStatus[] = [];
      if (services.projectPathRef.current && services.projectResourcesRef.current.length) statuses = await services.invoke<ProjectResourceStatus[]>("inspect_project_resources", { projectPath: services.projectPathRef.current, resourcePaths: services.projectResourcesRef.current.map((resource) => resource.path) });
      const byPath = new Map(statuses.map((status) => [status.path, status]));
      return { resources: services.projectResourcesRef.current.filter((resource) => (!requestedType || resource.type === requestedType) && (!query || resource.originalName.toLocaleLowerCase().includes(query) || resource.id.toLocaleLowerCase().includes(query))).map((resource) => ({ ...resource, resolvedPath: resolveProjectResourceReference(projectResourceReference(resource.id), services.projectResourcesRef.current, services.projectPathRef.current), exists: byPath.get(resource.path)?.exists ?? null, actualSize: byPath.get(resource.path)?.size ?? resource.size })) };
    }

    if (name === "get_resource") {
      const resourceId = checkedString(args, "resourceId");
      const resource = services.projectResourcesRef.current.find((item) => item.id === resourceId);
      if (!resource) throw new Error(`工程资源不存在：${resourceId}`);
      let status: ProjectResourceStatus | undefined;
      if (services.projectPathRef.current) [status] = await services.invoke<ProjectResourceStatus[]>("inspect_project_resources", { projectPath: services.projectPathRef.current, resourcePaths: [resource.path] });
      return { ...resource, resolvedPath: resolveProjectResourceReference(projectResourceReference(resource.id), services.projectResourcesRef.current, services.projectPathRef.current), exists: status?.exists ?? null, actualSize: status?.size ?? resource.size };
    }

    if (name === "check_resources") {
      const references = [...services.sourceCodeRef.current.matchAll(/resource:\/\/([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
      const uniqueIds = [...new Set(references)];
      const resources = uniqueIds.map((id) => services.projectResourcesRef.current.find((resource) => resource.id === id));
      const missingRecords = uniqueIds.filter((_, index) => !resources[index]);
      const existing = resources.filter((resource): resource is ProjectResource => Boolean(resource));
      const statuses = services.projectPathRef.current && existing.length ? await services.invoke<ProjectResourceStatus[]>("inspect_project_resources", { projectPath: services.projectPathRef.current, resourcePaths: existing.map((resource) => resource.path) }) : [];
      const missingFiles = statuses.filter((status) => !status.exists).map((status) => status.path);
      return { valid: !missingRecords.length && !missingFiles.length, references: uniqueIds, missingRecords, missingFiles };
    }

    if (name === "check_dependencies") {
      if (!services.pythonEnvironment) throw new Error("尚未选择 Python 环境");
      const packages = args.packages;
      if (!Array.isArray(packages) || !packages.length || packages.some((item) => typeof item !== "string" || !/^[A-Za-z0-9_.-]+$/.test(item))) throw new Error("packages 包含无效包名");
      const statuses = await services.invoke<PythonPackageStatus[]>("check_python_packages", { pythonPath: services.pythonEnvironment.path, packages });
      const missing = statuses.filter((status) => !status.installed).map((status) => status.name);
      return { ok: true, checked: true, allInstalled: missing.length === 0, packages: statuses, missing };
    }

    if (name === "install_dependencies") {
      if (!services.pythonEnvironment) throw new Error("尚未选择 Python 环境");
      const packages = args.packages;
      if (!Array.isArray(packages) || !packages.length || packages.some((item) => typeof item !== "string" || !/^[A-Za-z0-9_.-]+$/.test(item))) throw new Error("packages 包含无效包名");
      const statuses = await services.invoke<PythonPackageStatus[]>("check_python_packages", { pythonPath: services.pythonEnvironment.path, packages });
      const missing = statuses.filter((status) => !status.installed).map((status) => status.name);
      if (!missing.length) return { installed: true, packages: [], detail: "依赖已经安装" };
      services.setInstallingPackages(true);
      let resolveFinished!: (payload: PackageInstallFinishedEvent) => void;
      let rejectFinished!: (error: unknown) => void;
      const finished = new Promise<PackageInstallFinishedEvent>((resolve, reject) => { resolveFinished = resolve; rejectFinished = reject; });
      const unlisten = await services.listen<PackageInstallFinishedEvent>("package-install-finished", ({ payload }) => resolveFinished(payload));
      const abort = () => {
        void services.invoke("stop_package_install");
        rejectFinished(new DOMException("已停止依赖安装", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      try {
        await services.invoke("install_python_packages", { pythonPath: services.pythonEnvironment.path, packages: missing, indexUrl: services.usePipMirror ? services.pipMirrorUrl : null });
        const result = await finished;
        if (!result.success) throw new Error(result.stopped ? "依赖安装已停止" : result.error || "依赖安装失败");
        const verified = await services.invoke<PythonPackageStatus[]>("check_python_packages", { pythonPath: services.pythonEnvironment.path, packages });
        const stillMissing = verified.filter((status) => !status.installed).map((status) => status.name);
        if (stillMissing.length) throw new Error(`安装完成后仍缺少依赖：${stillMissing.join(", ")}`);
        return { installed: true, packages: missing, verified: true };
      } finally {
        unlisten();
        signal.removeEventListener("abort", abort);
        services.setInstallingPackages(false);
      }
    }

    if (name === "inspect_python_structure") {
      return services.invoke<PythonStructure>("inspect_python_structure", { code: services.sourceCodeRef.current, pythonPath: services.pythonEnvironment?.path || null });
    }

    if (name === "check_voiceover") {
      const inspection = inspectVoiceovers(services.sourceCodeRef.current, services.voiceoverRoles.map((role) => role.id));
      services.setProblems((items) => [
        ...items.filter((problem) => problem.kind !== "plugin" || !problem.message.startsWith("配音：")),
        ...inspection.issues.map((message) => ({ id: services.problemIdRef.current++, kind: "plugin" as const, line: Number(message.match(/^第 (\d+) 行/)?.[1] || 0), message: `配音：${message}` })),
      ]);
      if (!inspection.valid) services.setActivePanel("problems");
      return inspection;
    }

    if (name === "get_voiceover_context") {
      const hasApiKey = await services.invoke<boolean>("has_tts_api_key", { config: services.ttsConfig });
      const expression = (value: TtsExpression) => ({ emotion: value.emotion, tone: value.tone, intonation: value.intonation, readingStyle: value.readingStyle, customInstruction: value.customInstruction });
      return {
        configured: Boolean(services.ttsConfig.baseUrl.trim() && hasApiKey),
        hasApiKey,
        provider: services.ttsConfig.provider,
        defaultVoice: { model: services.ttsConfig.model, voice: services.ttsConfig.voice, speed: services.ttsConfig.speed, ...expression(services.ttsConfig) },
        roles: [
          { id: "default", name: "默认旁白", model: services.ttsConfig.model, voice: services.ttsConfig.voice, speed: services.ttsConfig.speed, ...expression(services.ttsConfig) },
          ...services.voiceoverRoles.map((role) => ({ id: role.id, name: role.name, model: role.model, voice: role.voice, speed: role.speed, ...expression(role) })),
        ],
      };
    }

    if (name === "replace_code") {
      const code = checkedString(args, "code", true);
      const existingCode = codePreviewOriginal ?? services.sourceCodeRef.current;
      if (countFakeVoiceoverApis(code) > countFakeVoiceoverApis(existingCode)) throw new Error("不能在 Python 代码中调用 self.add_voiceover 或 self.add_synchronized_voiceover；请使用 AI 专用配音工具。");
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
      if (countFakeVoiceoverApis(nextCode) > countFakeVoiceoverApis(services.sourceCodeRef.current)) throw new Error("不能在 Python 代码中调用 self.add_voiceover 或 self.add_synchronized_voiceover；请使用 AI 专用配音工具。");
      await validateCandidateCode(nextCode);
      return { summary: toolSummary(args, "修改代码"), editCount: args.edits.length, ...commitCode(nextCode, signal) };
    }

    if (name === "insert_statements" || name === "replace_function_body" || name === "add_import") {
      const currentCode = services.sourceCodeRef.current;
      const structure = await services.invoke<PythonStructure>("inspect_python_structure", { code: currentCode, pythonPath: services.pythonEnvironment?.path || null });
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
      return { summary: toolSummary(args, name === "insert_statements" ? "插入语句" : name === "replace_function_body" ? "重建函数" : "添加导入"), ...commitCode(nextCode, signal) };
    }

    if (name === "add_voiceover" || name === "add_synchronized_voiceover") {
      const hasApiKey = Boolean(services.ttsApiKey.trim()) || await services.invoke<boolean>("has_tts_api_key", { config: services.ttsConfig }).catch(() => false);
      if (!services.ttsConfig.baseUrl.trim() || !hasApiKey) throw new Error("配音服务尚未配置完成。请让用户先在 Manim 设置的视频配音中填写百炼接口地址和 API Key。不要继续添加配音或尝试渲染。");
      const summary = toolSummary(args, name === "add_synchronized_voiceover" ? "添加同步配音" : "添加配音");
      const text = checkedString(args, "text");
      const roleId = typeof args.roleId === "string" && args.roleId.trim() ? args.roleId.trim() : "default";
      if (roleId !== "default" && !services.voiceoverRoles.some((role) => role.id === roleId)) throw new Error(`配音角色不存在：${roleId}。请重新调用 get_voiceover_context。`);
      const currentCode = services.sourceCodeRef.current;
      const nextCode = name === "add_voiceover"
        ? insertStandaloneVoiceover(currentCode, checkedString(args, "anchorText"), text, roleId, args.placement === "after" ? "after" : "before")
        : insertSynchronizedVoiceover(currentCode, checkedString(args, "targetText"), text, roleId);
      await validateCandidateCode(nextCode);
      return { summary, roleId, synchronized: name === "add_synchronized_voiceover", ...commitCode(nextCode, signal) };
    }

    if (name === "check_code") {
      const code = services.sourceCodeRef.current;
      try {
        await services.invoke("validate_python_code", { code, pythonPath: services.pythonEnvironment?.path || null });
        services.setCodeSyntaxDiagnostic(null);
        services.setProblems((items) => items.filter((problem) => problem.kind !== "syntax"));
        return { valid: true, lineCount: code ? code.split("\n").length : 0 };
      } catch (error) {
        const traceback = String(error);
        const diagnostic = parsePythonSyntaxDiagnostic(traceback, code);
        if (diagnostic) services.setCodeSyntaxDiagnostic(diagnostic);
        services.setProblems((items) => [
          ...items.filter((problem) => problem.kind !== "syntax"),
          { id: `syntax-${Date.now()}`, kind: "syntax", line: diagnostic?.line ?? 0, message: diagnostic?.message || traceback, suggestion: diagnostic?.suggestion },
        ]);
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
      return { formatted: true, changed, diff: changed ? createCodeChangePreview(previousCode, formatted) : "", lineCount: formatted ? formatted.split("\n").length : 0, __codeChange: changed ? { before: previousCode, after: formatted, sceneId: services.activeSceneIdRef.current, sceneName: services.sceneDocumentsRef.current.find((document) => document.id === services.activeSceneIdRef.current)?.name } : undefined };
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
      return { changed, diff: changed ? createCodeChangePreview(previousCode, code) : "", lineCount: code ? code.split("\n").length : 0, __codeChange: changed ? { before: previousCode, after: code, sceneId: services.activeSceneIdRef.current, sceneName: services.sceneDocumentsRef.current.find((document) => document.id === services.activeSceneIdRef.current)?.name } : undefined };
    }

    if (name === "inspect_rendered_output") {
      const renderOutput = services.manimRenderOutputRef.current;
      if (!renderOutput) throw new Error("当前场景还没有渲染结果");
      if (renderOutput.type === "image") {
        const result = await services.inspectImageQuality(renderOutput.url);
        const valid = Number(result.width) > 0 && Number(result.height) > 0 && result.blankImageLikely !== true;
        return { valid, type: renderOutput.type, scene: renderOutput.scene, path: renderOutput.path, ...result, ...(result.blankImageLikely === true ? { warning: "图片亮度几乎没有变化，疑似空白画面" } : {}) };
      }
      const result = await services.inspectVideoQuality(renderOutput.url);
      const valid = Number(result.durationSeconds) > 0 && Number(result.width) > 0 && Number(result.height) > 0 && result.blankFrameLikely !== true;
      return { valid, type: renderOutput.type, scene: renderOutput.scene, path: renderOutput.path, ...result, ...(result.blankFrameLikely === true ? { warning: "视频中点画面亮度几乎没有变化，疑似空白画面" } : {}) };
    }

    if (name === "run_project") {
      await services.runCode();
      return { started: services.taskId.current !== null, next: "使用 wait 后调用 get_execution_state" };
    }

    if (name === "render_manim") {
      const outputType = args.outputType === undefined ? services.manimRenderConfig.outputType : args.outputType;
      if (outputType !== "video" && outputType !== "image") throw new Error("outputType 必须是 video 或 image");
      if (args.transparentBackground !== undefined && typeof args.transparentBackground !== "boolean") throw new Error("transparentBackground 必须是布尔值");
      const transparentBackground = typeof args.transparentBackground === "boolean" ? args.transparentBackground : services.manimRenderConfig.transparentBackground;
      const hasImageWidth = args.imageWidth !== undefined;
      const hasImageHeight = args.imageHeight !== undefined;
      if (hasImageWidth !== hasImageHeight) throw new Error("自定义图片尺寸必须同时提供 imageWidth 和 imageHeight");
      if (hasImageWidth && (typeof args.imageWidth !== "number" || !Number.isInteger(args.imageWidth) || args.imageWidth < 64 || args.imageWidth > 8192 || typeof args.imageHeight !== "number" || !Number.isInteger(args.imageHeight) || args.imageHeight < 64 || args.imageHeight > 8192)) throw new Error("图片宽高必须是 64 到 8192 之间的整数");
      const imageWidth = hasImageWidth ? args.imageWidth as number : undefined;
      const imageHeight = hasImageHeight ? args.imageHeight as number : undefined;
      if (args.imageCaptureMode !== undefined && args.imageCaptureMode !== "final" && args.imageCaptureMode !== "animation") throw new Error("imageCaptureMode 必须是 final 或 animation");
      if (args.imageAnimationStep !== undefined && (typeof args.imageAnimationStep !== "number" || !Number.isInteger(args.imageAnimationStep) || args.imageAnimationStep < 1 || args.imageAnimationStep > 10_000)) throw new Error("imageAnimationStep 必须是 1 到 10000 之间的整数");
      const imageAnimationStep = typeof args.imageAnimationStep === "number" ? args.imageAnimationStep : services.manimRenderConfig.imageAnimationStep;
      const imageCaptureMode = args.imageCaptureMode === "final" || args.imageCaptureMode === "animation" ? args.imageCaptureMode : args.imageAnimationStep !== undefined ? "animation" : services.manimRenderConfig.imageCaptureMode;
      await services.renderManim({ outputType, transparentBackground, imageWidth, imageHeight, imageCaptureMode, imageAnimationStep });
      const started = services.manimTaskId.current !== null || services.manimRenderAttempt.current !== null;
      if (!started) throw new Error(services.problemsRef.current.at(-1)?.message || "Manim 渲染未能启动");
      return { started, outputType, ...(outputType === "image" ? { transparentBackground, imageCaptureMode, ...(imageCaptureMode === "animation" ? { imageAnimationStep } : {}), ...(imageWidth && imageHeight ? { imageWidth, imageHeight } : {}) } : {}), next: "使用 wait 后调用 get_execution_state" };
    }

    if (name === "get_execution_state") {
      const runningPython = services.taskId.current !== null;
      const rendering = services.manimTaskId.current !== null || services.manimRenderAttempt.current !== null;
      const pythonElapsedSeconds = runningPython && services.pythonRunStartedAt.current ? Math.max(0, Math.floor((Date.now() - services.pythonRunStartedAt.current) / 1000)) : services.pythonRunElapsed.current;
      const renderElapsedSeconds = rendering && services.manimRenderStartedAt.current ? Math.max(0, Math.floor((Date.now() - services.manimRenderStartedAt.current) / 1000)) : services.manimRenderElapsedRef.current;
      return {
        running: runningPython,
        rendering,
        pythonElapsedSeconds,
        renderElapsedSeconds,
        renderProgress: services.manimRenderProgressRef.current,
        output: services.outputRef.current.slice(-120).map(({ stream, data }) => ({ stream, data })),
        problems: services.problemsRef.current.map(({ kind, line, message, suggestion }) => ({ kind, line, message, suggestion })),
        renderOutput: services.manimRenderOutputRef.current ? { type: services.manimRenderOutputRef.current.type, scene: services.manimRenderOutputRef.current.scene, path: services.manimRenderOutputRef.current.path, transparentBackground: services.manimRenderOutputRef.current.transparentBackground } : null,
      };
    }

    if (name === "wait") {
      const requested = typeof args.milliseconds === "number" ? args.milliseconds : 1000;
      const milliseconds = Math.max(100, Math.min(10_000, Math.round(requested)));
      await waitWithSignal(milliseconds, signal);
      return { waitedMilliseconds: milliseconds, running: services.taskId.current !== null, rendering: services.manimTaskId.current !== null || services.manimRenderAttempt.current !== null };
    }

    if (name === "stop_execution") {
      if (services.manimTaskId.current !== null || services.manimRenderAttempt.current) await services.stopManimRender();
      if (services.taskId.current !== null) await services.stopCode();
      return { stopped: true };
    }

    if (name === "save_project") {
      const path = services.projectPathRef.current;
      const saved = path ? await services.writeProject(path, services.sourceCodeRef.current) : await services.saveProject();
      if (saved) services.setProjectDirty(false);
      return { saved, path: services.projectPathRef.current };
    }

    throw new Error(`未实现工具 ${name}`);
  };

  return executeTool;
}

export function createVisualPythonExecutionObserver(executeTool: AgentHost["executeTool"]): NonNullable<AgentHost["observeExecution"]> {
  return async (toolName, signal) => {
    let state = await executeTool("get_execution_state", {}, signal);
    const isRunning = () => toolName === "render_manim" ? state.rendering === true : state.running === true;
    while (isRunning()) {
      await waitWithSignal(500, signal);
      state = await executeTool("get_execution_state", {}, signal);
    }
    if (toolName === "render_manim" && state.rendering === false && !(Array.isArray(state.problems) && state.problems.length)) {
      const inspection = await executeTool("inspect_rendered_output", {}, signal);
      return { ...state, inspection };
    }
    return state;
  };
}
