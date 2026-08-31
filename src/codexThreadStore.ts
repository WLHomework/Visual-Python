import type { AiModelConfig } from "./aiConfig";

type CodexThreadRecord = {
  threadId: string;
  updatedAt: number;
};

type CodexThreadStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const storageKey = "visual-python:codex-thread-store:v1";
const maxStoredThreads = 48;

function getStorage(storage?: CodexThreadStorage): CodexThreadStorage | undefined {
  if (storage) return storage;
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

function threadKey(targetId: string, config: AiModelConfig): string {
  return `${targetId.trim()}\n${config.baseUrl.trim().replace(/\/+$/, "")}\n${config.model.trim()}`;
}

function readRecords(storage: CodexThreadStorage): Record<string, CodexThreadRecord> {
  try {
    const value: unknown = JSON.parse(storage.getItem(storageKey) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Partial<CodexThreadRecord>;
      return typeof record.threadId === "string" && record.threadId.trim() && typeof record.updatedAt === "number"
        ? [[key, { threadId: record.threadId, updatedAt: record.updatedAt }]]
        : [];
    }));
  } catch {
    return {};
  }
}

function writeRecords(storage: CodexThreadStorage, records: Record<string, CodexThreadRecord>): void {
  storage.setItem(storageKey, JSON.stringify(records));
}

export function getCodexThread(targetId: string | undefined, config: AiModelConfig, storage?: CodexThreadStorage): string | undefined {
  const normalizedTarget = targetId?.trim();
  const activeStorage = getStorage(storage);
  if (!normalizedTarget || !activeStorage) return undefined;
  return readRecords(activeStorage)[threadKey(normalizedTarget, config)]?.threadId;
}

export function saveCodexThread(targetId: string, config: AiModelConfig, threadId: string, storage?: CodexThreadStorage): void {
  const normalizedTarget = targetId.trim();
  const normalizedThreadId = threadId.trim();
  const activeStorage = getStorage(storage);
  if (!normalizedTarget || !normalizedThreadId || !activeStorage) return;
  try {
    const records = readRecords(activeStorage);
    const key = threadKey(normalizedTarget, config);
    records[key] = { threadId: normalizedThreadId, updatedAt: Date.now() };
    const keys = Object.keys(records);
    if (keys.length > maxStoredThreads) {
      for (const staleKey of keys.sort((left, right) => records[left].updatedAt - records[right].updatedAt).slice(0, keys.length - maxStoredThreads)) {
        delete records[staleKey];
      }
    }
    writeRecords(activeStorage, records);
  } catch {
    // Persistence is an optimization; a storage quota must not fail a task.
  }
}

export function clearCodexThread(targetId: string, config: AiModelConfig, storage?: CodexThreadStorage): void {
  const activeStorage = getStorage(storage);
  if (!activeStorage) return;
  try {
    const records = readRecords(activeStorage);
    delete records[threadKey(targetId.trim(), config)];
    writeRecords(activeStorage, records);
  } catch {
    // A stale browser storage entry is harmless and can be retried later.
  }
}
