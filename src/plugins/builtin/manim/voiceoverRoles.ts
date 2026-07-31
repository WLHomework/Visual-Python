import { bailianTtsModels, bailianVoiceCloneModel, getBailianVoiceOptions, isBailianClonedVoice, normalizeTtsExpression, type TtsExpressionConfig } from "./ttsConfig";

export type VoiceoverRole = TtsExpressionConfig & {
  id: string;
  name: string;
  model: string;
  voice: string;
  speed: number;
  previewText: string;
};

const storageKey = "visual-python:manim-voiceover-roles";
const listeners = new Set<(roles: VoiceoverRole[]) => void>();
let projectRoles: VoiceoverRole[] | null = null;

const normalizeRole = (value: Partial<VoiceoverRole>, index: number): VoiceoverRole => {
  const requestedModel = typeof value.model === "string" ? value.model : "";
  const requestedVoice = typeof value.voice === "string" ? value.voice.trim().slice(0, 160) : "";
  const cloned = isBailianClonedVoice(requestedModel, requestedVoice);
  const model = cloned ? bailianVoiceCloneModel : bailianTtsModels.some((item) => item.id === requestedModel) ? requestedModel : bailianTtsModels[0].id;
  const voices = getBailianVoiceOptions(model);
  const voice = cloned ? requestedVoice : voices.some((item) => item.id === requestedVoice) ? requestedVoice : voices[0].id;
  const speed = Number(value.speed);
  const expression = normalizeTtsExpression(value);
  return {
    id: typeof value.id === "string" && /^[a-zA-Z0-9_-]{1,48}$/.test(value.id) ? value.id : `role-${Date.now()}-${index}`,
    name: typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 24) : `角色 ${index + 1}`,
    model,
    voice,
    speed: Number.isFinite(speed) ? Math.min(2, Math.max(0.5, Math.round(speed * 20) / 20)) : 1,
    previewText: typeof value.previewText === "string" ? value.previewText.slice(0, 500) : "",
    ...expression,
  };
};

const normalizeRoles = (values: Partial<VoiceoverRole>[]) => {
  const usedIds = new Set<string>();
  return values.slice(0, 20).map((value, index) => {
    const role = normalizeRole(value, index);
    if (usedIds.has(role.id)) role.id = `role-${Date.now()}-${index}`;
    usedIds.add(role.id);
    return role;
  });
};

export function getVoiceoverRoles(): VoiceoverRole[] {
  if (projectRoles) return projectRoles.map((role) => ({ ...role }));
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(value) ? normalizeRoles(value) : [];
  } catch {
    return [];
  }
}

export function saveVoiceoverRoles(roles: VoiceoverRole[]): VoiceoverRole[] {
  const normalized = normalizeRoles(roles);
  if (projectRoles) projectRoles = normalized;
  else localStorage.setItem(storageKey, JSON.stringify(normalized));
  listeners.forEach((listener) => listener(normalized));
  return normalized;
}

export function saveProjectVoiceoverRoles(): VoiceoverRole[] | undefined {
  if (projectRoles !== null) return normalizeRoles(projectRoles);
  const roles = getVoiceoverRoles();
  return roles.length ? normalizeRoles(roles) : undefined;
}

export function loadProjectVoiceoverRoles(value: unknown): void {
  projectRoles = Array.isArray(value) ? normalizeRoles(value as Partial<VoiceoverRole>[]) : [];
  listeners.forEach((listener) => listener(getVoiceoverRoles()));
}

export function clearProjectVoiceoverRoles(): void {
  projectRoles = null;
  listeners.forEach((listener) => listener(getVoiceoverRoles()));
}

export function serializeVoiceoverRoles(roles: VoiceoverRole[]): string {
  return JSON.stringify({ version: 1, roles: normalizeRoles(roles) }, null, 2);
}

export function parseVoiceoverRolesFile(source: string): VoiceoverRole[] {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("角色文件不是有效的 JSON 文件");
  }
  const file = value as { version?: unknown; roles?: unknown } | null;
  if (!file || file.version !== 1 || !Array.isArray(file.roles)) throw new Error("无法识别这个配音角色文件");
  if (file.roles.length > 20) throw new Error("一个角色文件最多包含 20 个角色");
  return normalizeRoles(file.roles as Partial<VoiceoverRole>[]);
}

export function subscribeVoiceoverRoles(listener: (roles: VoiceoverRole[]) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function voiceoverRoleOptions(): Array<[string, string]> {
  return [["默认旁白", "default"], ...getVoiceoverRoles().map((role) => [role.name, role.id] as [string, string])];
}

export function resolveVoiceoverRole(id: string | undefined): VoiceoverRole | null {
  if (!id || id === "default") return null;
  return getVoiceoverRoles().find((role) => role.id === id) ?? null;
}
