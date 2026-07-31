const windowsReservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const pad = (value: number) => String(value).padStart(2, "0");

export type ManimOutputType = "video" | "image";

export const sanitizeManimOutputBaseName = (value: string, fallback = "video") => {
  const withoutExtension = value.trim().replace(/\.(?:mp4|png)$/i, "");
  const sanitized = withoutExtension
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120);
  const safe = sanitized || fallback;
  return windowsReservedNames.test(safe) ? `_${safe}` : safe;
};

export const buildManimOutputFilename = (
  projectName: string,
  sceneName: string,
  customName: string,
  date = new Date(),
  outputType: ManimOutputType = "video",
) => {
  const extension = outputType === "image" ? "png" : "mp4";
  if (customName.trim()) return `${sanitizeManimOutputBaseName(customName)}.${extension}`;
  const project = sanitizeManimOutputBaseName(projectName.replace(/\.vpy$/i, ""), "project");
  const scene = sanitizeManimOutputBaseName(sceneName, "Scene");
  const timestamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${project}-${scene}-${timestamp}.${extension}`;
};
