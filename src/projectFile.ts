import type { PluginProjectState } from "./plugins/api/types";
import type { ProjectResource, ProjectResourceType } from "./projectResources";
import type { WorkspaceMode } from "./workspaceMode";
import { validateSceneDocuments, type SceneDocument } from "./sceneDocuments";

export type ProjectFile = {
  version: 1;
  name: string;
  workspace: object;
  plugins?: PluginProjectState;
  sourceCode?: string;
  sceneDocuments?: SceneDocument[];
  activeSceneId?: string;
  workspaceMode?: WorkspaceMode;
  blockInputLayout?: "inline" | "external";
  resources?: ProjectResource[];
};

export type DraftProject = ProjectFile & { path: string | null; savedAt: number };

const resourceTypes = new Set<ProjectResourceType>(["audio", "image", "font", "other"]);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const validRelativeResourcePath = (value: string) => {
  if (!value || value.length > 500 || /^(?:[A-Za-z]:[\\/]|[\\/])/.test(value)) return false;
  const parts = value.replaceAll("\\", "/").split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
};

const parsePlugins = (value: unknown): PluginProjectState | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !Array.isArray(value.requirements) || !isRecord(value.data)) throw new Error("工程插件数据无效");
  const requirements = value.requirements.map((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.version !== "string") throw new Error("工程插件依赖无效");
    return { id: entry.id, version: entry.version };
  });
  return { requirements, data: value.data };
};

const parseResources = (value: unknown): ProjectResource[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 2000) throw new Error("工程资源列表无效");
  const ids = new Set<string>();
  const paths = new Set<string>();
  return value.map((entry) => {
    if (!isRecord(entry)
      || typeof entry.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(entry.id)
      || typeof entry.type !== "string" || !resourceTypes.has(entry.type as ProjectResourceType)
      || typeof entry.path !== "string" || !validRelativeResourcePath(entry.path)
      || typeof entry.originalName !== "string" || !entry.originalName || entry.originalName.length > 500
      || typeof entry.size !== "number" || !Number.isSafeInteger(entry.size) || entry.size < 0) {
      throw new Error("工程包含无效的资源记录");
    }
    if (ids.has(entry.id) || paths.has(entry.path)) throw new Error("工程包含重复的资源记录");
    ids.add(entry.id);
    paths.add(entry.path);
    return { id: entry.id, type: entry.type as ProjectResourceType, path: entry.path, originalName: entry.originalName, size: entry.size };
  });
};

export function validateProjectFile(value: unknown): ProjectFile {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.workspace)) throw new Error("不支持的工程格式");
  if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 260) throw new Error("工程名称无效");
  if (value.sourceCode !== undefined && typeof value.sourceCode !== "string") throw new Error("工程源代码无效");
  const sceneDocuments = validateSceneDocuments(value.sceneDocuments);
  if (value.activeSceneId !== undefined && typeof value.activeSceneId !== "string") throw new Error("工程当前场景无效");
  if (sceneDocuments && value.activeSceneId !== undefined && !sceneDocuments.some((document) => document.id === value.activeSceneId)) throw new Error("工程当前场景不存在");
  if (value.workspaceMode !== undefined && !["visual", "split", "code"].includes(String(value.workspaceMode))) throw new Error("工程工作区模式无效");
  if (value.blockInputLayout !== undefined && !["inline", "external"].includes(String(value.blockInputLayout))) throw new Error("积木输入布局无效");
  const plugins = parsePlugins(value.plugins);
  const resources = parseResources(value.resources);
  return {
    version: 1,
    name: value.name,
    workspace: value.workspace,
    ...(plugins ? { plugins } : {}),
    ...(typeof value.sourceCode === "string" ? { sourceCode: value.sourceCode } : {}),
    ...(sceneDocuments ? { sceneDocuments } : {}),
    ...(typeof value.activeSceneId === "string" ? { activeSceneId: value.activeSceneId } : {}),
    ...(value.workspaceMode ? { workspaceMode: value.workspaceMode as WorkspaceMode } : {}),
    ...(value.blockInputLayout ? { blockInputLayout: value.blockInputLayout as "inline" | "external" } : {}),
    ...(resources ? { resources } : {}),
  };
}

export function parseProjectFile(source: string): ProjectFile {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("工程文件不是有效的 JSON 文件");
  }
  return validateProjectFile(value);
}

export function parseDraftProject(source: string): DraftProject {
  const value = JSON.parse(source) as unknown;
  const project = validateProjectFile(value);
  if (!isRecord(value)
    || (value.path !== null && typeof value.path !== "string")
    || typeof value.savedAt !== "number" || !Number.isFinite(value.savedAt)) {
    throw new Error("工程草稿数据无效");
  }
  return { ...project, path: value.path as string | null, savedAt: value.savedAt };
}
