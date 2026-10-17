import { describe, expect, it } from "vitest";
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

  it("does not resume a thread after its dynamic tool set changes", () => {
    const storage = createStorage();
    const config = { baseUrl: "https://example.com/v1", model: "model-a" };

    saveCodexThread("target", config, "thread-a", storage, "tools-a");

    expect(getCodexThreadWithTools("target", config, "tools-a", storage)).toBe("thread-a");
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
});
