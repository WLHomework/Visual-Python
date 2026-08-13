import type { AgentHost } from "./types";
import { createVisualPythonExecutionObserver, createVisualPythonToolExecutor, type VisualPythonHostServices as VisualPythonToolServices } from "./visualPythonHost";

export type VisualPythonHostServices = VisualPythonToolServices & {
  getSnapshot: AgentHost["getSnapshot"];
  observeExecution?: AgentHost["observeExecution"];
};

export function createVisualPythonHostAdapter(services: VisualPythonHostServices): AgentHost {
  const executeTool = createVisualPythonToolExecutor(services);
  return {
    getSnapshot: services.getSnapshot,
    executeTool,
    observeExecution: services.observeExecution || createVisualPythonExecutionObserver(executeTool),
  };
}
