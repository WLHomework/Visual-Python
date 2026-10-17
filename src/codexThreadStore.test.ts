import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCodexThread, createDynamicToolsSignature, getCodexThread, getCodexThreadWithTools, saveCodexThread } from "./codexThreadStore";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

const config = { baseUrl: "https://example.com/v1", model: "model-a" };

describe("Codex thread persistence", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores a thread per conversation target and model configuration", () => {
    const storage = createStorage();

    saveCodexThread("project-1:conversation-1", config, "thread-1", storage);

    expect(getCodexThread("project-1:conversation-1", config, storage)).toBe("thread-1");
    expect(getCodexThread("project-1:conversation-1", { ...config, model: "model-b" }, storage)).toBeUndefined();
  });

  it("can clear a stale thread without affecting another target", () => {
    const storage = createStorage();
    saveCodexThread("target-a", config, "thread-a", storage);
    saveCodexThread("target-b", config, "thread-b", storage);

    clearCodexThread("target-a", config, storage);

    expect(getCodexThread("target-a", config, storage)).toBeUndefined();
    expect(getCodexThread("target-b", config, storage)).toBe("thread-b");
  });

  it("keeps one thread slot per dynamic tool signature", () => {
    const storage = createStorage();

    saveCodexThread("target", config, "thread-a", storage, "tools-a");
    saveCodexThread("target", config, "thread-b", storage, "tools-b");

    expect(getCodexThreadWithTools("target", config, "tools-a", storage)).toBe("thread-a");
    expect(getCodexThreadWithTools("target", config, "tools-b", storage)).toBe("thread-b");
    expect(getCodexThreadWithTools("target", config, "tools-c", storage)).toBeUndefined();
  });

  it("resumes the earlier thread when the tool surface returns to a previous signature", () => {
    const storage = createStorage();

    saveCodexThread("target", config, "thread-a", storage, "tools-a");
    saveCodexThread("target", config, "thread-b", storage, "tools-b");

    expect(getCodexThreadWithTools("target", config, "tools-a", storage)).toBe("thread-a");
  });

  it("touches a resumed slot so recent use survives per-target trimming", () => {
    const storage = createStorage();
    vi.useFakeTimers();
    for (let index = 0; index < 6; index += 1) {
      vi.setSystemTime(1_000 + index);
      saveCodexThread("target", config, `thread-${index}`, storage, `tools-${index}`);
    }
    vi.setSystemTime(2_000);
    // A successful resume re-saves the slot, which must count as recent use.
    saveCodexThread("target", config, "thread-0", storage, "tools-0");
    vi.setSystemTime(3_000);
    saveCodexThread("target", config, "thread-6", storage, "tools-6");

    expect(getCodexThreadWithTools("target", config, "tools-1", storage)).toBeUndefined();
    expect(getCodexThreadWithTools("target", config, "tools-0", storage)).toBe("thread-0");
    expect(getCodexThreadWithTools("target", config, "tools-6", storage)).toBe("thread-6");
  });

  it("evicts the least recently updated conversation target", () => {
    const storage = createStorage();
    vi.useFakeTimers();
    for (let index = 0; index < 97; index += 1) {
      vi.setSystemTime(1_000 + index);
      saveCodexThread(`target-${index}`, config, `thread-${index}`, storage, "tools");
    }

    expect(getCodexThreadWithTools("target-0", config, "tools", storage)).toBeUndefined();
    expect(getCodexThreadWithTools("target-96", config, "tools", storage)).toBe("thread-96");
  });

  it("clears only the failed signature slot", () => {
    const storage = createStorage();
    saveCodexThread("target", config, "thread-a", storage, "tools-a");
    saveCodexThread("target", config, "thread-b", storage, "tools-b");

    clearCodexThread("target", config, storage, "tools-a");

    expect(getCodexThreadWithTools("target", config, "tools-a", storage)).toBeUndefined();
    expect(getCodexThreadWithTools("target", config, "tools-b", storage)).toBe("thread-b");
  });

  it("removes the whole target when cleared without a signature", () => {
    const storage = createStorage();
    saveCodexThread("target", config, "thread-a", storage, "tools-a");
    saveCodexThread("target", config, "thread-b", storage, "tools-b");

    clearCodexThread("target", config, storage);

    expect(getCodexThreadWithTools("target", config, "tools-a", storage)).toBeUndefined();
    expect(getCodexThreadWithTools("target", config, "tools-b", storage)).toBeUndefined();
  });

  it("keeps the same signature when tool order and object key order change", () => {
    const first = createDynamicToolsSignature([
      { name: "write_code", inputSchema: { type: "object", properties: { code: { type: "string" } } } },
      { name: "read_code", description: "read", inputSchema: { type: "object" } },
    ]);
    const second = createDynamicToolsSignature([
      { inputSchema: { properties: { code: { type: "string" } }, type: "object" }, name: "write_code" },
      { inputSchema: { type: "object" }, name: "read_code", description: "read" },
    ]);

    expect(second).toBe(first);
  });

  it("drops the legacy store whose conversation targets are no longer addressable", () => {
    const storage = createStorage();
    storage.setItem(
      "visual-python:codex-thread-store:v1",
      JSON.stringify({ "old-target\nhttps://example.com/v1\nmodel-a": { threadId: "thread-old", updatedAt: 1 } }),
    );

    expect(getCodexThreadWithTools("old-target", config, "tools-a", storage)).toBeUndefined();
    expect(storage.getItem("visual-python:codex-thread-store:v1")).toBeNull();
  });
});
