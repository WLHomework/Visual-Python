import { extractManimSceneNames } from "./plugins/builtin/manim/sceneNames";
import { inspectVoiceovers } from "./aiVoiceover";
import type { ProjectResource } from "./projectResources";

export type SceneValidationIssue = { code: string; message: string; severity: "error" | "warning" };

export function validateStandaloneSceneSource(source: string, documentName: string, resources: ProjectResource[], roleIds: string[]) {
  const issues: SceneValidationIssue[] = [];
  const sceneNames = extractManimSceneNames(source);
  if (!sceneNames.length) return { valid: true, kind: "python" as const, sceneNames, issues };
  if (!/(?:^|\n)\s*(?:from\s+manim\s+import|import\s+manim\b)/.test(source)) issues.push({ code: "missing-manim-import", severity: "error", message: "缺少 Manim import，文件不能独立运行" });
  if (sceneNames.length > 1) issues.push({ code: "multiple-scenes", severity: "error", message: `独立场景文件包含 ${sceneNames.length} 个 Scene 类，渲染目标不明确` });
  if (sceneNames[0] !== documentName) issues.push({ code: "name-mismatch", severity: "error", message: `标签名称 ${documentName} 与场景类 ${sceneNames[0]} 不一致` });
  const voiceover = inspectVoiceovers(source, roleIds);
  issues.push(...voiceover.issues.map((message) => ({ code: "voiceover", severity: "error" as const, message })));
  const resourceIds = new Set(resources.map((resource) => resource.id));
  for (const match of source.matchAll(/resource:\/\/([A-Za-z0-9_-]+)/g)) {
    if (!resourceIds.has(match[1])) issues.push({ code: "missing-resource", severity: "error", message: `引用了不存在的工程资源 ${match[1]}` });
  }
  return { valid: !issues.some((issue) => issue.severity === "error"), kind: "manim" as const, sceneNames, issues };
}
