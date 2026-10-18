import * as Blockly from "blockly/core";
import { toolbox as baseToolbox } from "../pythonBlocks";
import type { ProjectHardwareTarget } from "../projectFile";
import { getBoardProfile, isHardwareBoardId } from "./boardProfiles";
import { supportedHardwareBoards, type HardwareBoardId } from "./firmwareCatalog";
import { hardwareToolboxCategory, hardwareToolboxCategoryName, setActiveHardwareBoard } from "./hardwareBlocks";

export const hardwareTargetStorageKey = "visual-python:hardware-target";
export const defaultHardwareBoardId: HardwareBoardId = "esp32-wroom";
export const hardwareTargetLabels = { host: "本机 Python", device: "硬件设备" } as const;

/** 当前工程的运行目标：本机 Python 或已连接（或准备连接）的硬件设备。 */
export type HardwareRunTarget = { target: "host" | "device"; boardId?: HardwareBoardId };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const baseCategoryNames = new Set(
  ((baseToolbox as unknown as { contents?: Array<{ kind?: string; name?: string }> }).contents ?? [])
    .filter((item) => item.kind === "category" && typeof item.name === "string")
    .map((item) => item.name as string),
);

export function normalizeHardwareRunTarget(value: unknown, fallback: HardwareRunTarget = { target: "host" }): HardwareRunTarget {
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as { target?: unknown; boardId?: unknown };
  if (candidate.target === "device") {
    return { target: "device", boardId: isHardwareBoardId(candidate.boardId) ? candidate.boardId : defaultHardwareBoardId };
  }
  if (candidate.target === "host") return { target: "host" };
  return fallback;
}

export function hardwareTargetFromProject(project: ProjectHardwareTarget | undefined): HardwareRunTarget {
  return project?.target === "device" && isHardwareBoardId(project.boardId)
    ? { target: "device", boardId: project.boardId }
    : { target: "host" };
}

export function hardwareTargetToProject(state: HardwareRunTarget): ProjectHardwareTarget {
  return state.target === "device" && state.boardId ? { target: "device", boardId: state.boardId } : { target: "host" };
}

export function readStoredHardwareRunTarget(storage: StorageLike): HardwareRunTarget {
  try {
    const raw = storage.getItem(hardwareTargetStorageKey);
    return raw ? normalizeHardwareRunTarget(JSON.parse(raw)) : { target: "host" };
  } catch {
    return { target: "host" };
  }
}

export function storeHardwareRunTarget(storage: StorageLike, state: HardwareRunTarget): void {
  storage.setItem(hardwareTargetStorageKey, JSON.stringify(hardwareTargetToProject(state)));
}

/** 应用运行目标：设备目标会激活板卡档案，主机目标清空板卡（但保留积木数据）。 */
export function applyHardwareRunTarget(state: HardwareRunTarget): void {
  setActiveHardwareBoard(state.target === "device" ? state.boardId : undefined);
}

export function hardwareBoardId(state: HardwareRunTarget): HardwareBoardId | undefined {
  return state.target === "device" ? state.boardId : undefined;
}

export function hardwareBoardOptions(): Array<{ id: HardwareBoardId; label: string }> {
  return supportedHardwareBoards.map((id) => ({ id, label: getBoardProfile(id)?.displayName ?? id }));
}

/** 当前设备目标使用的板卡显示名，主机目标返回 undefined。 */
export function hardwareBoardLabel(state: HardwareRunTarget): string | undefined {
  return state.target === "device" ? getBoardProfile(state.boardId)?.displayName ?? state.boardId : undefined;
}

/**
 * 按运行目标组装工具箱。
 *
 * 设备目标下只保留内置 Python 分类并加入「硬件」分类，插件带来的宿主专属分类
 * （Manim、绘图、数值库等）会被隐藏；主机目标下保持工具箱原样。
 */
export function buildTargetToolbox(toolbox: Blockly.utils.toolbox.ToolboxDefinition, state: HardwareRunTarget): Blockly.utils.toolbox.ToolboxDefinition {
  if (state.target !== "device") return toolbox;
  const definition = toolbox as unknown as { kind?: string; contents?: Array<{ kind?: string; name?: string }> };
  if (!Array.isArray(definition.contents)) return toolbox;
  const kept = definition.contents.filter((item) => {
    if (item.kind !== "category") return true;
    if (item.name === hardwareToolboxCategoryName) return false;
    return typeof item.name === "string" && baseCategoryNames.has(item.name);
  });
  return {
    ...definition,
    contents: [hardwareToolboxCategory(state.boardId), ...kept],
  } as unknown as Blockly.utils.toolbox.ToolboxDefinition;
}
