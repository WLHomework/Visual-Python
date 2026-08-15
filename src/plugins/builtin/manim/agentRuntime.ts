import type { ManimRenderConfig } from "./renderConfig";
import { inspectVoiceovers, insertStandaloneVoiceover, insertSynchronizedVoiceover } from "../../../aiVoiceover";
import { validateStandaloneSceneSource } from "../../../sceneValidation";
import type { CodeDocument } from "../../../sceneDocuments";
import { extractManimSceneNames } from "./sceneNames";
import { createManimSceneDocument, manimSceneDocumentName, renameManimSceneDocument } from "./sceneDocuments";
import type { ProjectResource } from "../../../projectResources";
import type { ManimRenderAttempt } from "../../../manimRenderCancellation";
import type { AgentHost } from "../../../agentV2/types";
import type { PythonStructure } from "../../../pythonStructuredEdits";

type Ref<T> = { current: T };
type StateSetter<T> = (value: T | ((current: T) => T)) => void;
type Invoke = <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;
type Problem = { id: number | string; kind: "context" | "syntax" | "runtime" | "timeout" | "environment" | "plugin" | "resource"; line: number; message: string; blockId?: string; suggestion?: string };
type TtsExpression = { emotion: string; tone: string; intonation: string; readingStyle: string; customInstruction: string };
type TtsConfig = TtsExpression & { baseUrl: string; provider: string; model: string; voice: string; speed: number };
type VoiceoverRole = TtsExpression & { id: string; name: string; model: string; voice: string; speed: number };
type RenderOutput = { type: "video" | "image"; scene: string; path: string; url: string; workDir: string; transparentBackground: boolean };
type RenderOptions = { outputType?: "video" | "image"; transparentBackground?: boolean; imageWidth?: number; imageHeight?: number; imageCaptureMode?: "final" | "animation"; imageAnimationStep?: number };
type ProjectResourceStatus = { path: string; exists: boolean; size: number };

export type ManimAgentServices = {
  workspaceModeRef: Ref<string>;
  documentsRef: Ref<CodeDocument[]>;
  activeDocumentIdRef: Ref<string>;
  sourceCodeRef: Ref<string>;
  projectPathRef: Ref<string | null>;
  projectResourcesRef: Ref<ProjectResource[]>;
  taskId: Ref<number | null>;
  renderTaskId: Ref<number | null>;
  renderAttempt: Ref<ManimRenderAttempt | null>;
  renderOutputRef: Ref<RenderOutput | null>;
  problemsRef: Ref<Problem[]>;
  problemIdRef: Ref<number>;
  projectName: string;
  pythonEnvironment: { path: string; version: string } | null;
  voiceoverRoles: VoiceoverRole[];
  ttsConfig: TtsConfig;
  ttsApiKey: string;
  renderConfig: ManimRenderConfig;
  getCurrentCode: () => string;
  setDocuments: (documents: CodeDocument[]) => void;
  setActiveDocumentId: (documentId: string) => void;
  setSourceCode: (code: string) => void;
  setSourceCodeInitialized: (initialized: boolean) => void;
  setDirty: (dirty: boolean) => void;
  setProblems: StateSetter<Problem[]>;
  setActivePanel: (panel: "problems") => void;
  switchDocumentConsoleState: (fromDocumentId: string, toDocumentId: string) => void;
  updateRenderConfig: (patch: Partial<ManimRenderConfig>) => void;
  render: (options?: RenderOptions) => Promise<void>;
  inspectImageQuality: (url: string) => Promise<Record<string, unknown>>;
  inspectVideoQuality: (url: string) => Promise<Record<string, unknown>>;
  invoke: Invoke;
};

const isManimDocument = (code: string) => /(?:^|\n)\s*(?:from\s+manim\s+import|import\s+manim\b)/.test(code);
const checkedString = (args: Record<string, unknown>, key: string) => {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`参数 ${key} 必须是非空字符串`);
  return value;
};

const anchoredEdit = (before: string, after: string, anchor: string) => {
  const index = before.indexOf(anchor);
  const replacementLength = anchor.length + after.length - before.length;
  return { oldText: anchor, newText: after.slice(index, index + replacementLength) };
};

export function createManimCapabilityExecutor(services: ManimAgentServices, executeCoreTool: AgentHost["executeTool"]): AgentHost["executeTool"] {
  const requireCodeDocument = () => {
    if (services.workspaceModeRef.current !== "code") throw new Error("该 Manim 文档操作只适用于纯代码工作区");
    if (!isManimDocument(services.sourceCodeRef.current)) throw new Error("当前文档不是 Manim 文档，请先创建或打开 Manim 文档");
  };
  const persistDocuments = () => services.documentsRef.current.map((document) => document.id === services.activeDocumentIdRef.current ? { ...document, code: services.sourceCodeRef.current, name: manimSceneDocumentName(services.sourceCodeRef.current, document.name) } : document);

  return async (name, args, signal) => {
    if (signal.aborted) throw new Error("已停止生成");
    if (name === "list_scenes") {
      const documents = persistDocuments().filter((document) => isManimDocument(document.code));
      return { activeSceneId: services.activeDocumentIdRef.current, scenes: documents.map(({ id, name: sceneName, code }) => ({ id, name: sceneName, lineCount: code ? code.split("\n").length : 0, active: id === services.activeDocumentIdRef.current })) };
    }
    if (name === "get_scene") {
      const sceneId = checkedString(args, "sceneId");
      const document = persistDocuments().find((item) => item.id === sceneId);
      if (!document || !isManimDocument(document.code)) throw new Error(`Manim 场景不存在：${sceneId}`);
      return { id: document.id, name: manimSceneDocumentName(document.code, document.name), code: document.code, lineCount: document.code.split("\n").length, active: document.id === services.activeDocumentIdRef.current };
    }
    if (name === "switch_scene") {
      const sceneId = checkedString(args, "sceneId");
      const documents = persistDocuments();
      const document = documents.find((item) => item.id === sceneId);
      if (!document || !isManimDocument(document.code)) throw new Error(`Manim 场景不存在：${sceneId}`);
      if (services.taskId.current !== null || services.renderTaskId.current !== null || services.renderAttempt.current) throw new Error("请先等待或停止当前任务，再切换场景");
      services.switchDocumentConsoleState(services.activeDocumentIdRef.current, document.id);
      services.documentsRef.current = documents;
      services.activeDocumentIdRef.current = document.id;
      services.sourceCodeRef.current = document.code;
      services.setDocuments(documents);
      services.setActiveDocumentId(document.id);
      services.setSourceCode(document.code);
      services.updateRenderConfig({ selectedScene: extractManimSceneNames(document.code)[0] || document.name });
      return { switched: true, id: document.id, name: document.name, code: document.code };
    }
    if (name === "create_scene") {
      if (services.workspaceModeRef.current !== "code") throw new Error("Manim 场景文档只能在纯代码工作区创建");
      const documents = persistDocuments();
      const document = createManimSceneDocument(documents.map((item) => item.name), typeof args.name === "string" ? args.name : "NewScene");
      const nextDocuments = [...documents, document];
      services.switchDocumentConsoleState(services.activeDocumentIdRef.current, document.id);
      services.documentsRef.current = nextDocuments;
      services.activeDocumentIdRef.current = document.id;
      services.sourceCodeRef.current = document.code;
      services.setDocuments(nextDocuments);
      services.setActiveDocumentId(document.id);
      services.setSourceCode(document.code);
      services.setSourceCodeInitialized(true);
      services.setDirty(true);
      services.updateRenderConfig({ selectedScene: document.name });
      return { created: true, changed: true, id: document.id, name: document.name, code: document.code };
    }
    if (name === "rename_scene") {
      if (services.workspaceModeRef.current !== "code") throw new Error("该 Manim 文档操作只适用于纯代码工作区");
      const sceneId = checkedString(args, "sceneId");
      const documents = persistDocuments();
      const target = documents.find((item) => item.id === sceneId);
      if (!target || !isManimDocument(target.code)) throw new Error(`Manim 场景不存在：${sceneId}`);
      if (sceneId !== services.activeDocumentIdRef.current) {
        if (services.taskId.current !== null || services.renderTaskId.current !== null || services.renderAttempt.current) throw new Error("请先等待或停止当前任务，再切换场景");
        services.switchDocumentConsoleState(services.activeDocumentIdRef.current, target.id);
        services.documentsRef.current = documents;
        services.activeDocumentIdRef.current = target.id;
        services.sourceCodeRef.current = target.code;
        services.setDocuments(documents);
        services.setActiveDocumentId(target.id);
        services.setSourceCode(target.code);
      }
      const renamed = renameManimSceneDocument(target, checkedString(args, "name"));
      await services.invoke("validate_python_code", { code: renamed.code, pythonPath: services.pythonEnvironment?.path || null });
      const result = await executeCoreTool("replace_code", { summary: "重命名 Manim 场景", code: renamed.code }, signal);
      services.sourceCodeRef.current = renamed.code;
      services.documentsRef.current = documents.map((document) => document.id === sceneId ? renamed : document);
      services.setDocuments(services.documentsRef.current);
      services.updateRenderConfig({ selectedScene: renamed.name });
      return { ...result, renamed: true, id: sceneId, name: renamed.name };
    }
    if (name === "delete_scene") {
      const sceneId = checkedString(args, "sceneId");
      const documents = persistDocuments();
      const index = documents.findIndex((document) => document.id === sceneId && isManimDocument(document.code));
      if (index < 0) throw new Error(`Manim 场景不存在：${sceneId}`);
      if (documents.length === 1) throw new Error("工程至少需要保留一个代码文档");
      const target = documents[index];
      const remaining = documents.filter((document) => document.id !== sceneId);
      services.documentsRef.current = remaining;
      services.setDocuments(remaining);
      if (sceneId === services.activeDocumentIdRef.current) {
        const next = remaining[Math.min(index, remaining.length - 1)];
        services.switchDocumentConsoleState(sceneId, next.id);
        services.activeDocumentIdRef.current = next.id;
        services.sourceCodeRef.current = next.code;
        services.setActiveDocumentId(next.id);
        services.setSourceCode(next.code);
        services.updateRenderConfig({ selectedScene: extractManimSceneNames(next.code)[0] || next.name });
      }
      services.setDirty(true);
      return { deleted: true, changed: true, id: sceneId, name: target.name };
    }
    if (name === "validate_scene") {
      const code = services.getCurrentCode();
      const document = services.documentsRef.current.find((item) => item.id === services.activeDocumentIdRef.current);
      const generatedSceneName = extractManimSceneNames(code)[0] || "CurrentScene";
      const base = validateStandaloneSceneSource(code, document?.name || generatedSceneName, services.projectResourcesRef.current, services.voiceoverRoles.map((role) => role.id));
      const issues = [...base.issues];
      try { await services.invoke("validate_python_code", { code, pythonPath: services.pythonEnvironment?.path || null }); }
      catch (error) { issues.push({ code: "python-syntax", severity: "error" as const, message: String(error) }); }
      if (base.kind === "manim" && base.sceneNames.length === 1 && !issues.some((issue) => issue.code === "python-syntax")) {
        const structure = await services.invoke<PythonStructure>("inspect_python_structure", { code, pythonPath: services.pythonEnvironment?.path || null });
        const sceneClass = structure.classes.find((item) => item.name === base.sceneNames[0]);
        const constructCount = sceneClass?.methods.filter((method) => method.name === "construct").length ?? 0;
        if (constructCount === 0) issues.push({ code: "missing-construct", severity: "error", message: `场景类 ${base.sceneNames[0]} 缺少 construct 方法` });
        else if (constructCount > 1) issues.push({ code: "duplicate-construct", severity: "error", message: `场景类 ${base.sceneNames[0]} 包含多个 construct 方法` });
      }
      const referencedResources = [...code.matchAll(/resource:\/\/([A-Za-z0-9_-]+)/g)]
        .map((match) => services.projectResourcesRef.current.find((resource) => resource.id === match[1]))
        .filter((resource): resource is ProjectResource => Boolean(resource));
      if (services.projectPathRef.current && referencedResources.length) {
        const statuses = await services.invoke<ProjectResourceStatus[]>("inspect_project_resources", { projectPath: services.projectPathRef.current, resourcePaths: referencedResources.map((resource) => resource.path) });
        for (const status of statuses.filter((item) => !item.exists)) issues.push({ code: "missing-resource-file", severity: "error", message: `工程资源文件不存在：${status.path}` });
      }
      return { valid: base.kind === "manim" && !issues.some((issue) => issue.severity === "error"), kind: base.kind, sceneId: document?.id, sceneName: document?.name || base.sceneNames[0], issues };
    }
    if (name === "get_voiceover_context") {
      const hasApiKey = await services.invoke<boolean>("has_tts_api_key", { config: services.ttsConfig });
      const expression = (value: TtsExpression) => ({ emotion: value.emotion, tone: value.tone, intonation: value.intonation, readingStyle: value.readingStyle, customInstruction: value.customInstruction });
      return { configured: Boolean(services.ttsConfig.baseUrl.trim() && hasApiKey), hasApiKey, provider: services.ttsConfig.provider, defaultVoice: { model: services.ttsConfig.model, voice: services.ttsConfig.voice, speed: services.ttsConfig.speed, ...expression(services.ttsConfig) }, roles: [{ id: "default", name: "默认旁白", model: services.ttsConfig.model, voice: services.ttsConfig.voice, speed: services.ttsConfig.speed, ...expression(services.ttsConfig) }, ...services.voiceoverRoles.map((role) => ({ ...role, ...expression(role) }))] };
    }
    if (name === "check_voiceover") {
      requireCodeDocument();
      const inspection = inspectVoiceovers(services.sourceCodeRef.current, services.voiceoverRoles.map((role) => role.id));
      services.setProblems((items) => [...items.filter((problem) => problem.kind !== "plugin" || !problem.message.startsWith("配音：")), ...inspection.issues.map((message) => ({ id: services.problemIdRef.current++, kind: "plugin" as const, line: Number(message.match(/^第 (\d+) 行/)?.[1] || 0), message: `配音：${message}` }))]);
      if (!inspection.valid) services.setActivePanel("problems");
      return inspection;
    }
    if (name === "add_voiceover" || name === "add_synchronized_voiceover") {
      requireCodeDocument();
      const hasApiKey = Boolean(services.ttsApiKey.trim()) || await services.invoke<boolean>("has_tts_api_key", { config: services.ttsConfig }).catch(() => false);
      if (!services.ttsConfig.baseUrl.trim() || !hasApiKey) throw new Error("配音服务尚未配置完成，请先在 Manim 设置的视频配音中完成配置");
      const text = checkedString(args, "text");
      const roleId = typeof args.roleId === "string" && args.roleId.trim() ? args.roleId.trim() : "default";
      if (roleId !== "default" && !services.voiceoverRoles.some((role) => role.id === roleId)) throw new Error(`配音角色不存在：${roleId}`);
      const currentCode = services.sourceCodeRef.current;
      const anchor = checkedString(args, name === "add_voiceover" ? "anchorText" : "targetText");
      const nextCode = name === "add_voiceover" ? insertStandaloneVoiceover(currentCode, anchor, text, roleId, args.placement === "after" ? "after" : "before") : insertSynchronizedVoiceover(currentCode, anchor, text, roleId);
      const roles = services.voiceoverRoles.map((role) => role.id);
      const beforeInspection = inspectVoiceovers(currentCode, roles);
      const afterInspection = inspectVoiceovers(nextCode, roles);
      const markerAdded = name === "add_voiceover"
        ? afterInspection.cueCount === beforeInspection.cueCount + 1
        : afterInspection.synchronizedCount === beforeInspection.synchronizedCount + 1;
      if (!markerAdded) throw new Error("未能创建配音标记");
      return executeCoreTool("edit_code", { summary: typeof args.summary === "string" ? args.summary : "添加 Manim 配音", edits: [anchoredEdit(currentCode, nextCode, anchor)] }, signal);
    }
    if (name === "render_manim") {
      const outputType = args.outputType === undefined ? services.renderConfig.outputType : args.outputType;
      if (outputType !== "video" && outputType !== "image") throw new Error("outputType 必须是 video 或 image");
      if (args.transparentBackground !== undefined && typeof args.transparentBackground !== "boolean") throw new Error("transparentBackground 必须是布尔值");
      const hasWidth = args.imageWidth !== undefined;
      const hasHeight = args.imageHeight !== undefined;
      if (hasWidth !== hasHeight) throw new Error("自定义图片尺寸必须同时提供 imageWidth 和 imageHeight");
      if (hasWidth && (typeof args.imageWidth !== "number" || !Number.isInteger(args.imageWidth) || args.imageWidth < 64 || args.imageWidth > 8192
        || typeof args.imageHeight !== "number" || !Number.isInteger(args.imageHeight) || args.imageHeight < 64 || args.imageHeight > 8192)) throw new Error("图片宽高必须是 64 到 8192 之间的整数");
      if (args.imageCaptureMode !== undefined && args.imageCaptureMode !== "final" && args.imageCaptureMode !== "animation") throw new Error("imageCaptureMode 必须是 final 或 animation");
      if (args.imageAnimationStep !== undefined && (typeof args.imageAnimationStep !== "number" || !Number.isInteger(args.imageAnimationStep) || args.imageAnimationStep < 1 || args.imageAnimationStep > 10_000)) throw new Error("imageAnimationStep 必须是 1 到 10000 之间的整数");
      const options: RenderOptions = { outputType, transparentBackground: typeof args.transparentBackground === "boolean" ? args.transparentBackground : services.renderConfig.transparentBackground };
      if (hasWidth && hasHeight) { options.imageWidth = Number(args.imageWidth); options.imageHeight = Number(args.imageHeight); }
      options.imageCaptureMode = args.imageCaptureMode === "final" || args.imageCaptureMode === "animation" ? args.imageCaptureMode : args.imageAnimationStep !== undefined ? "animation" : services.renderConfig.imageCaptureMode;
      options.imageAnimationStep = typeof args.imageAnimationStep === "number" ? args.imageAnimationStep : services.renderConfig.imageAnimationStep;
      await services.render(options);
      const started = services.renderTaskId.current !== null || services.renderAttempt.current !== null;
      if (!started) throw new Error(services.problemsRef.current.at(-1)?.message || "Manim 渲染未能启动");
      return { started, outputType };
    }
    if (name === "inspect_rendered_output") {
      const output = services.renderOutputRef.current;
      if (!output) throw new Error("当前场景还没有渲染结果");
      const result = output.type === "image" ? await services.inspectImageQuality(output.url) : await services.inspectVideoQuality(output.url);
      const valid = Number(result.width) > 0 && Number(result.height) > 0 && (output.type === "image" ? result.blankImageLikely !== true : Number(result.durationSeconds) > 0 && result.blankFrameLikely !== true);
      return { valid, type: output.type, scene: output.scene, path: output.path, ...result };
    }
    throw new Error(`Manim 插件未实现能力：${name}`);
  };
}
