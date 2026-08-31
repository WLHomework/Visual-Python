import type { AiAgentActivity, AiConversationTurn } from "./agentV2/types";

export type AiConversationRunForContext = {
  id: number;
  prompt: string;
  request?: string;
  status: string;
  result?: { summary?: string; clarification?: unknown };
  error?: string;
  activities: AiAgentActivity[];
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

function activityEvidence(activity: AiAgentActivity): string | null {
  if (activity.kind === "message") return compact(activity.title, 360) ? `说明：${compact(activity.title, 360)}` : null;
  const important = activity.status === "error" || activity.codeChange || activity.execution?.state === "failed";
  if (!important) return null;
  const detail = compact(activity.detail, 500);
  const result = compact(activity.result, 1200);
  const execution = activity.execution?.state === "failed" ? "执行失败" : "";
  return [activity.status === "error" ? `工具失败：${compact(activity.title, 160)}` : `工具：${compact(activity.title, 160)}`, detail, execution, result].filter(Boolean).join("；");
}

export function buildAiConversationHistory(runs: AiConversationRunForContext[]): AiConversationTurn[] {
  return runs
    .filter((run) => run.status === "done" || run.status === "error")
    .slice(-12)
    .flatMap((run) => {
      const evidence = run.activities.slice(-16).flatMap((activity) => {
        const item = activityEvidence(activity);
        return item ? [item] : [];
      });
      const summary = compact(run.result?.summary, 1800);
      const error = compact(run.error, 1800);
      const assistant = [summary ? `结果：${summary}` : "", error ? `任务失败：${error}` : "", ...evidence]
        .filter(Boolean)
        .join("\n")
        .slice(0, 7000);
      if (!assistant) return [];
      return [{
        user: compact(run.request || run.prompt, 4000),
        assistant,
        ...(run.result?.clarification ? { clarification: true } : {}),
      }];
    });
}
