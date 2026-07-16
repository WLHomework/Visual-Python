import type * as Blockly from "blockly/core";
import type { pythonGenerator } from "blockly/python";

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
}

export type PythonBlockGenerator = (
  block: Blockly.Block,
  generator: typeof pythonGenerator,
) => string | [string, number];

export interface PluginBlockDefinition extends Record<string, unknown> {
  type: string;
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

export interface PluginCommand {
  id: string;
  title: string;
  run(...args: unknown[]): unknown | Promise<unknown>;
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
  registerCommand(command: PluginCommand): void;
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
