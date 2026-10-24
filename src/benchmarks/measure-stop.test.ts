/**
 * 一次性测量：点击"停止"后各阶段耗时（真实模型流 + 真实 agentCore 循环）。
 * npx vitest run --config vitest.bench.config.ts src/benchmarks/measure-stop.test.ts
 */
import { describe, expect, it } from "vitest";
import { beforeEach } from "node:timers";
import * as Blockly from "blockly/core";
import "blockly/blocks";
import { generateWorkspacePython } from "../pythonBlocks";
import { createBlocklyToolExecutor } from "../agentV2/blocklyHost";
import { manimPythonToWorkspace } from "../manimPythonToBlocks";
import { runAgentCore } from "../agentCore";
import { initializePlugins } from "../plugins";
import { registerHardwareBlocks } from "../hardware/hardwareBlocks";
import type { AgentModelTransport, AgentModelTurnOptions } from "../agentTransport";
import type { AiChatCompletionResult, AiChatMessage } from "../aiConfig";

void beforeEach;

const BASE_URL = (process.env.BENCH_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, "");
const MODEL = process.env.BENCH_MODEL || "qwen3.8-flash";
const API_KEY = process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || "";
if (!API_KEY) throw new Error("缺少 DASHSCOPE_API_KEY");

class FetchChatTransport implements AgentModelTransport {
  constructor(private readonly stats: { count: number; reasoning: number; content: number }) {}
  async runTurn(messages: AiChatMessage[], options: AgentModelTurnOptions): Promise<AiChatCompletionResult> {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL, stream: true, stream_options: { include_usage: true }, messages,
        tools: options.tools ?? undefined,
        enable_thinking: true,
      }),
      signal: options.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];
    let finishReason = "";
    const deltas: Array<{ t: number; kind: string }> = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index = buffer.indexOf("\n");
        while (index >= 0) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          index = buffer.indexOf("\n");
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            type StreamPayload = { choices?: Array<{ delta?: { content?: string; reasoning_content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> }, finish_reason?: string | null }> };
            const payload = JSON.parse(data) as StreamPayload;
            const delta = payload.choices?.[0]?.delta;
            if (delta?.content) { content += delta.content; deltas.push({ t: Date.now(), kind: "content" }); this.stats.content += 1; options.onDelta?.(delta.content); }
            if (delta?.reasoning_content) { deltas.push({ t: Date.now(), kind: "reasoning" }); this.stats.reasoning += 1; }
            for (const call of delta?.tool_calls ?? []) {
              const slot = toolCalls[call.index] ?? (toolCalls[call.index] = { id: call.id ?? "", type: "function", function: { name: "", arguments: "" } });
              if (call.id) slot.id = call.id;
              if (call.function?.name) slot.function.name += call.function.name;
              if (call.function?.arguments) slot.function.arguments += call.function.arguments;
            }
            if (payload.choices?.[0]?.finish_reason) finishReason = payload.choices[0].finish_reason;
          } catch { /* 忽略心跳等非 JSON 行 */ }
        }
      }
    } finally {
      void reader.cancel().catch(() => undefined);
    }
    return { content, toolCalls: toolCalls.filter((call) => call.id && call.function.name), truncated: finishReason === "length", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, rounds: 1 } } as AiChatCompletionResult;
  }
}

describe("停止耗时测量", () => {
  const deltaStats = { count: 0, reasoning: 0, content: 0 };
  it("abort 后的收尾时延", async () => {
    registerHardwareBlocks();
    await initializePlugins();
    const workspace = new Blockly.Workspace();
    const templateScratch = new Blockly.Workspace();
    const execute = createBlocklyToolExecutor({
      workspace,
      selectedBlockId: () => null,
      getTaskBlockDirectory: () => ({ blocks: [] }),
      searchBlocks: () => [],
      getBlockTemplates: (types: string[]) => types.flatMap((type) => {
        let block: Blockly.Block | null = null;
        try { block = templateScratch.newBlock(type); } catch { return []; }
        if (!block) return [];
        const state = Blockly.serialization.blocks.save(block);
        block.dispose(false);
        return [{ type, label: type, category: "Measure", state, inputSlots: [] }];
      }),
      generateCode: (ws: Blockly.Workspace) => generateWorkspacePython(ws),
      validateContexts: () => [],
      validateCode: async () => undefined,
      convertPythonToWorkspace: (code: string) => manimPythonToWorkspace(code),
      commit: (state: object) => { Blockly.serialization.workspaces.load(state as Parameters<typeof Blockly.serialization.workspaces.load>[0], workspace); },
      entryBlockTypes: [],
    });
    const controller = new AbortController();
    const events: Array<{ t: number; kind: string; label?: string }> = [];
    const started = Date.now();
    const runPromise = runAgentCore({
      prompt: "创建一个 Manim 场景：显示文字“Visual Python”，等待 2 秒。",
      mode: "agent",
      reasoningEffort: "high",
      permissionMode: "auto",
      host: {
        executeTool: async (name: string, args: Record<string, unknown>, signal: AbortSignal) => execute(name, args, signal),
        getSnapshot: () => ({ workspaceMode: "visual", code: "", lineCount: 0, running: false }),
      },
      signal: controller.signal,
      transport: new FetchChatTransport(deltaStats),
      onEvent: (event) => events.push({ t: Date.now(), kind: `${event.kind}:${event.status}`, label: event.toolName }),
      onProgress: (progress) => events.push({ t: Date.now(), kind: `progress:${progress.phase}` }),
    });
    // 等首个内容增量后再流 5 秒，然后按下“停止”。
    const firstContent = await new Promise<number>((resolve) => {
      const timer = setInterval(() => {
        if (events.some((event) => event.kind.startsWith("stream") || events.length > 4)) { clearInterval(timer); resolve(Date.now()); }
      }, 100);
      setTimeout(() => { clearInterval(timer); resolve(Date.now()); }, 30_000);
    });
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const tAbort = Date.now();
    controller.abort();
    const result = await runPromise.then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error }));
    const tSettled = Date.now();
    const eventsAfterAbort = events.filter((event) => event.t >= tAbort);
    console.log(`增量事件统计：reasoning ${deltaStats.reasoning} + content ${deltaStats.content}（流式约 5 秒，≈${Math.round((deltaStats.reasoning + deltaStats.content) / 5)}/秒）`);
    console.log(`首事件等待 ${firstContent - started}ms；abort → runAgentCore 返回：${tSettled - tAbort}ms；abort 后事件数：${eventsAfterAbort.length}`);
    console.log("abort 前最后事件 →", events.filter((event) => event.t < tAbort).at(-1)?.kind);
    console.log("settle:", result.ok ? "resolved" : `rejected: ${String((result as { error: Error }).error.message).slice(0, 80)}`);
    expect(tSettled - tAbort).toBeLessThan(4000);
    workspace.dispose();
    templateScratch.dispose();
  }, 120_000);
});
