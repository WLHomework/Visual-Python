import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe("AI conversation file store", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("derives confined file names from conversation scopes", async () => {
    const { aiConversationFileName } = await import("./conversationFileStore");
    expect(aiConversationFileName("project-a::scene-main")).toBe("project-a%3A%3Ascene-main.json");
    expect(aiConversationFileName("简体中文")).toBe("%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87.json");
  });

  it("reads store contents through the Rust command", async () => {
    invokeMock.mockResolvedValueOnce('{"activeId":"a"}');
    const { readAiConversationStore } = await import("./conversationFileStore");
    await expect(readAiConversationStore("scope")).resolves.toBe('{"activeId":"a"}');
    expect(invokeMock).toHaveBeenCalledWith("read_ai_conversation_store", { fileName: "scope.json" });
  });

  it("treats command failures and a missing store as null", async () => {
    invokeMock.mockRejectedValueOnce(new Error("boom"));
    const { readAiConversationStore } = await import("./conversationFileStore");
    await expect(readAiConversationStore("scope")).resolves.toBeNull();
  });

  it("writes store contents and reports command failures", async () => {
    const { writeAiConversationStore } = await import("./conversationFileStore");
    invokeMock.mockResolvedValueOnce(undefined);
    await expect(writeAiConversationStore("scope", "{}")).resolves.toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("write_ai_conversation_store", { fileName: "scope.json", contents: "{}" });
    invokeMock.mockRejectedValueOnce(new Error("disk full"));
    await expect(writeAiConversationStore("scope", "{}")).resolves.toBe(false);
  });

  it("falls back to a no-op outside the Tauri runtime", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("window", {});
    const store = await import("./conversationFileStore");
    await expect(store.readAiConversationStore("scope")).resolves.toBeNull();
    await expect(store.writeAiConversationStore("scope", "{}")).resolves.toBe(false);
    expect(store.aiConversationsAvailable()).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
