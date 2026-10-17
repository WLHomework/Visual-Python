import type { AgentHost } from "./types";
import { createVisualPythonToolExecutor, previewStreamingEditorCode, type VisualPythonHostServices as VisualPythonToolServices } from "./visualPythonHost";

export type VisualPythonHostServices = VisualPythonToolServices & {
  getSnapshot: AgentHost["getSnapshot"];
  getBlockCatalog?: AgentHost["getBlockCatalog"];
  getCapabilities?: AgentHost["getCapabilities"];
  getTools?: AgentHost["getTools"];
  blocklyTools?: AgentHost["executeTool"];
  blocklyToolNames?: string[];
  executePluginTool?: (name: string, args: Record<string, unknown>, signal: AbortSignal, executeCapability: (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<Record<string, unknown>>) => Promise<Record<string, unknown>>;
  observeExecution?: AgentHost["observeExecution"];
};

export function createVisualPythonHostAdapter(services: VisualPythonHostServices): AgentHost {
  const executeCoreTool = createVisualPythonToolExecutor(services);
  const blocklyToolNames = new Set(services.blocklyToolNames || []);
  const executeTool: AgentHost["executeTool"] = async (name, args, signal) => {
    if (blocklyToolNames.has(name) && services.blocklyTools) return services.blocklyTools(name, args, signal);
    const isPluginTool = services.getTools?.().some((tool) => tool.definition.function.name === name && !blocklyToolNames.has(name));
    if (isPluginTool) {
      if (!services.executePluginTool) throw new Error(`插件工具没有执行适配器：${name}`);
      return services.executePluginTool(name, args, signal, executeCoreTool);
    }
    return executeCoreTool(name, args, signal);
  };
  const adapter: AgentHost = {
    getSnapshot: services.getSnapshot,
    executeTool,
    observeExecution: services.observeExecution || (async (toolName, signal) => {
      const tool = services.getTools?.().find((item) => item.definition.function.name === toolName);
      const stateField = tool?.execution?.stateField || "running";
      let state = await executeTool("get_execution_state", {}, signal);
      while (state[stateField] === true) {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(resolve, 500);
          signal.addEventListener("abort", () => { window.clearTimeout(timer); reject(new Error("已停止生成")); }, { once: true });
        });
        state = await executeTool("get_execution_state", {}, signal);
      }
      if (tool?.execution?.verificationTool && !(Array.isArray(state.problems) && state.problems.length)) {
        const inspection = await executeTool(tool.execution.verificationTool, {}, signal);
        return { ...state, inspection };
      }
      return state;
    }),
  };
  if (services.sourceCodeRef) adapter.previewStreamingCode = (code) => previewStreamingEditorCode(services, code);
  if (services.getBlockCatalog) adapter.getBlockCatalog = services.getBlockCatalog;
  if (services.getCapabilities) adapter.getCapabilities = services.getCapabilities;
  if (services.getTools) adapter.getTools = services.getTools;
  return adapter;
}
