import type { AgentConversationTurn } from "./types";

export type AgentMemory = {
  facts: string[];
  decisions: string[];
  evidence: string[];
};

const limit = 8;
const trim = (value: string, max = 700) => value.length > max ? `${value.slice(0, max)}...` : value;

export function createAgentMemory(history: AgentConversationTurn[]): AgentMemory {
  // 历史轮次本身会作为真实消息重放（见 context.ts historyMessages），
  // 这里不再用同样的内容填充摘要，避免同一请求里双份注入；
  // memory 只承载本轮运行中积累的证据与决策。
  void history;
  return { facts: [], decisions: [], evidence: [] };
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
  // 没有累积记录时返回空串，调用方按需拼接，避免每轮请求都带一句"暂无记录"。
  return sections.length ? `任务记忆摘要：\n${sections.join("\n")}` : "";
}
