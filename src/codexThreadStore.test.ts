import { describe, expect, it } from "vitest";
import { clearCodexThread, getCodexThread, saveCodexThread } from "./codexThreadStore";

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

describe("Codex thread persistence", () => {
  it("stores a thread per conversation target and model configuration", () => {
    const storage = createStorage();
    const config = { baseUrl: "https://example.com/v1", model: "model-a" };

    saveCodexThread("project-1:conversation-1", config, "thread-1", storage);

    expect(getCodexThread("project-1:conversation-1", config, storage)).toBe("thread-1");
    expect(getCodexThread("project-1:conversation-1", { ...config, model: "model-b" }, storage)).toBeUndefined();
  });

  it("can clear a stale thread without affecting another target", () => {
    const storage = createStorage();
    const config = { baseUrl: "https://example.com/v1", model: "model-a" };
    saveCodexThread("target-a", config, "thread-a", storage);
    saveCodexThread("target-b", config, "thread-b", storage);

    clearCodexThread("target-a", config, storage);

    expect(getCodexThread("target-a", config, storage)).toBeUndefined();
    expect(getCodexThread("target-b", config, storage)).toBe("thread-b");
  });
});
