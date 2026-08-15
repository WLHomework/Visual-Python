import * as Blockly from "blockly/core";
import { pythonGenerator } from "blockly/python";
import { localizeBlockDefinition } from "../../blockDisplayLocalization";
import {
  PLUGIN_API_VERSION,
  type PluginAgentRuntime,
  type PluginAgentTool,
  type PluginBlockDefinition,
  type PluginCommand,
  type PluginCodeDocumentHandler,
  type PluginContext,
  type PluginManifest,
  type PluginProblem,
  type PluginProjectState,
  type PluginProjectSerializer,
  type PluginRecord,
  type PluginSettingContribution,
  type PluginToolboxCategory,
  type PythonBlockGenerator,
  type VisualPythonPlugin,
} from "../api/types";

type Contributions = {
  blockTypes: Set<string>;
  categories: PluginToolboxCategory[];
  settings: PluginSettingContribution[];
  serializers: PluginProjectSerializer[];
  documentHandlers: PluginCodeDocumentHandler[];
  commands: PluginCommand[];
  agentTools: PluginAgentTool[];
};

const emptyContributions = (): Contributions => ({
  blockTypes: new Set(), categories: [], settings: [], serializers: [], documentHandlers: [], commands: [], agentTools: [],
});

const pluginPrefix = (pluginId: string) => `${pluginId.replace(/[^A-Za-z0-9_]/g, "_")}_`;

export class PluginRegistry {
  private records = new Map<string, PluginRecord>();
  private contributions = new Map<string, Contributions>();
  private problems: PluginProblem[] = [];
  private listeners = new Set<() => void>();

  register(plugin: VisualPythonPlugin) {
    this.validateManifest(plugin.manifest);
    if (this.records.has(plugin.manifest.id)) throw new Error(`插件 ID 重复：${plugin.manifest.id}`);
    this.records.set(plugin.manifest.id, { plugin, state: "discovered" });
    this.contributions.set(plugin.manifest.id, emptyContributions());
    this.emitChange();
  }

  async activate(pluginId: string) {
    const record = this.requireRecord(pluginId);
    if (record.state === "active" || record.state === "loading") return;
    record.state = "loading";
    record.error = undefined;
    this.emitChange();
    try {
      await record.plugin.activate(this.createContext(record.plugin.manifest));
      const contribution = this.contributions.get(pluginId);
      if (!contribution || !this.hasContributions(contribution)) {
        throw new Error("插件 activate() 未注册任何插件能力");
      }
      if (contribution.blockTypes.size > 0 && contribution.categories.length === 0) {
        throw new Error("插件注册了积木，但没有注册工具箱分类");
      }
      record.state = "active";
    } catch (error) {
      this.clearContributions(pluginId);
      record.state = "error";
      record.error = String(error);
      this.problems.push({ pluginId, message: "插件激活失败", detail: String(error) });
    }
    this.emitChange();
  }

  async deactivate(pluginId: string) {
    const record = this.requireRecord(pluginId);
    if (record.state === "active") await record.plugin.deactivate?.();
    this.clearContributions(pluginId);
    record.state = "disabled";
    record.error = undefined;
    this.emitChange();
  }

  async unregister(pluginId: string) {
    const record = this.requireRecord(pluginId);
    if (record.state === "active") await record.plugin.deactivate?.();
    this.clearContributions(pluginId);
    this.records.delete(pluginId);
    this.contributions.delete(pluginId);
    this.problems = this.problems.filter((problem) => problem.pluginId !== pluginId);
    this.emitChange();
  }

  getRecords(): PluginRecord[] {
    return [...this.records.values()].map((record) => ({ ...record }));
  }

  getRecord(pluginId: string) {
    const record = this.records.get(pluginId);
    return record ? { ...record } : undefined;
  }

  getProblems(): PluginProblem[] {
    return [...this.problems];
  }

  getBlockTypes(pluginId: string) {
    return [...(this.contributions.get(pluginId)?.blockTypes ?? [])];
  }

  generatePythonSamples(pluginId: string) {
    const record = this.requireRecord(pluginId);
    if (record.state !== "active") throw new Error(`插件尚未激活：${pluginId}`);
    return this.getBlockTypes(pluginId).sort().map((blockType) => {
      const workspace = new Blockly.Workspace();
      try {
        workspace.newBlock(blockType);
        return { blockType, code: pythonGenerator.workspaceToCode(workspace) };
      } catch (error) {
        throw new Error(`无法生成积木 ${blockType} 的 Python 测试代码：${String(error)}`);
      } finally {
        workspace.dispose();
      }
    });
  }

  getSettings() {
    return this.activeContributions().flatMap((entry) => entry.settings);
  }

  getProjectSerializers() {
    return this.activeContributions().flatMap((entry) => entry.serializers);
  }

  resolveCodeDocumentName(code: string, fallback: string) {
    const handler = this.activeContributions().flatMap((entry) => entry.documentHandlers).find((item) => item.matches(code));
    return handler?.name(code, fallback) || fallback;
  }

  getCommands() {
    return this.activeContributions().flatMap((entry) => entry.commands);
  }

  getAgentTools() {
    return this.activeEntries().flatMap(([pluginId, , contribution]) => contribution.agentTools.map((tool) => ({ pluginId, tool })));
  }

  getAgentToolNames(pluginId: string) {
    return this.getAgentTools()
      .filter((entry) => entry.pluginId === pluginId)
      .map(({ tool }) => tool.definition.function.name);
  }

  async executeAgentTool(name: string, args: Record<string, unknown>, createRuntime: (pluginId: string) => PluginAgentRuntime, signal: AbortSignal) {
    const matches = this.getAgentTools().filter(({ tool }) => tool.definition.function.name === name);
    if (matches.length !== 1 || !matches[0].tool.execute) throw new Error(`插件 Agent 工具不可执行：${name}`);
    return matches[0].tool.execute(args, createRuntime(matches[0].pluginId), signal);
  }

  createProjectState(workspace: Blockly.Workspace): PluginProjectState | undefined {
    const workspaceTypes = new Set(workspace.getAllBlocks(false).map((block) => block.type));
    const requirements = new Map<string, string>();
    const data: Record<string, unknown> = {};
    for (const [pluginId, record, contribution] of this.activeEntries()) {
      if ([...contribution.blockTypes].some((type) => workspaceTypes.has(type))) requirements.set(pluginId, record.plugin.manifest.version);
      for (const serializer of contribution.serializers) {
        const state = serializer.save();
        if (state !== undefined) {
          data[serializer.id] = state;
          requirements.set(pluginId, record.plugin.manifest.version);
        }
      }
    }
    if (!requirements.size && !Object.keys(data).length) return undefined;
    return { requirements: [...requirements].map(([id, version]) => ({ id, version })), data };
  }

  loadProjectData(state?: PluginProjectState) {
    if (!state) return;
    for (const contribution of this.activeContributions()) {
      for (const serializer of contribution.serializers) {
        if (Object.prototype.hasOwnProperty.call(state.data, serializer.id)) serializer.load(state.data[serializer.id]);
      }
    }
  }

  clearProjectData() {
    for (const contribution of this.activeContributions()) {
      for (const serializer of contribution.serializers) serializer.clear?.();
    }
  }

  extendToolbox(base: Blockly.utils.toolbox.ToolboxDefinition): Blockly.utils.toolbox.ToolboxDefinition {
    if (typeof base !== "object" || base === null || !("contents" in base) || !Array.isArray(base.contents)) return base;
    const categories = this.activeContributions().flatMap((entry) => entry.categories).map((category) => ({
      kind: "category",
      id: category.id,
      name: category.name,
      colour: category.colour,
      contents: category.contents,
    }));
    return { ...base, contents: [...base.contents, ...categories] } as Blockly.utils.toolbox.ToolboxDefinition;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private createContext(manifest: PluginManifest): PluginContext {
    const contribution = this.contributions.get(manifest.id)!;
    const ensureContributionId = (id: string) => {
      if (!id.startsWith(`${manifest.id}.`)) throw new Error(`贡献 ID 必须以 ${manifest.id}. 开头：${id}`);
    };
    return {
      pluginId: manifest.id,
      registerBlock: (definition: PluginBlockDefinition, generator: PythonBlockGenerator) => {
        const prefix = pluginPrefix(manifest.id);
        if (!definition.type.startsWith(prefix)) throw new Error(`积木类型必须以 ${prefix} 开头：${definition.type}`);
        if (Blockly.Blocks[definition.type] || contribution.blockTypes.has(definition.type)) throw new Error(`积木类型重复：${definition.type}`);
        Blockly.common.defineBlocksWithJsonArray([localizeBlockDefinition(definition)]);
        pythonGenerator.forBlock[definition.type] = manifest.builtin
          ? generator as (block: Blockly.Block, generator: typeof pythonGenerator) => any
          : ((block: Blockly.Block, activeGenerator: typeof pythonGenerator) => {
              const previousIndent = activeGenerator.INDENT;
              activeGenerator.INDENT = "    ";
              try { return generator(block, activeGenerator); }
              finally { activeGenerator.INDENT = previousIndent; }
            });
        contribution.blockTypes.add(definition.type);
      },
      registerToolboxCategory: (category) => {
        ensureContributionId(category.id);
        if (this.activeContributions().some((entry) => entry.categories.some((item) => item.id === category.id))) throw new Error(`工具箱分类重复：${category.id}`);
        contribution.categories.push(category);
      },
      registerSetting: (setting) => { ensureContributionId(setting.id); contribution.settings.push(setting); },
      registerProjectSerializer: (serializer) => { ensureContributionId(serializer.id); contribution.serializers.push(serializer); },
      registerCodeDocumentHandler: (handler) => { ensureContributionId(handler.id); contribution.documentHandlers.push(handler); },
      registerCommand: (command) => { ensureContributionId(command.id); contribution.commands.push(command); },
      registerAgentTool: (tool) => {
        const name = tool.definition.function.name;
        ensureContributionId(tool.id);
        if (this.getAgentTools().some((entry) => entry.tool.definition.function.name === name) || contribution.agentTools.some((entry) => entry.definition.function.name === name)) throw new Error(`Agent 工具重复：${name}`);
        contribution.agentTools.push(tool);
      },
      reportProblem: (message, detail) => { this.problems.push({ pluginId: manifest.id, message, detail }); this.emitChange(); },
    };
  }

  private activeContributions() {
    return [...this.records.entries()]
      .filter(([, record]) => record.state === "active" || record.state === "loading")
      .map(([id]) => this.contributions.get(id)!)
      .filter(Boolean);
  }

  private activeEntries(): Array<[string, PluginRecord, Contributions]> {
    return [...this.records.entries()]
      .filter(([, record]) => record.state === "active")
      .map(([id, record]) => [id, record, this.contributions.get(id)!]);
  }

  private hasContributions(contribution: Contributions) {
    return contribution.blockTypes.size > 0
      || contribution.categories.length > 0
      || contribution.settings.length > 0
      || contribution.serializers.length > 0
      || contribution.documentHandlers.length > 0
      || contribution.commands.length > 0
      || contribution.agentTools.length > 0;
  }

  private clearContributions(pluginId: string) {
    const contribution = this.contributions.get(pluginId);
    if (!contribution) return;
    for (const type of contribution.blockTypes) {
      delete Blockly.Blocks[type];
      delete pythonGenerator.forBlock[type];
    }
    this.contributions.set(pluginId, emptyContributions());
  }

  private validateManifest(manifest: PluginManifest) {
    if (!/^[a-z][a-z0-9.-]*$/.test(manifest.id)) throw new Error(`无效插件 ID：${manifest.id}`);
    if (!manifest.name.trim()) throw new Error("插件名称不能为空");
    if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(manifest.version)) throw new Error(`无效插件版本：${manifest.version}`);
    if (manifest.apiVersion !== PLUGIN_API_VERSION) throw new Error(`插件 API 不兼容：${manifest.apiVersion}`);
  }

  private requireRecord(pluginId: string) {
    const record = this.records.get(pluginId);
    if (!record) throw new Error(`插件不存在：${pluginId}`);
    return record;
  }

  private emitChange() {
    for (const listener of this.listeners) listener();
  }
}
