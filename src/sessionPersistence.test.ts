import { describe, expect, it } from "vitest";
import type { DraftProject } from "./projectFile";
import {
  LAST_PROJECT_STORAGE_KEY,
  RESTORE_LAST_PROJECT_STORAGE_KEY,
  WORKSPACE_DRAFT_STORAGE_KEY,
  clearLastProject,
  conversationStoreKey,
  conversationStoreTimestamp,
  isStorageQuotaError,
  persistWorkspaceDraft,
  pruneConversationStores,
  readLastProject,
  resolveStartupProjectPath,
  setRestoreLastProjectEnabled,
  shouldRestoreLastProject,
  writeLastProject,
  type SessionStorage,
} from "./sessionPersistence";

function quotaError(): Error {
  const error = new Error("quota exceeded");
  error.name = "QuotaExceededError";
  return error;
}

function createStorage(initial: Record<string, string> = {}, options: { setItemFailures?: number; failure?: () => unknown } = {}): SessionStorage {
  const values = new Map(Object.entries(initial));
  let failures = options.setItemFailures ?? 0;
  return {
    get length() { return values.size; },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => {
      if (failures > 0) {
        failures -= 1;
        throw options.failure?.() ?? quotaError();
      }
      values.set(key, value);
    },
  };
}

function createDraft(overrides: Partial<DraftProject> = {}): DraftProject {
  return {
    version: 1,
    projectId: "project-1",
    name: "untitled.vpy",
    path: null,
    savedAt: 1,
    workspace: { blocks: { languageVersion: 0, blocks: [] } },
    ...overrides,
  };
}

function createConversationStore(updatedAt: number, runs = 1): string {
  return JSON.stringify({
    activeId: "conversation-1",
    conversations: [{
      id: "conversation-1",
      title: "测试对话",
      createdAt: updatedAt,
      updatedAt,
      runs: Array.from({ length: runs }, (_, index) => ({ id: index + 1, status: "done" })),
    }],
  });
}

const scopeKeyA = conversationStoreKey("project-a::assistant");
const scopeKeyB = conversationStoreKey("project-b::assistant");

describe("session persistence", () => {
  it("recognizes quota errors across engines", () => {
    expect(isStorageQuotaError(quotaError())).toBe(true);
    expect(isStorageQuotaError(Object.assign(new Error("full"), { code: 22 }))).toBe(true);
    expect(isStorageQuotaError(Object.assign(new Error("full"), { code: 1014 }))).toBe(true);
    expect(isStorageQuotaError(new Error("other"))).toBe(false);
    expect(isStorageQuotaError({ code: 22 })).toBe(false);
    expect(isStorageQuotaError(null)).toBe(false);
  });

  it("builds the same conversation storage key format the AI panel uses", () => {
    expect(conversationStoreKey("project-a::assistant")).toBe("visual-python:ai-conversations:project-a%3A%3Aassistant");
  });

  it("writes the workspace draft as JSON", () => {
    const storage = createStorage();
    expect(persistWorkspaceDraft(storage, createDraft())).toBe(true);
    expect(JSON.parse(storage.getItem(WORKSPACE_DRAFT_STORAGE_KEY) || "null")).toMatchObject({ projectId: "project-1", name: "untitled.vpy" });
  });

  it("purges the oldest conversation stores when quota blocks the draft", () => {
    const storage = createStorage({
      [conversationStoreKey("scope-old")]: createConversationStore(100),
      [conversationStoreKey("scope-mid")]: createConversationStore(200),
      [conversationStoreKey("scope-new")]: createConversationStore(300),
      "visual-python:recent": "[]",
    }, { setItemFailures: 2 });

    expect(persistWorkspaceDraft(storage, createDraft())).toBe(true);
    expect(storage.getItem(conversationStoreKey("scope-old"))).toBeNull();
    expect(storage.getItem(conversationStoreKey("scope-mid"))).toBeNull();
    expect(storage.getItem(conversationStoreKey("scope-new"))).not.toBeNull();
    expect(storage.getItem(WORKSPACE_DRAFT_STORAGE_KEY)).not.toBeNull();
    expect(storage.getItem("visual-python:recent")).toBe("[]");
  });

  it("never purges the conversation store of the current session", () => {
    const storage = createStorage({
      [scopeKeyA]: createConversationStore(100),
      [scopeKeyB]: createConversationStore(200),
      [conversationStoreKey("scope-new")]: createConversationStore(300),
    }, { setItemFailures: 2 });

    expect(persistWorkspaceDraft(storage, createDraft(), { protectConversationScope: "project-a::assistant" })).toBe(true);
    expect(storage.getItem(scopeKeyA)).not.toBeNull();
    expect(storage.getItem(scopeKeyB)).toBeNull();
    expect(storage.getItem(conversationStoreKey("scope-new"))).toBeNull();
  });

  it("gives up without purging when the failure is not a quota error", () => {
    const storage = createStorage({ [scopeKeyA]: createConversationStore(100) }, { setItemFailures: 1, failure: () => new TypeError("denied") });
    expect(persistWorkspaceDraft(storage, createDraft())).toBe(false);
    expect(storage.getItem(scopeKeyA)).not.toBeNull();
  });

  it("returns false when the draft cannot be serialized", () => {
    const storage = createStorage();
    const draft = createDraft() as DraftProject & { self?: unknown };
    draft.self = draft;
    expect(persistWorkspaceDraft(storage, draft)).toBe(false);
    expect(storage.getItem(WORKSPACE_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("prunes empty and stale conversation stores while keeping recent ones", () => {
    const storage = createStorage({
      [conversationStoreKey("scope-oldest")]: createConversationStore(100),
      [conversationStoreKey("scope-mid")]: createConversationStore(200),
      [conversationStoreKey("scope-newest")]: createConversationStore(300),
      [conversationStoreKey("scope-empty")]: createConversationStore(400, 0),
      [conversationStoreKey("scope-broken")]: "{not json",
      "visual-python:recent": "[]",
    });

    const removed = pruneConversationStores(storage, { keep: 2 });

    expect([...removed].sort()).toEqual([
      conversationStoreKey("scope-broken"),
      conversationStoreKey("scope-empty"),
      conversationStoreKey("scope-oldest"),
    ].sort());
    expect(storage.getItem(conversationStoreKey("scope-oldest"))).toBeNull();
    expect(storage.getItem(conversationStoreKey("scope-mid"))).not.toBeNull();
    expect(storage.getItem(conversationStoreKey("scope-newest"))).not.toBeNull();
    expect(storage.getItem("visual-python:recent")).toBe("[]");
  });

  it("keeps protected conversation stores during pruning", () => {
    const storage = createStorage({
      [conversationStoreKey("scope-oldest")]: createConversationStore(100),
      [conversationStoreKey("scope-mid")]: createConversationStore(200),
      [conversationStoreKey("scope-newest")]: createConversationStore(300),
    });

    const removed = pruneConversationStores(storage, { keep: 1, protect: [conversationStoreKey("scope-oldest")] });

    expect(removed).toEqual([conversationStoreKey("scope-mid")]);
    expect(storage.getItem(conversationStoreKey("scope-oldest"))).not.toBeNull();
    expect(storage.getItem(conversationStoreKey("scope-newest"))).not.toBeNull();
  });

  it("reads conversation store timestamps and treats broken data as oldest", () => {
    const storage = createStorage({
      [scopeKeyA]: createConversationStore(1234),
      [scopeKeyB]: "{broken",
    });
    expect(conversationStoreTimestamp(storage, scopeKeyA)).toBe(1234);
    expect(conversationStoreTimestamp(storage, scopeKeyB)).toBe(0);
  });

  it("round-trips the last opened project", () => {
    const storage = createStorage();
    writeLastProject(storage, { path: "E:/demo.vpy", name: "demo.vpy" });
    expect(readLastProject(storage)).toEqual({ path: "E:/demo.vpy", name: "demo.vpy" });
    clearLastProject(storage);
    expect(readLastProject(storage)).toBeNull();
    expect(storage.getItem(LAST_PROJECT_STORAGE_KEY)).toBeNull();
  });

  it("ignores invalid last-project records", () => {
    expect(readLastProject(createStorage({ [LAST_PROJECT_STORAGE_KEY]: "{broken" }))).toBeNull();
    expect(readLastProject(createStorage({ [LAST_PROJECT_STORAGE_KEY]: JSON.stringify({ name: "x.vpy" }) }))).toBeNull();
    expect(readLastProject(createStorage({ [LAST_PROJECT_STORAGE_KEY]: JSON.stringify({ path: "", name: "x.vpy" }) }))).toBeNull();
  });

  it("defaults to restoring the last project and remembers being disabled", () => {
    const storage = createStorage();
    expect(shouldRestoreLastProject(storage)).toBe(true);
    setRestoreLastProjectEnabled(storage, false);
    expect(shouldRestoreLastProject(storage)).toBe(false);
    setRestoreLastProjectEnabled(storage, true);
    expect(shouldRestoreLastProject(storage)).toBe(true);
    expect(storage.getItem(RESTORE_LAST_PROJECT_STORAGE_KEY)).toBeNull();
  });

  it("resolves the startup project with OS file, draft and toggle precedence", () => {
    const withLastProject = createStorage();
    writeLastProject(withLastProject, { path: "E:/demo.vpy", name: "demo.vpy" });
    expect(resolveStartupProjectPath(withLastProject, "E:/opened.vpy")).toBe("E:/opened.vpy");
    expect(resolveStartupProjectPath(withLastProject, null)).toBe("E:/demo.vpy");

    const withDraft = createStorage({ [WORKSPACE_DRAFT_STORAGE_KEY]: "{}" });
    writeLastProject(withDraft, { path: "E:/demo.vpy", name: "demo.vpy" });
    expect(resolveStartupProjectPath(withDraft, null)).toBeNull();

    const disabled = createStorage();
    writeLastProject(disabled, { path: "E:/demo.vpy", name: "demo.vpy" });
    setRestoreLastProjectEnabled(disabled, false);
    expect(resolveStartupProjectPath(disabled, null)).toBeNull();

    expect(resolveStartupProjectPath(createStorage(), null)).toBeNull();
  });
});
