import type { AiAgentActivity, AiConversationTurn } from "./agentV2/types";
import type { AiImageAttachment } from "./aiImageAttachments";

export type AiConversationRunForContext = {
  id: number;
  prompt: string;
  request?: string;
  status: string;
  result?: { summary?: string; clarification?: unknown };
  error?: string;
  activities: AiAgentActivity[];
  attachments?: AiImageAttachment[];
};

const compact = (value: string | undefined, limit: number) => {
  const text = (value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
};

export function createAiConversationScope(projectId: string, sceneId: string): string {
  const project = compact(projectId, 160) || "project-unknown";
  const scene = compact(sceneId, 160) || "scene-unknown";
  return `${project}::${scene}`;
}

// 这些工具成功返回意味着工作区/代码确实被改动过——跨轮次继续修改必须知道。
const successfulWriteToolNames = new Set([
  "apply_python_as_blocks",
  "apply_block_program",
  "apply_block_tree",
  "apply_block_plan",
  "replace_code",
  "edit_code",
  "insert_statements",
  "replace_function_body",
  "add_import",
  "format_code",
]);

function writeToolEvidence(activity: AiAgentActivity): string | null {
  if (activity.kind !== "tool" || activity.status !== "done" || !activity.toolName) return null;
  if (!successfulWriteToolNames.has(activity.toolName) || activity.codeChange) return null;
  let detail = "";
  try {
    const parsed = JSON.parse(activity.result || "{}") as { ok?: unknown; changed?: unknown; blockCount?: unknown; fallbackCount?: unknown };
    if (parsed.ok === false) return null;
    const parts = [
      typeof parsed.blockCount === "number" ? `积木 ${parsed.blockCount} 块` : "",
      typeof parsed.fallbackCount === "number" && parsed.fallbackCount > 0 ? `原始语句回退 ${parsed.fallbackCount} 条` : "",
    ].filter(Boolean);
    detail = parts.length ? `（${parts.join("，")}）` : "";
  } catch {
    // result 不是 JSON 时只记录标题。
  }
  return `已写入：${compact(activity.title, 160)}${detail}`;
}

function activityEvidence(activity: AiAgentActivity): string | null {
  if (activity.kind === "message") return compact(activity.title, 360) ? `说明：${compact(activity.title, 360)}` : null;
  const writeEvidence = writeToolEvidence(activity);
  if (writeEvidence) return writeEvidence;
  const important = activity.status === "error" || activity.codeChange || activity.execution?.state === "failed";
  if (!important) return null;
  const detail = compact(activity.detail, 500);
  const result = compact(activity.result, 1200);
  const execution = activity.execution?.state === "failed" ? "执行失败" : "";
  return [activity.status === "error" ? `工具失败：${compact(activity.title, 160)}` : `工具：${compact(activity.title, 160)}`, detail, execution, result].filter(Boolean).join("；");
}

export function buildAiConversationHistory(runs: AiConversationRunForContext[]): AiConversationTurn[] {
  return runs
    .filter((run) => run.status === "done" || run.status === "error" || run.status === "stopped")
    .slice(-12)
    .flatMap((run) => {
      const evidence = run.activities.slice(-16).flatMap((activity) => {
        const item = activityEvidence(activity);
        return item ? [item] : [];
      });
      const summary = compact(run.result?.summary, 1800);
      const error = compact(run.error, 1800);
      const attachments = (run.attachments || []).filter((attachment) => attachment.sendable && Boolean(attachment.dataUrl));
      const imageMetadata = (run.attachments || [])
        .map((attachment) => `${attachment.name} (${attachment.width}x${attachment.height})`)
        .join(", ");
      // 被停止的任务往往已经改动过工作区：必须保留已完成部分，否则下一轮会在不知情的情况下重复或冲突写入。
      const stoppedNote = run.status === "stopped" ? "任务被用户停止、未正式收尾；以下为停止前已完成的部分（工作区可能已被改动）" : "";
      const assistant = [stoppedNote, summary ? `结果：${summary}` : "", error ? `任务失败：${error}` : "", ...evidence]
        .filter(Boolean)
        .join("\n")
        .slice(0, 7000);
      if (!assistant) return [];
      return [{
        user: compact([run.request || run.prompt, imageMetadata ? `图片附件：${imageMetadata}` : ""].filter(Boolean).join("\n"), 4000),
        assistant,
        ...(attachments.length ? { attachments } : {}),
        ...(run.result?.clarification ? { clarification: true } : {}),
      }];
    });
}
