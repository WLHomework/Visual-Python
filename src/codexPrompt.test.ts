import { describe, expect, it } from "vitest";
import { buildCodexPrompt } from "./codexPrompt";

describe("Codex prompt compaction", () => {
  it("includes bounded history only when starting a new thread", () => {
    const input = {
      prompt: "继续修改代码",
      history: [{ user: "旧请求", assistant: "旧回复" }],
      snapshot: { code: "class Demo:\n    pass", lineCount: 2, running: false },
    };

    expect(buildCodexPrompt(input, true)).toContain("旧请求");
    expect(buildCodexPrompt(input, false)).not.toContain("旧请求");
    expect(buildCodexPrompt(input, false)).toContain("继续修改代码");
  });

  it("keeps every recent turn that fits the larger handoff budget", () => {
    const history = Array.from({ length: 5 }, (_, index) => ({
      user: `请求-${index}：${"u".repeat(800)}`,
      assistant: `回复-${index}：${"a".repeat(800)}`,
    }));
    const prompt = buildCodexPrompt({ prompt: "继续", history, snapshot: {} }, true);

    // The previous 6000-character cap dropped the newest turn; the handoff budget must keep it.
    expect(prompt).toContain("请求-4");
    expect(prompt).toContain("请求-0");
    expect(prompt).not.toContain("[内容已截断]");
  });

  it("keeps the most recent turns when the handoff history exceeds the budget", () => {
    const history = Array.from({ length: 20 }, (_, index) => ({
      user: `旧请求-${index}：${"u".repeat(1_500)}`,
      assistant: `旧回复-${index}：${"a".repeat(1_500)}`,
    }));
    const prompt = buildCodexPrompt({ prompt: "继续", history, snapshot: {} }, true);

    expect(prompt).toContain("旧请求-19");
    expect(prompt).not.toContain("旧请求-0：");
    expect(prompt.length).toBeLessThan(40_000);
  });

  it("caps the handoff to the twelve most recent turns", () => {
    const history = Array.from({ length: 20 }, (_, index) => ({ user: `短请求-${index}`, assistant: `短回复-${index}` }));
    const prompt = buildCodexPrompt({ prompt: "继续", history, snapshot: {} }, true);

    expect(prompt).toContain("短请求-19");
    expect(prompt).toContain("短请求-8");
    expect(prompt).not.toContain("短请求-7");
  });

  it("bounds a large code snapshot while preserving task metadata", () => {
    const prompt = buildCodexPrompt({
      prompt: "检查当前代码",
      history: [],
      snapshot: { code: "x".repeat(30_000), project: { name: "Demo" }, lineCount: 30_000 },
    }, false);

    expect(prompt).toContain("检查当前代码");
    expect(prompt).toContain("Demo");
    expect(prompt.length).toBeLessThan(13_000);
  });

  it("adds a compact graphical block catalog to every graphical task turn", () => {
    const input = {
      prompt: "创建一个输出积木",
      history: [],
      snapshot: { workspaceMode: "visual", blockWorkspace: { blockCount: 0 } },
      blockCatalog: JSON.stringify({
        categories: [{ name: "Python", blockCount: 1 }],
        candidates: [{ type: "python_print", label: "输出", inputSlots: [{ name: "TEXT", kind: "value" }] }],
      }),
    };

    expect(buildCodexPrompt(input, true)).toContain("python_print");
    expect(buildCodexPrompt(input, false)).toContain("python_print");
  });
});
