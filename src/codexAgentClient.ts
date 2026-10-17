import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type { AiModelConfig, AiReasoningEffort } from "./aiConfig";
import type { AgentModelEvent, AgentToolRequest } from "./agentEvents";
import { clearCodexThread, createDynamicToolsSignature, getCodexThreadWithTools, saveCodexThread } from "./codexThreadStore";

export type CodexAgentInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export type CodexDynamicTool = {
  type: "function";
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  deferLoading?: boolean;
};

export type CodexServerRequest = {
  id: string | number;
  method: string;
  params: Record<string, unknown>;
};

export type CodexStreamEvent =
  | { type: "assistantDelta"; threadId: string; turnId: string; itemId: string; delta: string }
  | { type: "reasoningDelta"; threadId: string; turnId: string; itemId: string; delta: string }
  | { type: "tokenUsage"; threadId: string; turnId: string; inputTokens: number; cachedInputTokens: number; outputTokens: number; totalTokens: number }
  | { type: "turnCompleted"; threadId: string; turnId: string; status: string; turn?: Record<string, unknown> }
  | { type: "error"; message: string; status?: number }
  | { type: "other"; method: string; params: Record<string, unknown> };

export type CodexRunTurnOptions = {
  config: AiModelConfig;
  dynamicTools?: CodexDynamicTool[];
  baseInstructions?: string;
  developerInstructions?: string;
  cwd?: string;
  effort?: AiReasoningEffort;
  conversationTargetId?: string;
  fallbackPrompt?: string;
  signal?: AbortSignal;
  images?: Array<{ url: string; detail?: "low" | "auto" | "high" }>;
  onEvent?: (event: AgentModelEvent) => void;
  onServerRequest?: (request: CodexServerRequest) => Promise<void>;
};

export function buildCodexTurnInput(prompt: string, images: CodexRunTurnOptions["images"] = []) {
  return [
    { type: "text" as const, text: prompt, textElements: [] },
    ...images.map((image) => ({ type: "image" as const, url: image.url, detail: image.detail || "auto" as const })),
  ];
}

export type CodexTurnResult = {
  threadId: string;
  turnId: string;
  status: string;
  resumed: boolean;
  turn?: Record<string, unknown>;
};

type RequestEnvelope<T> = {
  ok: boolean;
  result?: T;
  error?: { code?: number; message?: string; data?: unknown };
};

type RawEvent =
  | { kind: "notification"; notification: { method: string; params?: Record<string, unknown> } }
  | { kind: "serverRequest"; request: CodexServerRequest }
  | { kind: "lagged"; skipped: number };

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function codexErrorStatus(value: unknown): number | undefined {
  const info = record(value);
  for (const detail of Object.values(info)) {
    const status = record(detail).httpStatusCode;
    if (typeof status === "number" && Number.isFinite(status)) return status;
  }
  return undefined;
}

export function mapCodexNotification(notification: { method: string; params?: Record<string, unknown> }): CodexStreamEvent {
  const params = notification.params || {};
  const common = {
    threadId: text(params.threadId),
    turnId: text(params.turnId),
  };
  if (notification.method === "item/agentMessage/delta") {
    return { type: "assistantDelta", ...common, itemId: text(params.itemId), delta: text(params.delta) };
  }
  if (notification.method === "item/reasoning/summaryTextDelta" || notification.method === "item/reasoning/textDelta") {
    return { type: "reasoningDelta", ...common, itemId: text(params.itemId), delta: text(params.delta) };
  }
  if (notification.method === "thread/tokenUsage/updated") {
    const tokenUsage = params.tokenUsage && typeof params.tokenUsage === "object" ? params.tokenUsage as Record<string, unknown> : {};
    const total = tokenUsage.total && typeof tokenUsage.total === "object" ? tokenUsage.total as Record<string, unknown> : tokenUsage;
    return {
      type: "tokenUsage",
      ...common,
      inputTokens: number(total.inputTokens),
      cachedInputTokens: number(total.cachedInputTokens),
      outputTokens: number(total.outputTokens),
      totalTokens: number(total.totalTokens),
    };
  }
  if (notification.method === "turn/completed") {
    const turn = params.turn && typeof params.turn === "object" ? params.turn as Record<string, unknown> : {};
    return { type: "turnCompleted", threadId: common.threadId, turnId: text(turn.id) || common.turnId, status: text(turn.status), turn };
  }
  if (notification.method === "error") {
    const error = record(params.error);
    const status = codexErrorStatus(error.codexErrorInfo);
    return {
      type: "error",
      message: text(error.message) || text(params.message) || "Codex Agent 执行失败",
      ...(status === undefined ? {} : { status }),
    };
  }
  return { type: "other", method: notification.method, params };
}

export function mapCodexStreamEvent(event: CodexStreamEvent): AgentModelEvent | undefined {
  if (event.type === "assistantDelta") return { type: "textDelta", threadId: event.threadId, turnId: event.turnId, itemId: event.itemId, delta: event.delta };
  if (event.type === "reasoningDelta") return event;
  if (event.type === "tokenUsage") return event;
  if (event.type === "turnCompleted") return event;
  if (event.type === "error") return event;
  return undefined;
}

export function mapCodexServerRequest(request: CodexServerRequest): AgentToolRequest | undefined {
  if (request.method !== "item/tool/call") return undefined;
  const name = text(request.params.tool).trim();
  if (!name) return undefined;
  const callId = text(request.params.callId).trim() || String(request.id);
  return {
    requestId: request.id,
    callId,
    name,
    arguments: record(request.params.arguments),
  };
}

function requestError(method: string, envelope: RequestEnvelope<unknown>): Error {
  return new Error(envelope.error?.message || `Codex 请求失败：${method}`);
}

export class CodexAgentClient {
  private requestSequence = 1;
  private readonly invoke: CodexAgentInvoke;

  constructor(invoke: CodexAgentInvoke = tauriInvoke) {
    this.invoke = invoke;
  }

  async start(config: AiModelConfig): Promise<void> {
    await this.invoke("codex_agent_start", { config });
  }

  async request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const envelope = await this.invoke<RequestEnvelope<T>>("codex_agent_request", {
      request: { method, id: `visual-python-${this.requestSequence++}`, params },
    });
    if (!envelope.ok) throw requestError(method, envelope);
    return envelope.result as T;
  }

  async nextEvent(signal?: AbortSignal): Promise<RawEvent> {
    if (signal?.aborted) throw new Error("任务已停止");
    const pending = this.invoke<RawEvent>("codex_agent_next_event");
    const event = signal
      ? await Promise.race([
        pending,
        new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("任务已停止")), { once: true })),
      ])
      : await pending;
    if (!event) throw new Error("Codex Agent 运行时已关闭");
    return event;
  }

  async respondToServerRequest(requestId: string | number, result: unknown): Promise<void> {
    await this.invoke("codex_agent_respond_to_request", { requestId, result });
  }

  async rejectServerRequest(requestId: string | number, message: string, code = -32000): Promise<void> {
    await this.invoke("codex_agent_reject_request", { requestId, code, message, data: null });
  }

  async runTurn(prompt: string, options: CodexRunTurnOptions): Promise<CodexTurnResult> {
    await this.start(options.config);
    const targetId = options.conversationTargetId?.trim();
    const toolsSignature = createDynamicToolsSignature(options.dynamicTools);
    const storedThreadId = targetId ? getCodexThreadWithTools(targetId, options.config, toolsSignature) : undefined;
    let threadId = "";
    let resumed = false;
    if (storedThreadId) {
      try {
        const threadResponse = await this.request<{ thread: { id: string } }>("thread/resume", {
          threadId: storedThreadId,
          model: options.config.model,
          modelProvider: "visual-python",
          cwd: options.cwd || null,
          approvalPolicy: "never",
          sandbox: "read-only",
          baseInstructions: options.baseInstructions || null,
          developerInstructions: options.developerInstructions || null,
          excludeTurns: true,
        });
        threadId = threadResponse.thread.id;
        resumed = true;
        // A successful resume counts as recent use so LRU trimming keeps live threads.
        if (targetId) saveCodexThread(targetId, options.config, threadId, undefined, toolsSignature);
      } catch {
        if (targetId) clearCodexThread(targetId, options.config, undefined, toolsSignature);
      }
    }
    if (!threadId) {
      const threadResponse = await this.request<{ thread: { id: string } }>("thread/start", {
        model: options.config.model,
        modelProvider: "visual-python",
        cwd: options.cwd || null,
        approvalPolicy: "never",
        sandbox: "read-only",
        ephemeral: false,
        baseInstructions: options.baseInstructions || null,
        developerInstructions: options.developerInstructions || null,
        dynamicTools: options.dynamicTools || [],
      });
      threadId = threadResponse.thread.id;
      if (targetId) saveCodexThread(targetId, options.config, threadId, undefined, toolsSignature);
    }
    const turnResponse = await this.request<{ turn: { id: string; status?: string } }>("turn/start", {
      threadId,
      input: buildCodexTurnInput(storedThreadId && !resumed ? options.fallbackPrompt || prompt : prompt, options.images),
      model: options.config.model,
      effort: options.effort || null,
    });
    const turnId = turnResponse.turn.id;
    let interrupted = false;
    const interrupt = async () => {
      if (interrupted) return;
      interrupted = true;
      await this.request("turn/interrupt", { threadId, turnId });
    };
    try {
      while (true) {
        const raw = await this.nextEvent(options.signal);
        if (raw.kind === "serverRequest") {
          if (options.onServerRequest) {
            await options.onServerRequest(raw.request);
          } else {
            await this.rejectServerRequest(raw.request.id, "客户端未提供动态工具请求处理器", -32601);
          }
          continue;
        }
        if (raw.kind !== "notification") continue;
        const event = mapCodexNotification(raw.notification);
        if (
          "threadId" in event
          && event.threadId
          && event.threadId !== threadId
        ) continue;
        if (
          "turnId" in event
          && event.turnId
          && event.turnId !== turnId
        ) continue;
        const modelEvent = mapCodexStreamEvent(event);
        if (modelEvent) options.onEvent?.(modelEvent);
        if (event.type === "error") {
          const error = new Error(event.message) as Error & { status?: number };
          if (event.status !== undefined) error.status = event.status;
          throw error;
        }
        if (event.type === "turnCompleted" && event.threadId === threadId && event.turnId === turnId) {
          return { threadId, turnId, status: event.status, resumed, turn: event.turn };
        }
      }
    } catch (error) {
      if (options.signal?.aborted) {
        await interrupt().catch(() => undefined);
        options.onEvent?.({ type: "interrupted", message: "任务已停止", threadId, turnId });
        throw new Error("任务已停止");
      }
      throw error;
    }
  }
}
