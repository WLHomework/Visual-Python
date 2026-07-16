export type WorkspaceMode = "visual" | "split" | "code";

export const isBlockWorkspaceMode = (mode: WorkspaceMode) => mode !== "code";

export function normalizeWorkspaceMode(value: unknown, fallback: WorkspaceMode = "split"): WorkspaceMode {
  return value === "visual" || value === "split" || value === "code" ? value : fallback;
}
