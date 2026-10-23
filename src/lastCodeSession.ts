import type { CodeDocument } from "./sceneDocuments";
import type { WorkbenchProfileId } from "./profiles/workbenchProfile";
import type { WorkspaceMode } from "./workspaceMode";

/**
 * 最近一次代码的轻量快照。草稿是主恢复路径；当草稿不存在/损坏时用它兜底，
 * 避免启动时又回到“你好，Python！”的初始示例。
 */
export type LastCodeSession = {
  code: string;
  profile: WorkbenchProfileId;
  workspaceMode: WorkspaceMode;
  codeDocuments: CodeDocument[];
  activeDocumentId: string;
  savedAt: number;
};

const LAST_CODE_STORAGE_KEY = "visual-python:last-code";

export function writeLastCodeSession(storage: Pick<Storage, "setItem">, session: Omit<LastCodeSession, "savedAt">): void {
  storage.setItem(LAST_CODE_STORAGE_KEY, JSON.stringify({ ...session, savedAt: Date.now() }));
}

export function readLastCodeSession(storage: Pick<Storage, "getItem">): LastCodeSession | null {
  const source = storage.getItem(LAST_CODE_STORAGE_KEY);
  if (!source) return null;
  try {
    const value = JSON.parse(source) as Partial<LastCodeSession>;
    if (typeof value.code !== "string" || !Array.isArray(value.codeDocuments)) return null;
    return {
      code: value.code,
      profile: typeof value.profile === "string" ? value.profile : "python",
      workspaceMode: value.workspaceMode === "visual" || value.workspaceMode === "split" || value.workspaceMode === "code" ? value.workspaceMode : "code",
      codeDocuments: value.codeDocuments as CodeDocument[],
      activeDocumentId: typeof value.activeDocumentId === "string" ? value.activeDocumentId : "",
      savedAt: typeof value.savedAt === "number" ? value.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * 按代码内容推断工程模式：含 MicroPython 硬件 API 就落到硬件工作台，
 * 否则回到 Python。板卡按代码里的特征选择，再退回上次使用的硬件板卡。
 */
export function inferProfileFromCode(code: string, stored?: WorkbenchProfileId): WorkbenchProfileId {
  const looksHardware = /(^|\n)\s*(?:import|from)\s+(?:machine|network|neopixel|bluetooth|esp|esp32)\b|\bmachine\.|\btime\.sleep_ms\b/.test(code);
  if (!looksHardware) return "python";
  if (/neopixel|Pin\(\s*48\b|GPIO\s*48|ESP32[-_ ]?S3/i.test(code)) return "esp32-s3";
  if (/esp8266|ESP-12|NodeMCU/i.test(code)) return "esp8266-esp12e";
  if (stored && stored !== "python") return stored;
  return "esp32-wroom";
}
