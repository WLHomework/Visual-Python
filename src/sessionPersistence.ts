import type { DraftProject } from "./projectFile";

// 会话持久化：工作草稿、启动恢复的工程与 AI 对话存储共用这一层，
// 统一处理存储键格式、配额降级和“最近使用”清理。

export const WORKSPACE_DRAFT_STORAGE_KEY = "visual-python:draft";
export const LAST_PROJECT_STORAGE_KEY = "visual-python:last-project";
export const RESTORE_LAST_PROJECT_STORAGE_KEY = "visual-python:restore-last-project";
export const CONVERSATION_STORES_PREFIX = "visual-python:ai-conversations:";

// 对话存储按工程分桶、没有自然过期；启动时按最近使用保留一批，
// 数量需覆盖“最近工程”列表（8 个）并留出余量。
export const maxKeptConversationStores = 16;

export type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function isStorageQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "QuotaExceededError"
    || error.name === "NS_ERROR_DOM_QUOTA_REACHED"
    || ("code" in error && (error.code === 22 || error.code === 1014));
}

export function conversationStoreKey(scope: string): string {
  return `${CONVERSATION_STORES_PREFIX}${encodeURIComponent(scope)}`;
}

function readConversationStoreUsage(storage: SessionStorage, key: string): { timestamp: number; hasRuns: boolean } | null {
  try {
    const value = JSON.parse(storage.getItem(key) || "null") as { conversations?: Array<{ updatedAt?: unknown; runs?: unknown }> } | null;
    if (!Array.isArray(value?.conversations) || !value.conversations.length) return null;
    let timestamp = 0;
    let hasRuns = false;
    for (const conversation of value.conversations) {
      if (typeof conversation?.updatedAt === "number") timestamp = Math.max(timestamp, conversation.updatedAt);
      if (Array.isArray(conversation?.runs) && conversation.runs.length) hasRuns = true;
    }
    return { timestamp, hasRuns };
  } catch {
    return null;
  }
}

export function conversationStoreTimestamp(storage: SessionStorage, key: string): number {
  return readConversationStoreUsage(storage, key)?.timestamp ?? 0;
}

function listConversationStoreKeys(storage: SessionStorage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(CONVERSATION_STORES_PREFIX)) keys.push(key);
  }
  return keys;
}

/** 清掉没有对话内容的存储桶，并按最近使用保留一批非空对话；返回被删除的键。 */
export function pruneConversationStores(storage: SessionStorage, options: { keep?: number; protect?: string[] } = {}): string[] {
  const protect = new Set(options.protect ?? []);
  const limit = options.keep ?? maxKeptConversationStores;
  const kept: Array<{ key: string; timestamp: number }> = [];
  const removed: string[] = [];
  for (const key of listConversationStoreKeys(storage)) {
    if (protect.has(key)) continue;
    const usage = readConversationStoreUsage(storage, key);
    if (!usage?.hasRuns) {
      removed.push(key);
      continue;
    }
    kept.push({ key, timestamp: usage.timestamp });
  }
  kept.sort((left, right) => right.timestamp - left.timestamp);
  removed.push(...kept.slice(limit).map((entry) => entry.key));
  for (const key of removed) storage.removeItem(key);
  return removed;
}

/** 持久化工作草稿；配额不足时先腾退最旧的对话存储再重试。 */
export function persistWorkspaceDraft(storage: SessionStorage, draft: DraftProject, options: { protectConversationScope?: string } = {}): boolean {
  let serialized: string;
  try {
    serialized = JSON.stringify(draft);
  } catch {
    return false;
  }
  const write = () => storage.setItem(WORKSPACE_DRAFT_STORAGE_KEY, serialized);
  try {
    write();
    return true;
  } catch (error) {
    if (!isStorageQuotaError(error)) return false;
  }
  const protectedKey = options.protectConversationScope ? conversationStoreKey(options.protectConversationScope) : null;
  const candidates = listConversationStoreKeys(storage)
    .filter((key) => key !== protectedKey)
    .sort((left, right) => conversationStoreTimestamp(storage, left) - conversationStoreTimestamp(storage, right));
  for (const key of candidates) {
    try {
      storage.removeItem(key);
      write();
      return true;
    } catch (error) {
      if (!isStorageQuotaError(error)) return false;
    }
  }
  return false;
}

export type LastProject = { path: string; name: string };

export function readLastProject(storage: SessionStorage): LastProject | null {
  try {
    const value = JSON.parse(storage.getItem(LAST_PROJECT_STORAGE_KEY) || "null") as Partial<LastProject> | null;
    if (!value || typeof value.path !== "string" || !value.path || typeof value.name !== "string") return null;
    return { path: value.path, name: value.name };
  } catch {
    return null;
  }
}

export function writeLastProject(storage: SessionStorage, project: LastProject): void {
  try {
    storage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify(project));
  } catch {
    // 启动恢复不是关键路径，配额不足时静默跳过。
  }
}

export function clearLastProject(storage: SessionStorage): void {
  storage.removeItem(LAST_PROJECT_STORAGE_KEY);
}

export function shouldRestoreLastProject(storage: SessionStorage): boolean {
  return storage.getItem(RESTORE_LAST_PROJECT_STORAGE_KEY) !== "false";
}

export function setRestoreLastProjectEnabled(storage: SessionStorage, enabled: boolean): void {
  if (enabled) storage.removeItem(RESTORE_LAST_PROJECT_STORAGE_KEY);
  else storage.setItem(RESTORE_LAST_PROJECT_STORAGE_KEY, "false");
}

/** 决定启动时自动打开的工程：系统传入的工程优先，其次上次工程（有可恢复草稿时不打开）。 */
export function resolveStartupProjectPath(storage: SessionStorage, osProjectPath: string | null): string | null {
  if (osProjectPath) return osProjectPath;
  if (storage.getItem(WORKSPACE_DRAFT_STORAGE_KEY)) return null;
  if (!shouldRestoreLastProject(storage)) return null;
  return readLastProject(storage)?.path ?? null;
}
