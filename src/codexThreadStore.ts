import type { AiModelConfig } from "./aiConfig";

type CodexThreadSlot = {
  threadId: string;
  updatedAt: number;
  signature: string;
};

type CodexThreadRecord = {
  slots: CodexThreadSlot[];
};

type CodexThreadStore = Record<string, CodexThreadRecord>;

type CodexThreadStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const storageKey = "visual-python:codex-thread-store:v2";
const legacyStorageKey = "visual-python:codex-thread-store:v1";
const maxStoredThreads = 96;
const maxSlotsPerTarget = 6;
// Legacy entries were saved without a tool signature and must never match a real one.
const emptySignature = "";

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

export function createDynamicToolsSignature(tools: unknown[] | undefined): string {
  const normalized = [...(tools || [])].sort((left, right) => {
    const leftName = left && typeof left === "object" && typeof (left as Record<string, unknown>).name === "string" ? (left as Record<string, unknown>).name as string : "";
    const rightName = right && typeof right === "object" && typeof (right as Record<string, unknown>).name === "string" ? (right as Record<string, unknown>).name as string : "";
    return leftName.localeCompare(rightName);
  });
  return stableSerialize(normalized);
}

function getStorage(storage?: CodexThreadStorage): CodexThreadStorage | undefined {
  if (storage) return storage;
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

function threadKey(targetId: string, config: AiModelConfig): string {
  return `${targetId.trim()}\n${config.baseUrl.trim().replace(/\/+$/, "")}\n${config.model.trim()}`;
}

function readSlots(item: unknown): CodexThreadSlot[] {
  if (!item || typeof item !== "object" || Array.isArray(item)) return [];
  const slots = (item as { slots?: unknown }).slots;
  if (!Array.isArray(slots)) return [];
  return slots.flatMap((slot) => {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) return [];
    const record = slot as Partial<CodexThreadSlot>;
    return typeof record.threadId === "string" && record.threadId.trim() && typeof record.updatedAt === "number"
      ? [{
        threadId: record.threadId,
        updatedAt: record.updatedAt,
        signature: typeof record.signature === "string" ? record.signature : emptySignature,
      }]
      : [];
  });
}

function readRecords(storage: CodexThreadStorage): CodexThreadStore {
  const records: CodexThreadStore = {};
  try {
    const value: unknown = JSON.parse(storage.getItem(storageKey) || "{}");
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        const slots = readSlots(item);
        if (slots.length) records[key] = { slots };
      }
    }
  } catch {
    // A corrupted store is treated as empty; threads are an optimization, not a source of truth.
  }
  try {
    // v1 entries were keyed by a conversation target that embedded mode and document and can no longer be addressed.
    if (storage.getItem(legacyStorageKey) !== null) storage.removeItem(legacyStorageKey);
  } catch {
    // Ignore storage cleanup failures.
  }
  return records;
}

function writeRecords(storage: CodexThreadStorage, records: CodexThreadStore): void {
  storage.setItem(storageKey, JSON.stringify(records));
}

function recordTimestamp(record: CodexThreadRecord): number {
  return record.slots.reduce((latest, slot) => Math.max(latest, slot.updatedAt), 0);
}

export function getCodexThread(targetId: string | undefined, config: AiModelConfig, storage?: CodexThreadStorage): string | undefined {
  const normalizedTarget = targetId?.trim();
  const activeStorage = getStorage(storage);
  if (!normalizedTarget || !activeStorage) return undefined;
  const slots = readRecords(activeStorage)[threadKey(normalizedTarget, config)]?.slots ?? [];
  return slots.reduce<CodexThreadSlot | undefined>((latest, slot) => !latest || slot.updatedAt >= latest.updatedAt ? slot : latest, undefined)?.threadId;
}

export function getCodexThreadWithTools(
  targetId: string | undefined,
  config: AiModelConfig,
  dynamicToolsSignature: string,
  storage?: CodexThreadStorage,
): string | undefined {
  const normalizedTarget = targetId?.trim();
  const activeStorage = getStorage(storage);
  if (!normalizedTarget || !activeStorage) return undefined;
  return readRecords(activeStorage)[threadKey(normalizedTarget, config)]?.slots
    .find((slot) => slot.signature === dynamicToolsSignature)?.threadId;
}

export function saveCodexThread(
  targetId: string,
  config: AiModelConfig,
  threadId: string,
  storage?: CodexThreadStorage,
  dynamicToolsSignature?: string,
): void {
  const normalizedTarget = targetId.trim();
  const normalizedThreadId = threadId.trim();
  const activeStorage = getStorage(storage);
  if (!normalizedTarget || !normalizedThreadId || !activeStorage) return;
  try {
    const records = readRecords(activeStorage);
    const key = threadKey(normalizedTarget, config);
    const signature = dynamicToolsSignature ?? emptySignature;
    const slots = [
      ...(records[key]?.slots ?? []).filter((slot) => slot.signature !== signature),
      { threadId: normalizedThreadId, updatedAt: Date.now(), signature },
    ];
    records[key] = {
      slots: slots.length > maxSlotsPerTarget
        ? [...slots].sort((left, right) => left.updatedAt - right.updatedAt).slice(slots.length - maxSlotsPerTarget)
        : slots,
    };
    const keys = Object.keys(records);
    if (keys.length > maxStoredThreads) {
      for (const staleKey of keys
        .sort((left, right) => recordTimestamp(records[left]) - recordTimestamp(records[right]))
        .slice(0, keys.length - maxStoredThreads)) {
        delete records[staleKey];
      }
    }
    writeRecords(activeStorage, records);
  } catch {
    // Persistence is an optimization; a storage quota must not fail a task.
  }
}

export function clearCodexThread(
  targetId: string,
  config: AiModelConfig,
  storage?: CodexThreadStorage,
  dynamicToolsSignature?: string,
): void {
  const activeStorage = getStorage(storage);
  if (!activeStorage) return;
  try {
    const records = readRecords(activeStorage);
    const key = threadKey(targetId.trim(), config);
    const record = records[key];
    if (!record) return;
    if (dynamicToolsSignature === undefined) {
      delete records[key];
    } else {
      const slots = record.slots.filter((slot) => slot.signature !== dynamicToolsSignature);
      if (slots.length) records[key] = { slots };
      else delete records[key];
    }
    writeRecords(activeStorage, records);
  } catch {
    // A stale browser storage entry is harmless and can be retried later.
  }
}
