import type {
  HardwareDeviceSnapshot,
  HardwareRunFinishedPayload,
  HardwareRunStatus,
} from "./hardwareDeviceApi";

/**
 * 设备面板的纯逻辑：日志行、路径、状态文案。放在这里而不是组件里，
 * 是为了让它们在没有 DOM 的环境下也能被测试（仓库里没有 jsdom 测试环境）。
 */

export type DeviceLogStream = "stdout" | "stderr" | "system";

export type DeviceLogLine = {
  id: number;
  stream: DeviceLogStream;
  text: string;
};

/** 一次运行/上传的进行阶段。`idle` 表示设备空闲。 */
export type DeviceRunPhase = "idle" | "connecting" | "uploading" | "running" | "stopping" | "resetting";

/** 面板日志的上限：硬件程序可能一直打印，必须截断，否则内存会涨。 */
export const deviceLogLineLimit = 800;

/** 单行输出的长度上限，防止一行几兆的输出把界面拖垮。 */
export const deviceLogLineCharLimit = 4000;

/** 设备端入口程序固定这个名字：断电重上电后 MicroPython 会自动执行它。 */
export const deviceEntryFileName = "main.py";
export const deviceDefaultPath = "/";

export function appendDeviceLog(
  lines: DeviceLogLine[],
  stream: DeviceLogStream,
  text: string,
  nextId: number,
  limit = deviceLogLineLimit,
): DeviceLogLine[] {
  if (!text) return lines;
  const pieces = text.replace(/\r\n/g, "\n").split("\n");
  if (pieces[pieces.length - 1] === "") pieces.pop();
  const added = pieces.map((piece, index) => ({
    id: nextId + index,
    stream,
    text: piece.replace(/\r/g, "").slice(0, deviceLogLineCharLimit),
  }));
  const merged = lines.concat(added);
  return merged.length > limit ? merged.slice(merged.length - limit) : merged;
}

/** 设备文件列表里进入子目录 / 回到上级目录用的路径运算。 */
export function devicePathJoin(directory: string, name: string): string {
  const base = directory === "/" ? "" : directory.replace(/\/+$/, "");
  return `${base}/${name}`;
}

export function deviceParentPath(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") return "/";
  const index = trimmed.lastIndexOf("/");
  return index <= 0 ? "/" : trimmed.slice(0, index);
}

/** 从 `hardware_run#12` 这类操作名里取出运行编号；取不到返回 null。 */
export function runIdFromOperation(operation: string): number | null {
  const match = /#(\d+)\s*$/.exec(operation);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function formatDeviceBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function deviceProgressPercent(progress: { written: number; total: number } | null): number | undefined {
  if (!progress || progress.total <= 0) return undefined;
  const percent = Math.round((progress.written / progress.total) * 100);
  return Math.max(0, Math.min(100, percent));
}

export function describeHardwareDevice(snapshot: HardwareDeviceSnapshot | null): { title: string; detail: string } {
  if (!snapshot) return { title: "未连接设备", detail: "连接开发板后即可上传并运行程序。" };
  const version = snapshot.release || snapshot.version.split(";")[0]?.trim() || "未知固件";
  return {
    title: `${snapshot.portName} · MicroPython ${version}`,
    detail: [snapshot.machine, snapshot.implementation].filter(Boolean).join(" · ") || "已连接",
  };
}

export function deviceRunPhaseLabel(phase: DeviceRunPhase): string | null {
  switch (phase) {
    case "connecting":
      return "正在连接设备...";
    case "uploading":
      return "正在上传程序...";
    case "running":
      return "程序正在设备上运行";
    case "stopping":
      return "正在停止程序...";
    case "resetting":
      return "正在重置设备...";
    default:
      return null;
  }
}

/** 运行结束后的提示文案。`stillRunning` 只会在有界观察窗口下出现，真机上是死循环。 */
export function describeRunFinished(payload: HardwareRunFinishedPayload): {
  tone: "success" | "warning" | "error";
  message: string;
} {
  const status: HardwareRunStatus = payload.status;
  if (status === "exception") {
    return { tone: "error", message: "程序在设备上出错（请查看上面的回溯）。" };
  }
  if (status === "interrupted") {
    return { tone: "warning", message: "已停止程序：设备已中断运行，但没有重启。" };
  }
  if (status === "stillRunning") {
    return { tone: "warning", message: "程序仍在设备上运行（输出窗口已到期，程序没有结束）。" };
  }
  return { tone: "success", message: "程序已运行结束。" };
}
