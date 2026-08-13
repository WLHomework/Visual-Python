import type { AgentConversationTurn } from "./types";

export type AgentMemory = {
  facts: string[];
  decisions: string[];
  evidence: string[];
};

const limit = 8;
const trim = (value: string, max = 700) => value.length > max ? `${value.slice(0, max)}...` : value;

export function createAgentMemory(history: AgentConversationTurn[]): AgentMemory {
  return {
    facts: history.slice(-3).map((turn) => trim(`用户：${turn.user}`)),
    decisions: history.slice(-3).map((turn) => trim(`上一轮结果：${turn.assistant}`)),
    evidence: [],
  };
}

export function rememberAgentEvidence(memory: AgentMemory, label: string, result: string): void {
  memory.evidence = [...memory.evidence, trim(`${label}：${result}`)].slice(-limit);
}

export function rememberAgentDecision(memory: AgentMemory, decision: string): void {
  memory.decisions = [...memory.decisions, trim(decision)].slice(-limit);
}

export function serializeAgentMemory(memory: AgentMemory): string {
  const sections = [
    memory.facts.length ? `已知事实：\n${memory.facts.map((item) => `- ${item}`).join("\n")}` : "",
    memory.decisions.length ? `已做决策：\n${memory.decisions.map((item) => `- ${item}`).join("\n")}` : "",
    memory.evidence.length ? `验证证据：\n${memory.evidence.map((item) => `- ${item}`).join("\n")}` : "",
  ].filter(Boolean);
  return sections.length ? `任务记忆摘要：\n${sections.join("\n")}` : "任务记忆摘要：暂无额外记录。";
}
