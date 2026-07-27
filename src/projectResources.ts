export type ProjectResourceType = "audio" | "image" | "font" | "other";

export type ProjectResource = {
  id: string;
  type: ProjectResourceType;
  path: string;
  originalName: string;
  size: number;
};

export const projectResourceReference = (id: string) => `resource://${id}`;

export function resolveProjectResourceReference(
  reference: string,
  resources: ProjectResource[],
  projectPath: string | null,
): string | null {
  if (!reference.startsWith("resource://")) return reference;
  if (!projectPath) return null;
  const resource = resources.find((item) => item.id === reference.slice("resource://".length));
  if (!resource) return null;
  const assetsPath = projectPath.replace(/\.vpy$/i, "") + ".assets";
  const separator = projectPath.includes("\\") ? "\\" : "/";
  return `${assetsPath}${separator}${resource.path.replace(/[\\/]/g, separator)}`;
}
