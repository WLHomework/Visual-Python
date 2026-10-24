/**
 * AI 积木生成基准（无头自动化版）
 *
 * 依据 docs/benchmarks/ai-block-generation.md 的 32 项任务协议，在真实 Blockly 环境
 * （真实工具箱/模板/代码生成/上下文校验/Python 语法校验）中驱动 runAgentCore，
 * 记录工具选择（apply_python_as_blocks vs apply_block_program）、成功率和验证结果。
 *
 * 运行：npx vitest run --config vitest.bench.config.ts
 * 环境变量：DASHSCOPE_API_KEY（必需）、BENCH_MODEL（默认 qwen3.8-flash）、
 *           BENCH_BASE_URL（默认 dashscope 兼容模式）、BENCH_ONLY=M1,S1（只跑指定任务）。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, it } from "vitest";
import * as Blockly from "blockly/core";
import { generateWorkspacePython, toolbox as baseToolbox } from "../pythonBlocks";
import { validatePythonBlockContexts } from "../pythonSyntaxBlocks";
import { createBlockCatalog, createBlockSearchIndex, createTaskBlockDirectory, searchBlockIndex } from "../blockSearch";
import { runAgentCore } from "../agentCore";
import { allBlocklyToolNames, blocklyAgentTools, createBlocklyToolExecutor, describeBlocklyBlockContract } from "../agentV2/blocklyHost";
import { manimPythonToWorkspace } from "../manimPythonToBlocks";
import { micropythonToWorkspace } from "../hardware/micropythonToBlocks";
import { collectHardwareBlockIssues } from "../hardware/hardwareBlocks";
import { setActiveHardwareBoard } from "../hardware/blocks/shared";
import { getPythonBlockAgentMetadata, mergeBlockAgentMetadata } from "../pythonBlockKnowledge";
import { getWorkbenchProfile, type WorkbenchProfileId } from "../profiles/workbenchProfile";
import { buildProfileToolbox } from "../profiles/profileToolbox";
import { initializePlugins, pluginRegistry } from "../plugins";
import { pluginSupportsProfile } from "../plugins/core/pluginRegistry";
import type { AgentModelTransport, AgentModelTurnOptions } from "../agentTransport";
import type { AiChatCompletionResult, AiChatMessage } from "../aiConfig";

const BASE_URL = (process.env.BENCH_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, "");
const MODEL = process.env.BENCH_MODEL || "qwen3.8-flash";
const API_KEY = process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || "";
const RESULTS_DIR = fileURLToPath(new URL("../../docs/benchmarks/results", import.meta.url));
const TASK_TIMEOUT_MS = Number(process.env.BENCH_TASK_TIMEOUT_MS || 360_000);

if (!API_KEY) throw new Error("缺少 DASHSCOPE_API_KEY / OPENAI_API_KEY 环境变量");

// ---------- fetch SSE 传输层（OpenAI 兼容 /chat/completions） ----------
class FetchChatTransport implements AgentModelTransport {
  async runTurn(messages: AiChatMessage[], options: AgentModelTurnOptions): Promise<AiChatCompletionResult> {
    const body: Record<string, unknown> = { model: MODEL, stream: true, stream_options: { include_usage: true }, messages };
    if (options.tools?.length) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice ?? "auto";
    }
    // 基准默认关闭思考以提升吞吐；BENCH_THINKING=1 恢复模型默认行为。
    if (process.env.BENCH_THINKING !== "1") body.enable_thinking = false;
    const requestStarted = Date.now();
    const payload = JSON.stringify(body);
    console.log(`  [transport] 请求开始 messages=${messages.length} tools=${options.tools?.length ?? 0} 字符=${payload.length}`);
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: payload,
      signal: options.signal,
    });
    console.log(`  [transport] 响应状态 ${response.status}（首字节 ${(Date.now() - requestStarted) / 1000}s）`);
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new Error(`AI 请求失败 ${response.status}: ${text.slice(0, 400)}`);
    }
    let content = "";
    let finishReason: string | null = null;
    let usage: Record<string, unknown> | undefined;
    const toolParts = new Map<number, { id: string; name: string; args: string }>();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let chunk: Record<string, unknown>;
        try { chunk = JSON.parse(payload); } catch { continue; }
        if (chunk.usage) usage = chunk.usage as Record<string, unknown>;
        const choice = (chunk.choices as Array<Record<string, unknown>> | undefined)?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = String(choice.finish_reason);
        const delta = (choice.delta ?? {}) as Record<string, unknown>;
        const text = delta.content;
        if (typeof text === "string" && text) {
          content += text;
          options.onEvent({ type: "textDelta", delta: text });
        }
        const reasoning = delta.reasoning_content;
        if (typeof reasoning === "string" && reasoning) {
          options.onEvent({ type: "reasoningDelta", delta: reasoning });
        }
        const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(toolCalls)) {
          for (const call of toolCalls) {
            const index = typeof call.index === "number" ? call.index : 0;
            let part = toolParts.get(index);
            if (!part) { part = { id: "", name: "", args: "" }; toolParts.set(index, part); }
            const fn = call.function as Record<string, unknown> | undefined;
            if (typeof call.id === "string" && call.id) part.id = call.id;
            if (fn && typeof fn.name === "string" && fn.name) part.name = fn.name;
            const fragment = fn && typeof fn.arguments === "string" ? fn.arguments : "";
            if (fragment) {
              part.args += fragment;
              options.onEvent({ type: "toolCallDelta", index, ...(part.name ? { name: part.name } : {}), delta: fragment });
            }
          }
        }
      }
    }
    const toolCalls = [...toolParts.entries()].sort((a, b) => a[0] - b[0]).map(([, part], position) => ({
      id: part.id || `call-${position}`,
      type: "function" as const,
      function: { name: part.name, arguments: part.args || "{}" },
    }));
    const promptDetails = (usage?.prompt_tokens_details ?? undefined) as Record<string, unknown> | undefined;
    return {
      content,
      model: MODEL,
      truncated: finishReason === "length",
      toolCalls,
      ...(usage ? {
        promptTokens: usage.prompt_tokens as number | undefined,
        completionTokens: usage.completion_tokens as number | undefined,
        totalTokens: usage.total_tokens as number | undefined,
        cachedTokens: promptDetails?.cached_tokens as number | undefined,
      } : {}),
    };
  }
}

// ---------- 基准任务（依据 docs/benchmarks/ai-block-generation.md） ----------
type BenchTask = {
  id: string;
  workbench: WorkbenchProfileId;
  prompt: string;
  expectation: string;
  checks: RegExp[];
};

const hardwareTasks: Array<Omit<BenchTask, "workbench">> = [
  { id: "S1", prompt: "让板载 LED 每 500 毫秒闪烁一次。", expectation: "forever、pin write、sleep", checks: [/Pin\(/, /while True/, /sleep/] },
  { id: "S2", prompt: "读取 GPIO4 按键，按下时点亮 LED，松开时熄灭。", expectation: "if/else、pin read、pin write", checks: [/Pin\(/, /if /] },
  { id: "S3", prompt: "用 GPIO2 输出 PWM，频率 1000Hz，占空比从 0 到 1023 循环变化。", expectation: "PWM、循环", checks: [/PWM\(/, /duty|freq/, /while True|for /] },
  { id: "S4", prompt: "读取 GPIO34 的模拟值，并每 1 秒打印一次。", expectation: "ADC、print、sleep", checks: [/ADC\(/, /print\(/] },
  { id: "S5", prompt: "用 GPIO4 控制 8 颗 NeoPixel，循环显示红、绿、蓝。", expectation: "NeoPixel init/set/fill/write", checks: [/neopixel/i, /fill|write|\[/] },
  { id: "S6", prompt: "读取 GPIO4 的 DHT22 温湿度，显示到 OLED 上，每 2 秒刷新。", expectation: "DHT、OLED init/text/show", checks: [/dht/i, /oled|ssd1306|i2c/i] },
  { id: "S7", prompt: "用 GPIO2 控制舵机，在 0 度和 180 度之间来回转动。", expectation: "Servo、循环", checks: [/servo|PWM/i, /duty|angle/i] },
  { id: "S8", prompt: "做一个呼吸灯：PWM 占空比逐渐增大再减小。", expectation: "PWM、循环、变量/数学", checks: [/PWM\(/, /while True|for /, /duty/] },
];

const manimTasks: Array<Omit<BenchTask, "workbench">> = [
  { id: "M1", prompt: "创建一个 Manim 场景，显示文字“Visual Python”，等待 2 秒。", expectation: "场景、Text、wait", checks: [/Text\(|Tex\(/, /wait\(2\)/] },
  { id: "M2", prompt: "用 MathTex 显示公式 x^2 + y^2 = z^2，用 Write 动画写出，等待 1 秒。", expectation: "MathTex、Write、wait", checks: [/MathTex/, /Write/, /wait\(1\)/] },
  { id: "M3", prompt: "画一个半径 1.5 的蓝色圆，用 Create 动画创建，然后向上移动 2 个单位。", expectation: "Circle、Create、shift", checks: [/Circle/i, /Create/, /shift\(/] },
  { id: "M4", prompt: "创建一个 3x2 的橙色矩形，用 Create 显示，再缩小到 0.5 倍。", expectation: "Rectangle、Create、scale", checks: [/Rectangle/, /Create/, /scale\(/] },
  { id: "M5", prompt: "同时用 Write 显示两行文字，第一行“Hello”，第二行“Manim”，总时长 2 秒。", expectation: "多动画 play", checks: [/Hello/, /Manim/, /play\(/] },
  { id: "M6", prompt: "画一个坐标轴，并绘制 y = x^2 的图像，等待 2 秒。", expectation: "Axes、plot、wait", checks: [/Axes/, /plot/, /wait\(2\)/] },
  { id: "M7", prompt: "创建一个正方形，旋转 45 度，再改变颜色为红色。", expectation: "Square、rotate、set_color", checks: [/Square/, /rotate\(/, /set_color|red|RED/i] },
  { id: "M8", prompt: "创建一个 8 秒的小动画：标题淡入、公式写出、圆变成方形、最后等待 1 秒。", expectation: "多对象、多动画、Transform", checks: [/Transform/, /wait\(1\)/] },
];

const wroomTasks = hardwareTasks.map((task) => ({ ...task, id: task.id.replace(/^S/, "W") }));
const esp8266Tasks = hardwareTasks.map((task) => ({ ...task, id: task.id.replace(/^S/, "E") }));

const allTasks: BenchTask[] = [
  ...manimTasks.map((task) => ({ ...task, workbench: "python" as const })),
  ...hardwareTasks.map((task) => ({ ...task, workbench: "esp32-s3" as const })),
  ...wroomTasks.map((task) => ({ ...task, workbench: "esp32-wroom" as const })),
  ...esp8266Tasks.map((task) => ({ ...task, workbench: "esp8266-esp12e" as const })),
];

const only = (process.env.BENCH_ONLY || "").split(",").map((value) => value.trim()).filter(Boolean);
const tasks = only.length ? allTasks.filter((task) => only.includes(task.id)) : allTasks;

// ---------- 运行器 ----------
type TaskRecord = {
  id: string;
  workbench: string;
  prompt: string;
  expectation: string;
  status: "pass" | "structural-fail" | "keyword-fail" | "error" | "timeout";
  durationMs: number;
  rounds?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  writeTool?: string;
  fallbackCount?: number;
  blockCount?: number;
  contextIssues?: number;
  syntaxOk?: boolean;
  syntaxError?: string;
  keywordPass?: boolean;
  failedTools: Array<{ name: string; message: string }>;
  toolTrace?: Array<{ name: string; status: string; issues?: string }>;
  finalCode?: string;
  summary?: string;
  error?: string;
};

const records: TaskRecord[] = [];
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
const resultJsonPath = path.join(RESULTS_DIR, `ai-block-generation-${stamp}.json`);

function persistRecords() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(resultJsonPath, JSON.stringify({
    model: MODEL, baseUrl: BASE_URL, date: new Date().toISOString(), strategy: "Phase B 代码优先（apply_python_as_blocks）+ apply_block_program 兜底", tasks: records,
  }, null, 2), "utf8");
}

function pythonSyntaxCheck(code: string): { ok: boolean; error?: string } {
  const result = spawnSync("python", ["-c", "import ast,sys; ast.parse(sys.stdin.read())"], { input: code, encoding: "utf8", timeout: 30_000 });
  if (result.status === 0) return { ok: true };
  return { ok: false, error: String(result.stderr || result.stdout || "语法错误").slice(0, 400) };
}

function buildLabeler() {
  const previewWorkspace = new Blockly.Workspace();
  const cache = new Map<string, string>();
  return (type: string) => {
    const cached = cache.get(type);
    if (cached) return cached;
    let label = type.replace(/^visual_python_manim_|^python_/, "").replaceAll("_", " ");
    let block: Blockly.Block | null = null;
    try {
      block = previewWorkspace.newBlock(type);
      label = block.toString(140, "").replace(/\s+/g, " ").trim() || label;
    } catch {
      // 模板需要已渲染工作区时退化为类型名。
    } finally {
      block?.dispose(false);
    }
    cache.set(type, label);
    return label;
  };
}

type WorkbenchEnv = ReturnType<typeof buildWorkbenchEnv>;
const workbenchEnvs = new Map<WorkbenchProfileId, WorkbenchEnv>();

function buildWorkbenchEnv(profileId: WorkbenchProfileId) {
  const profile = getWorkbenchProfile(profileId);
  if (profile.kind === "micropython") setActiveHardwareBoard(profile.boardId);
  const definition = buildProfileToolbox(pluginRegistry.extendToolbox(baseToolbox, profileId), profile);
  const labeler = buildLabeler();
  const metadataForType = (type: string) => mergeBlockAgentMetadata(getPythonBlockAgentMetadata(type), pluginRegistry.getBlockKnowledgeMetadata(type));
  const index = createBlockSearchIndex(definition, labeler, undefined, { metadataForType });
  const capabilities = pluginRegistry.getRecords()
    .filter((record) => record.state === "active" && pluginSupportsProfile(record.plugin.manifest, profileId) && record.plugin.manifest.agent)
    .map((record) => ({
      id: record.plugin.manifest.id,
      name: record.plugin.manifest.name,
      description: record.plugin.manifest.agent!.description,
      tools: pluginRegistry.getAgentToolNames(record.plugin.manifest.id),
      fileTypes: record.plugin.manifest.agent!.fileTypes,
      detect: record.plugin.manifest.agent!.detect,
      codegen: record.plugin.manifest.agent!.codegen,
      active: true,
    }));
  const entryBlockTypes = capabilities.flatMap((capability) => (capability.codegen?.entryBlock ? [capability.codegen.entryBlock] : []));
  return { profileId, profile, index, capabilities, entryBlockTypes };
}

async function runTask(task: BenchTask): Promise<TaskRecord> {
  const env = workbenchEnvs.get(task.workbench)!;
  const record: TaskRecord = { id: task.id, workbench: task.workbench, prompt: task.prompt, expectation: task.expectation, status: "error", durationMs: 0, failedTools: [] };
  const started = Date.now();
  const workspace = new Blockly.Workspace();
  const blocklyToolNames = new Set<string>(allBlocklyToolNames);
  const validateContexts = (candidate: Blockly.Workspace) =>
    env.profile.kind === "micropython"
      ? collectHardwareBlockIssues(candidate, env.profile.boardId)
      : validatePythonBlockContexts(candidate);
  const services = {
    workspace,
    selectedBlockId: () => null,
    getTaskBlockDirectory: (target: string, limit?: number) => createTaskBlockDirectory(env.index, target, { limit, describe: describeBlocklyBlockContract }),
    searchBlocks: (query: string, limit: number) => searchBlockIndex(env.index, query, limit).map((entry) => ({
      type: entry.type, label: entry.label, category: entry.category, state: entry.item, ...describeBlocklyBlockContract(entry.type, entry.item),
    })),
    getBlockTemplates: (types: string[]) => {
      const wanted = new Set(types);
      return env.index.filter((entry) => wanted.has(entry.type)).map((entry) => ({
        type: entry.type, label: entry.label, category: entry.category, state: entry.item, ...describeBlocklyBlockContract(entry.type, entry.item),
      }));
    },
    generateCode: (ws: Blockly.Workspace) => generateWorkspacePython(ws),
    validateContexts,
    validateCode: async (code: string) => {
      const check = pythonSyntaxCheck(code);
      if (!check.ok) throw new Error(`Python 语法错误：${check.error}`);
    },
    convertPythonToWorkspace: (code: string): object =>
      env.profile.features.manim ? manimPythonToWorkspace(code)
        : env.profile.kind === "micropython" ? micropythonToWorkspace(code, env.profile.boardId)
        : (() => { throw new Error("当前工作台没有转换器"); })(),
    commit: (state: object, code: string) => {
      Blockly.serialization.workspaces.load(state as Parameters<typeof Blockly.serialization.workspaces.load>[0], workspace);
      record.finalCode = code;
    },
    entryBlockTypes: env.entryBlockTypes,
  };
  const executeBlockly = createBlocklyToolExecutor(services);
  const activityLog: Array<{ kind: string; status: string; toolName?: string; detail?: string; result?: Record<string, unknown> }> = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TASK_TIMEOUT_MS);
  try {
    const snapshot = () => ({
      workspaceMode: "visual" as const,
      workbench: { id: env.profile.id, label: env.profile.label, kind: env.profile.kind, ...(env.profile.kind === "micropython" ? { boardId: env.profile.boardId } : {}) },
      project: { name: `benchmark-${task.id}` },
      code: generateWorkspacePython(workspace),
      lineCount: generateWorkspacePython(workspace).split("\n").length,
      capabilities: env.capabilities.map((capability) => capability.name),
      plugins: env.capabilities.map((capability) => capability.id),
    });
    const host = {
      executeTool: async (name: string, args: Record<string, unknown>, signal: AbortSignal) => {
        if (blocklyToolNames.has(name)) return executeBlockly(name, args, signal);
        if (name === "get_context") return { ...snapshot(), running: false };
        if (name === "get_diagnostics") return { output: [], problems: [] };
        if (name === "web_search") return { ok: false, error: "基准环境未接入网络搜索，请基于当前工作台能力完成任务，不要重试本工具" };
        return { ok: false, error: `工具 ${name} 在无头基准环境不可用（没有设备连接、运行时或文件系统）。不要重试本工具，也不要改用其它执行类工具；若积木已写入并通过校验，请直接总结并结束任务` };
      },
      getSnapshot: snapshot,
      getBlockCatalog: () => JSON.stringify(createBlockCatalog(env.index, describeBlocklyBlockContract)),
      getCapabilities: () => env.capabilities,
      getTools: () => blocklyAgentTools,
    };
    const result = await runAgentCore({
      prompt: task.prompt,
      mode: "agent",
      reasoningEffort: "high",
      permissionMode: "auto",
      host,
      signal: controller.signal,
      transport: new FetchChatTransport(),
      onEvent: (event) => {
        activityLog.push({ kind: String(event.kind), status: String(event.status), ...(event.toolName ? { toolName: String(event.toolName) } : {}), ...(event.detail ? { detail: String(event.detail) } : {}), ...(event.result ? { result: event.result as Record<string, unknown> } : {}) });
      },
      onProgress: (progress) => console.log(`  [${task.id}] ${progress.phase}：${progress.label}`),
    });
    record.summary = result.summary;
    record.rounds = result.tokenUsage?.rounds;
    record.totalTokens = result.tokenUsage?.totalTokens;
    record.promptTokens = result.tokenUsage?.prompt;
    record.completionTokens = result.tokenUsage?.completion;
    const generated = generateWorkspacePython(workspace);
    record.finalCode = record.finalCode || generated;
    record.blockCount = workspace.getAllBlocks(false).length;
    record.contextIssues = validateContexts(workspace).length;
    const syntax = pythonSyntaxCheck(generated);
    record.syntaxOk = syntax.ok;
    if (!syntax.ok) record.syntaxError = syntax.error;
    record.keywordPass = task.checks.every((pattern) => pattern.test(generated));
    record.status = "pass"; // 乐观占位，finally 中按结构/关键词复核。
  } catch (error) {
    record.status = controller.signal.aborted ? "timeout" : "error";
    record.error = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
  } finally {
    // 无论成败都从活动日志聚合工具轨迹（超时也能拿到诊断）。
    record.toolTrace = activityLog
      .filter((activity) => activity.kind === "tool")
      .slice(0, 60)
      .map((activity) => {
        const result = activity.result as Record<string, unknown> | undefined;
        const issues = Array.isArray(result?.issues) ? JSON.stringify(result!.issues).slice(0, 400) : undefined;
        return { name: activity.toolName ?? "?", status: activity.status, ...(issues ? { issues } : {}) };
      });
    for (const activity of activityLog) {
      if (activity.kind === "tool" && activity.status === "error" && activity.toolName && activity.detail) {
        record.failedTools.push({ name: activity.toolName, message: activity.detail.slice(0, 200) });
      }
      if (activity.kind === "tool" && activity.status === "done" && activity.toolName && (activity.toolName === "apply_python_as_blocks" || activity.toolName === "apply_block_program" || activity.toolName === "apply_block_tree")) {
        const ok = (activity.result as Record<string, unknown> | undefined)?.ok !== false;
        if (ok && !record.writeTool) {
          record.writeTool = activity.toolName;
          record.fallbackCount = Number((activity.result as Record<string, unknown>)?.fallbackCount ?? 0) || undefined;
        }
      }
    }
    clearTimeout(timer);
    workspace.dispose();
    record.durationMs = Date.now() - started;
    // 状态判定放在工具轨迹聚合之后：超时/异常优先，其次结构，最后语义关键词。
    if (record.status === "timeout" && record.writeTool) {
      // 写入已成功提交、只是智能体没在时限内收尾：功能达成，单列出来。
      record.status = "timeout-written";
    }
    if (record.status !== "error" && record.status !== "timeout" && record.status !== "timeout-written") {
      if (!record.writeTool || !record.blockCount) record.status = "structural-fail";
      else if (record.contextIssues || record.syntaxOk === false) record.status = "structural-fail";
      else if (!record.keywordPass) record.status = "keyword-fail";
      else record.status = "pass";
    }
    records.push(record);
    persistRecords();
  }
  return record;
}

beforeAll(async () => {
  await initializePlugins();
  for (const id of ["python", "esp32-s3", "esp32-wroom", "esp8266-esp12e"] as WorkbenchProfileId[]) {
    workbenchEnvs.set(id, buildWorkbenchEnv(id));
  }
}, 240_000);

describe("AI 积木生成基准（32 项，四工作台）", () => {
  for (const task of tasks) {
    it(`${task.id}：${task.prompt}（${task.workbench}）`, async () => {
      const record = await runTask(task);
      console.log(`[${record.id}] ${record.status} 工具=${record.writeTool ?? "-"} 块=${record.blockCount ?? 0} fallback=${record.fallbackCount ?? 0} 语法=${record.syntaxOk ?? "-"} 关键词=${record.keywordPass ?? "-"} 轮次=${record.rounds ?? "-"} 用时=${(record.durationMs / 1000).toFixed(1)}s`);
      if (record.status === "error" || record.status === "timeout") {
        console.log(`  失败原因：${record.error?.slice(0, 200)}`);
      }
    }, TASK_TIMEOUT_MS + 60_000);
  }
});

afterAll(() => {
  const summary = {
    model: MODEL,
    total: records.length,
    pass: records.filter((record) => record.status === "pass").length,
    keywordFail: records.filter((record) => record.status === "keyword-fail").length,
    structuralFail: records.filter((record) => record.status === "structural-fail").length,
    errorOrTimeout: records.filter((record) => record.status === "error" || record.status === "timeout").length,
    byWorkbench: {} as Record<string, { total: number; pass: number; codeFirst: number; tree: number }>,
    byTool: { codeFirst: 0, tree: 0, none: 0 },
  };
  for (const record of records) {
    const bucket = summary.byWorkbench[record.workbench] ?? { total: 0, pass: 0, codeFirst: 0, tree: 0 };
    bucket.total += 1;
    if (record.status === "pass") bucket.pass += 1;
    if (record.writeTool === "apply_python_as_blocks") { bucket.codeFirst += 1; summary.byTool.codeFirst += 1; }
    else if (record.writeTool) { bucket.tree += 1; summary.byTool.tree += 1; }
    else summary.byTool.none += 1;
    summary.byWorkbench[record.workbench] = bucket;
  }
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const reportPath = path.join(RESULTS_DIR, `summary-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), "utf8");
  console.log("\n===== 基准汇总 =====");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`明细：${resultJsonPath}`);
  console.log(`汇总：${reportPath}`);
});
