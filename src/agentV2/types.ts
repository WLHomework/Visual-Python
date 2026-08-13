import type { AiChatMessage, AiChatToolCall, AiChatToolDefinition } from "../aiConfig";
import type { SceneDocument } from "../sceneDocuments";

export type AgentMode = "agent" | "plan";
export type AiAgentMode = AgentMode;
export type AiAgentToolName = string;

export type AgentActivityKind = "message" | "thinking" | "decision" | "tool" | "observation" | "verification" | "question";
export type AgentActivityStatus = "running" | "done" | "error" | "stopped";

export type AgentCodeChange = {
  before: string;
  after: string;
  sceneId?: string;
  sceneName?: string;
};

export type AgentActivityEvent = {
  id: string;
  kind: AgentActivityKind;
  status: AgentActivityStatus;
  title: string;
  markdown?: string;
  detail?: string;
  toolName?: string;
  result?: Record<string, unknown>;
  resultText?: string;
  codeChange?: AgentCodeChange;
  parentId?: string;
};

export type AiAgentExecution = {
  kind: "python" | "manim";
  state: "running" | "completed" | "failed";
  label: string;
  elapsedSeconds?: number;
  scene?: string;
  percent?: number;
  output: Array<{ stream: "stdout" | "stderr" | "system"; data: string }>;
  problems: Array<{ kind: string; line: number; message: string; suggestion?: string }>;
  renderOutput?: { type: "video" | "image"; scene: string; path: string; transparentBackground?: boolean };
  video?: { scene: string; path: string };
};

export type AiAgentActivity = {
  id: string;
  kind: "message" | "tool";
  status: AgentActivityStatus;
  title: string;
  channel?: AgentActivityKind;
  detail?: string;
  result?: string;
  toolName?: AiAgentToolName;
  codeChange?: AiCodeChangeSnapshot;
  execution?: AiAgentExecution;
  undone?: boolean;
};

export type AiCodeChangeSnapshot = AgentCodeChange;
export type AiCodeEdit = { oldText: string; newText: string; replaceAll?: boolean };

export type AgentConversationTurn = {
  user: string;
  assistant: string;
  clarification?: boolean;
};
export type AiConversationTurn = AgentConversationTurn;

export type AgentTokenUsage = {
  prompt: number;
  completion: number;
  total: number;
  requests: number;
  rounds: number;
  inputCharacters: number;
  toolSchemaCharacters: number;
  toolResultCharacters: number;
  cached: number;
  uncachedPrompt: number;
  cacheCreation: number;
  cacheReportedRequests: number;
  cacheHitRate?: number;
};
export type AiAgentTokenUsage = AgentTokenUsage;

export type AgentClarification = {
  question: string;
  options: string[];
};
export type AiClarification = AgentClarification;

export type AiAgentPlanStep = { step: string; status: "pending" | "in_progress" | "completed" };
export type AiAgentPermissionRequest = { id: string; toolName: AiAgentToolName; title: string; detail: string };
export type AiTaskChangeSnapshot = {
  before: SceneDocument[];
  after: SceneDocument[];
  beforeActiveSceneId: string;
  afterActiveSceneId: string;
};
export type AiAgentProgress = {
  phase: "preparing" | "waiting" | "thinking" | "responding" | "preparingTool" | "executingTool";
  label: string;
  taskPlan?: AiAgentPlanStep[];
  tokenUsage?: AiAgentTokenUsage;
};
export type AiAgentResult = {
  summary: string;
  toolCallCount: number;
  lineCount: number;
  tokenUsage?: AiAgentTokenUsage;
  mode?: AiAgentMode;
  intent?: "chat" | "inspect" | "execute";
  planPrompt?: string;
  taskPlan?: AiAgentPlanStep[];
  taskChange?: AiTaskChangeSnapshot;
  clarification?: AiClarification;
};

export type AgentExecutionObservation = Record<string, unknown>;

export type AgentHost = {
  getSnapshot: () => Record<string, unknown>;
  executeTool: (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<Record<string, unknown>>;
  observeExecution?: (toolName: string, signal: AbortSignal) => Promise<AgentExecutionObservation>;
};

export type AgentRunResult = {
  summary: string;
  toolCallCount: number;
  tokenUsage: AgentTokenUsage;
  clarification?: AgentClarification;
};

export type AgentProgress = {
  phase: "preparing" | "thinking" | "executing" | "observing" | "responding" | "completed";
  label: string;
  tokenUsage?: AgentTokenUsage;
};

export type RunVisualPythonAgentArgs = {
  prompt: string;
  history?: AgentConversationTurn[];
  mode?: AgentMode;
  host: AgentHost;
  onEvent: (event: AgentActivityEvent) => void;
  onProgress?: (progress: AgentProgress) => void;
  permissionMode?: "auto" | "confirm";
  onPermissionRequest?: (request: { id: string; toolName: string; title: string; detail: string }) => Promise<boolean>;
  signal: AbortSignal;
};

export type AgentModelRequest = {
  messages: AiChatMessage[];
  tools: AiChatToolDefinition[];
  toolCalls: AiChatToolCall[];
};
