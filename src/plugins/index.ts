import { manimPlugin } from "./builtin/manim";
import { PluginRegistry } from "./core/pluginRegistry";
import type { PluginCompatibilityIssue, PluginProjectRequirement } from "./api/types";

export const pluginRegistry = new PluginRegistry();

let initialization: Promise<void> | null = null;
const preferenceKey = "visual-python:plugins";

const readPreferences = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(preferenceKey) || "{}"); }
  catch { return {}; }
};

const writePreference = (pluginId: string, enabled: boolean) => {
  const preferences = readPreferences();
  preferences[pluginId] = enabled;
  localStorage.setItem(preferenceKey, JSON.stringify(preferences));
};

export const getPluginEnabledPreference = (pluginId: string) => readPreferences()[pluginId] ?? false;

export function initializePlugins() {
  if (initialization) return initialization;
  pluginRegistry.register(manimPlugin);
  const enabled = readPreferences()[manimPlugin.manifest.id] ?? true;
  initialization = enabled
    ? pluginRegistry.activate(manimPlugin.manifest.id)
    : pluginRegistry.deactivate(manimPlugin.manifest.id);
  return initialization;
}

export async function setPluginEnabled(pluginId: string, enabled: boolean) {
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
