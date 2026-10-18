import { getBoardProfile } from "../hardware/boardProfiles";
import { supportedHardwareBoards, type HardwareBoardId } from "../hardware/firmwareCatalog";

/** 工作台 Profile：纯 Python 与每一块硬件板卡各自是一套互相独立的界面。 */
export type WorkbenchProfileId = "python" | HardwareBoardId;

export type WorkbenchKind = "python" | "micropython";

/** 界面能力开关：App 只读这些开关，不再判断“是不是设备”。 */
export type WorkbenchFeatures = {
  /** Manim 渲染、场景菜单与配置页。 */
  manim: boolean;
  /** 本机 Python 解释器选择。 */
  pythonEnvironment: boolean;
  /** 底部「预览」面板（Manim 渲染结果）。 */
  renderPreview: boolean;
  /** 底部「设备」面板（开发板文件）与固件刷写。 */
  devicePanel: boolean;
  /** 向运行中的程序发送标准输入。 */
  stdin: boolean;
};

export type WorkbenchProfile = {
  id: WorkbenchProfileId;
  kind: WorkbenchKind;
  label: string;
  boardId?: HardwareBoardId;
  features: WorkbenchFeatures;
};

export const defaultWorkbenchProfileId: WorkbenchProfileId = "python";
export const workbenchProfileStorageKey = "visual-python:workbench-profile";

const pythonProfile: WorkbenchProfile = {
  id: "python",
  kind: "python",
  label: "Python",
  features: { manim: true, pythonEnvironment: true, renderPreview: true, devicePanel: false, stdin: true },
};

const hardwareProfile = (boardId: HardwareBoardId): WorkbenchProfile => ({
  id: boardId,
  kind: "micropython",
  label: getBoardProfile(boardId)?.displayName ?? boardId,
  boardId,
  features: { manim: false, pythonEnvironment: false, renderPreview: false, devicePanel: true, stdin: false },
});

const profiles: readonly WorkbenchProfile[] = [pythonProfile, ...supportedHardwareBoards.map(hardwareProfile)];

export function listWorkbenchProfiles(): readonly WorkbenchProfile[] {
  return profiles;
}

export function isWorkbenchProfileId(value: unknown): value is WorkbenchProfileId {
  return typeof value === "string" && profiles.some((profile) => profile.id === value);
}

export function getWorkbenchProfile(id: WorkbenchProfileId): WorkbenchProfile {
  return profiles.find((profile) => profile.id === id) ?? pythonProfile;
}

export function normalizeWorkbenchProfileId(value: unknown, fallback: WorkbenchProfileId = defaultWorkbenchProfileId): WorkbenchProfileId {
  return isWorkbenchProfileId(value) ? value : fallback;
}

export function isHardwareWorkbench(profile: WorkbenchProfile): profile is WorkbenchProfile & { boardId: HardwareBoardId } {
  return profile.kind === "micropython" && profile.boardId !== undefined;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function readStoredWorkbenchProfileId(storage: StorageLike): WorkbenchProfileId {
  try {
    return normalizeWorkbenchProfileId(storage.getItem(workbenchProfileStorageKey));
  } catch {
    return defaultWorkbenchProfileId;
  }
}

export function storeWorkbenchProfileId(storage: StorageLike, id: WorkbenchProfileId): void {
  try {
    storage.setItem(workbenchProfileStorageKey, id);
  } catch {
    // 存储不可用时只是下次启动不记住界面，不影响当前使用。
  }
}
