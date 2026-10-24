/**
 * Token 估算与请求装配预算。
 *
 * 估算器不依赖分词器：CJK 字符按 ~1 token/字、其余按 ~4 字符/token。
 * 这是启发式，各预算常量因此保守取值（宁可少发、不可超窗）；
 * 如果后续接入真实的分词计量，只需替换 estimateTokens 一处。
 */

// CJK 统一表意文字、假名、全角符号与兼容区。
const cjkPattern = /[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/g;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = text.match(cjkPattern)?.length ?? 0;
  const rest = text.length - cjk;
  return cjk + Math.ceil(rest / 4);
}

/** 截断到估算 token 预算内；CJK 密集时逐步收紧而不是一次性砍半。 */
export function truncateToTokens(value: string, maxTokens: number): string {
  if (estimateTokens(value) <= maxTokens) return value;
  let limit = Math.min(value.length, maxTokens);
  let sliced = value.slice(0, limit);
  while (estimateTokens(sliced) > maxTokens && sliced.length > 0) {
    limit = Math.max(0, Math.floor(limit * 0.8));
    sliced = value.slice(0, limit);
  }
  return `${sliced}\n[内容已截断]`;
}

export const tokenBudgets = {
  /** 对话历史整体（historyMessages 与面板 trim 共用口径）。 */
  history: 16_000,
  /** 单条历史消息（user/assistant 各自的上限）。 */
  historyPerMessage: 3_000,
  /** 初始请求整体护栏（系统提示 + 快照 + 任务 + 记忆）。 */
  initialRequest: 60_000,
  /** 积木目录（图形化任务附带）。 */
  blockCatalog: 24_000,
  /** Codex 交接提示词内的目录摘要。 */
  blockCatalogForPrompt: 4_000,
  /** 运行中请求消息列表的护栏，超过则压缩工具回合。 */
  toolHistory: 16_000,
  /** 压缩后的工具证据上限。 */
  compactedToolHistory: 6_000,
} as const;
