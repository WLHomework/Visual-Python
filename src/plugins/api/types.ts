import type * as Blockly from "blockly/core";
import type { pythonGenerator } from "blockly/python";
import type { AiChatToolDefinition } from "../../aiConfig";
import type { WorkspaceMode } from "../../workspaceMode";

export const PLUGIN_API_VERSION = "1";

export type PluginState = "discovered" | "disabled" | "loading" | "active" | "error";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: string;
  description?: string;
  builtin?: boolean;
  entry?: string;
  python?: { packages?: string[]; minimumVersion?: string };
  agent?: {
    description: string;
    purpose?: string;
    aliases?: string[];
    keywords?: string[];
    capabilities?: string[];
    dependencies?: string[];
    recommendedFor?: string[];
    avoidFor?: string[];
    intentTags?: string[];
    tools?: string[];
    fileTypes?: string[];
    detect?: "imports" | "content" | "project";
    codegen?: {
      entryBlock?: string;
      statementInput?: string;
      runtimeNames?: string[];
    };
  };
}

export type PythonBlockGenerator = (
  block: Blockly.Block,
  generator: typeof pythonGenerator,
) => string | [string, number];

export interface PluginBlockAgentMetadata {
  description?: string;
  purpose?: string;
  aliases?: string[];
  keywords?: string[];
  examples?: string[];
  capabilities?: string[];
  dependencies?: string[];
  inputDescriptions?: Record<string, string>;
  inputTypes?: Record<string, string>;
  outputType?: string;
  statement?: boolean;
  requires?: string[];
  relatedBlocks?: string[];
  recommendedFor?: string[];
  avoidFor?: string[];
  intentTags?: string[];
}

export interface PluginWorkspaceIssue {
  blockId?: string;
  message: string;
}

export type PluginWorkspaceValidator = (workspace: Blockly.Workspace) => PluginWorkspaceIssue[];

export interface PluginBlockDefinition extends Record<string, unknown> {
  type: string;
  agent?: PluginBlockAgentMetadata;
}

export interface PluginToolboxCategory {
  id: string;
  name: string;
  colour: string;
  contents: Array<Record<string, unknown>>;
}

export interface PluginSettingContribution {
  id: string;
  label: string;
  type: "boolean" | "string" | "number" | "select";
  defaultValue: boolean | string | number;
  options?: Array<{ label: string; value: string }>;
}

export interface PluginProjectSerializer {
  id: string;
  save(): unknown;
  load(state: unknown): void;
  clear?(): void;
}

export interface PluginCodeDocumentHandler {
  id: string;
  matches(code: string): boolean;
  name(code: string, fallback: string): string;
}

export interface PluginCommand {
  id: string;
  title: string;
  run(...args: unknown[]): unknown | Promise<unknown>;
}

export interface PluginAgentRuntime {
  executeCapability(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>>;
}

export interface PluginAgentTool {
  id: string;
  definition: AiChatToolDefinition;
  label: string;
  workspaceModes?: WorkspaceMode[];
  readOnly?: boolean;
  changesState?: boolean;
  requiresPermission?: boolean;
  longRunning?: boolean;
  mutation?: boolean;
  verificationTool?: string;
  executionLabels?: {
    running: string;
    success: string;
    failure: string;
  };
  execution?: {
    stateField: string;
    verificationTool?: string;
  };
  execute?(args: Record<string, unknown>, runtime: PluginAgentRuntime, signal: AbortSignal): Promise<Record<string, unknown>>;
}

export interface PluginProblem {
  pluginId: string;
  message: string;
  detail?: string;
}

export interface PluginContext {
  readonly pluginId: string;
  registerBlock(definition: PluginBlockDefinition, generator: PythonBlockGenerator): void;
  registerToolboxCategory(category: PluginToolboxCategory): void;
  registerSetting(setting: PluginSettingContribution): void;
  registerProjectSerializer(serializer: PluginProjectSerializer): void;
  registerCodeDocumentHandler(handler: PluginCodeDocumentHandler): void;
  registerCommand(command: PluginCommand): void;
  registerAgentTool(tool: PluginAgentTool): void;
  registerWorkspaceValidator(id: string, validator: PluginWorkspaceValidator): void;
  reportProblem(message: string, detail?: string): void;
}

export interface VisualPythonPlugin {
  manifest: PluginManifest;
  activate(context: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export interface PluginRecord {
  plugin: VisualPythonPlugin;
  state: PluginState;
  error?: string;
}

export interface PluginProjectRequirement {
  id: string;
  version: string;
}

export interface PluginProjectState {
  requirements: PluginProjectRequirement[];
  data: Record<string, unknown>;
}

export interface PluginCompatibilityIssue {
  pluginId: string;
  kind: "missing" | "version" | "activation";
  message: string;
}

export interface ExternalPluginDiscovery {
  path: string;
  manifest?: PluginManifest;
  valid: boolean;
  errors: string[];
}

export interface ExternalPluginDiscoveryResponse {
  pluginsDir: string;
  entries: ExternalPluginDiscovery[];
}

export interface ExternalPluginEntry {
  path: string;
  manifest: PluginManifest;
  source: string;
}
