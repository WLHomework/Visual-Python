import { manimPlugin } from "./builtin/manim";
import { numpyPlugin } from "./builtin/numpy";
import { pandasPlugin } from "./builtin/pandas";
import { matplotlibPlugin } from "./builtin/matplotlib";
import { PluginRegistry } from "./core/pluginRegistry";
import type { PluginCompatibilityIssue, PluginProjectRequirement } from "./api/types";
import type { AgentCapability } from "../agentV2/types";

export const pluginRegistry = new PluginRegistry();

let initialization: Promise<void> | null = null;
const preferenceKey = "visual-python:plugins";
export const corePluginIds = new Set([manimPlugin.manifest.id, numpyPlugin.manifest.id, pandasPlugin.manifest.id, matplotlibPlugin.manifest.id]);
export const isCorePlugin = (pluginId: string) => corePluginIds.has(pluginId);

const readPreferences = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(preferenceKey) || "{}"); }
  catch { return {}; }
};

const writePreference = (pluginId: string, enabled: boolean) => {
  const preferences = readPreferences();
  preferences[pluginId] = enabled;
  localStorage.setItem(preferenceKey, JSON.stringify(preferences));
};

export const getPluginEnabledPreference = (pluginId: string) => isCorePlugin(pluginId) || (readPreferences()[pluginId] ?? false);

export function getActiveAgentCapabilities(): AgentCapability[] {
  return pluginRegistry.getRecords()
    .filter((record) => record.state === "active" && record.plugin.manifest.agent)
    .map((record) => ({
      id: record.plugin.manifest.id,
      name: record.plugin.manifest.name,
      description: record.plugin.manifest.agent!.description,
      tools: pluginRegistry.getAgentToolNames(record.plugin.manifest.id),
      fileTypes: record.plugin.manifest.agent!.fileTypes,
      detect: record.plugin.manifest.agent!.detect,
      codegen: record.plugin.manifest.agent!.codegen,
      active: true,
    }));
}

export function initializePlugins() {
  if (initialization) return initialization;
  pluginRegistry.register(manimPlugin);
  pluginRegistry.register(numpyPlugin);
  pluginRegistry.register(pandasPlugin);
  pluginRegistry.register(matplotlibPlugin);
  writePreference(manimPlugin.manifest.id, true);
  writePreference(numpyPlugin.manifest.id, true);
  writePreference(pandasPlugin.manifest.id, true);
  writePreference(matplotlibPlugin.manifest.id, true);
  initialization = (async () => {
    await pluginRegistry.activate(manimPlugin.manifest.id);
    await pluginRegistry.activate(numpyPlugin.manifest.id);
    await pluginRegistry.activate(pandasPlugin.manifest.id);
    await pluginRegistry.activate(matplotlibPlugin.manifest.id);
  })();
  return initialization;
}

export async function setPluginEnabled(pluginId: string, enabled: boolean) {
  if (isCorePlugin(pluginId)) {
    writePreference(pluginId, true);
    await pluginRegistry.activate(pluginId);
    return;
  }
  writePreference(pluginId, enabled);
  if (enabled) await pluginRegistry.activate(pluginId);
  else await pluginRegistry.deactivate(pluginId);
}

const versionParts = (version: string) => version.split(/[.-]/).slice(0, 3).map((part) => Number(part) || 0);
const isCompatibleVersion = (installed: string, required: string) => {
  const current = versionParts(installed);
  const needed = versionParts(required);
  if (current[0] !== needed[0]) return false;
  for (let index = 1; index < 3; index += 1) {
    if (current[index] !== needed[index]) return current[index] > needed[index];
  }
  return true;
};

export async function ensureProjectPlugins(requirements: PluginProjectRequirement[] = []): Promise<PluginCompatibilityIssue[]> {
  const issues: PluginCompatibilityIssue[] = [];
  for (const requirement of requirements) {
    let record = pluginRegistry.getRecord(requirement.id);
    if (!record) {
      issues.push({ pluginId: requirement.id, kind: "missing", message: `缺少插件 ${requirement.id}（需要 v${requirement.version}）` });
      continue;
    }
    if (!isCompatibleVersion(record.plugin.manifest.version, requirement.version)) {
      issues.push({ pluginId: requirement.id, kind: "version", message: `插件 ${requirement.id} 版本不兼容：已安装 v${record.plugin.manifest.version}，需要 v${requirement.version}` });
      continue;
    }
    if (record.state !== "active") {
      await setPluginEnabled(requirement.id, true);
      record = pluginRegistry.getRecord(requirement.id);
    }
    if (record?.state !== "active") issues.push({ pluginId: requirement.id, kind: "activation", message: `插件 ${requirement.id} 激活失败：${record?.error || "未知错误"}` });
  }
  return issues;
}
