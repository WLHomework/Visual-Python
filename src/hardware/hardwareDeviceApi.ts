import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * 阶段 6/7：设备命令与事件的类型化封装。
 *
 * 前端不做任何串口协议处理：这里只把 UI 动作翻译成命令、把后端事件还原成界面状态。
 * 事件名与 `src-tauri/src/hardware/commands.rs` 里的常量一一对应，改动必须同时改两边。
 */

export type HardwareDeviceSnapshot = {
  portName: string;
  boardId: string;
  implementation: string;
  version: string;
  release: string;
  machine: string;
  /** 设备端是否有程序正在运行（上传/运行/重置期间为 true）。 */
  running: boolean;
};

export type HardwareDeviceFile = {
  name: string;
  size: number;
  isDirectory: boolean;
};

export type HardwareUploadReport = {
  path: string;
  size: number;
  sha256: string;
  verifiedSize: boolean;
  verifiedHash: boolean;
};

export type HardwareReadFileResult = {
  path: string;
  size: number;
  sha256: string;
  base64: string;
};

export type HardwareRunStatus = "finished" | "exception" | "interrupted" | "stillRunning";

export type HardwareRunAccepted = {
  runId: number;
};

export type HardwareOutputPayload = {
  runId: number;
  stream: string;
  text: string;
};

export type HardwareOperationProgress = {
  operation: string;
  written: number;
  total: number;
};

export type HardwareRunFinishedPayload = {
  runId: number;
  status: HardwareRunStatus;
  streamedBytes: number;
  tail: string;
};

export type HardwareDeviceErrorPayload = {
  operation: string;
  code: string;
  message: string;
};

export const hardwareDeviceEventNames = {
  stateChanged: "hardware:state-changed",
  output: "hardware:output",
  progress: "hardware:operation-progress",
  runFinished: "hardware:run-finished",
  error: "hardware:error",
} as const;

/** 后端返回的是 `{ code, message }` 而不是 `Error`，直接 `String(error)` 会变成 `[object Object]`。 */
export function hardwareErrorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

export function hardwareErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
    const code = hardwareErrorCode(error);
    if (code) return code;
  }
  return String(error);
}

/** 设备断开类错误：界面据此把连接状态改为「未连接」并提示重新插拔。 */
export function isHardwareDisconnectedError(error: unknown): boolean {
  return hardwareErrorCode(error) === "disconnected";
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x2000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function decodeBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * 把设备文件的 base64 内容解成文本，用于抽屉里的只读预览。
 * `TextDecoder` 会把非法 UTF-8 字节替换成 U+FFFD，不会抛错，所以二进制文件也能安全预览。
 */
export function decodeDeviceText(base64: string): string {
  return new TextDecoder().decode(decodeBase64(base64));
}

export function connectHardwareDevice(portName: string, boardId: string): Promise<HardwareDeviceSnapshot> {
  return invoke<HardwareDeviceSnapshot>("hardware_connect", { portName, boardId });
}

export function disconnectHardwareDevice(): Promise<boolean> {
  return invoke<boolean>("hardware_disconnect");
}

export function getHardwareDeviceState(): Promise<HardwareDeviceSnapshot | null> {
  return invoke<HardwareDeviceSnapshot | null>("hardware_device_state");
}

export function listHardwareDeviceFiles(path: string): Promise<HardwareDeviceFile[]> {
  return invoke<HardwareDeviceFile[]>("hardware_list_files", { path });
}

export function readHardwareDeviceFile(path: string): Promise<HardwareReadFileResult> {
  return invoke<HardwareReadFileResult>("hardware_read_file", { path });
}

export function deleteHardwareDeviceFile(path: string): Promise<void> {
  return invoke<void>("hardware_delete_file", { path });
}

export function uploadHardwareDeviceFile(
  path: string,
  bytes: Uint8Array,
  options: { chunkSize?: number; verifyHash?: boolean } = {},
): Promise<HardwareUploadReport> {
  return invoke<HardwareUploadReport>("hardware_upload", {
    path,
    dataBase64: encodeBase64(bytes),
    chunkSize: options.chunkSize ?? null,
    verifyHash: options.verifyHash ?? null,
  });
}

export type HardwareRunRequest = {
  entryPath: string;
  code: string;
  boardId: string;
  chunkSize?: number;
  verifyHash?: boolean;
};

/** 统一「运行」：上传入口程序 → 校验 → 软复位执行。立刻返回，输出通过事件回传。 */
export function runHardwareDeviceProgram(request: HardwareRunRequest): Promise<HardwareRunAccepted> {
  return invoke<HardwareRunAccepted>("hardware_run", {
    entryPath: request.entryPath,
    code: request.code,
    boardId: request.boardId,
    chunkSize: request.chunkSize ?? null,
    verifyHash: request.verifyHash ?? null,
  });
}

/** 「重置」：软复位重跑设备上已有的入口程序，不重新上传。 */
export function resetHardwareDeviceProgram(): Promise<HardwareRunAccepted> {
  return invoke<HardwareRunAccepted>("hardware_reset");
}

/** 「停止」：中断当前程序，不软复位。返回当时是否有程序在跑。 */
export function stopHardwareDeviceProgram(): Promise<boolean> {
  return invoke<boolean>("hardware_stop");
}

export type HardwareDeviceEventHandlers = {
  onStateChanged?: (snapshot: HardwareDeviceSnapshot | null) => void;
  onOutput?: (payload: HardwareOutputPayload) => void;
  onProgress?: (payload: HardwareOperationProgress) => void;
  onRunFinished?: (payload: HardwareRunFinishedPayload) => void;
  onError?: (payload: HardwareDeviceErrorPayload) => void;
};

export async function listenHardwareDeviceEvents(
  handlers: HardwareDeviceEventHandlers,
): Promise<UnlistenFn[]> {
  const unlisteners: UnlistenFn[] = [];
  if (handlers.onStateChanged) {
    unlisteners.push(
      await listen<{ device: HardwareDeviceSnapshot | null }>(hardwareDeviceEventNames.stateChanged, (event) => {
        handlers.onStateChanged?.(event.payload?.device ?? null);
      }),
    );
  }
  if (handlers.onOutput) {
    unlisteners.push(
      await listen<HardwareOutputPayload>(hardwareDeviceEventNames.output, (event) => {
        handlers.onOutput?.(event.payload);
      }),
    );
  }
  if (handlers.onProgress) {
    unlisteners.push(
      await listen<HardwareOperationProgress>(hardwareDeviceEventNames.progress, (event) => {
        handlers.onProgress?.(event.payload);
      }),
    );
  }
  if (handlers.onRunFinished) {
    unlisteners.push(
      await listen<HardwareRunFinishedPayload>(hardwareDeviceEventNames.runFinished, (event) => {
        handlers.onRunFinished?.(event.payload);
      }),
    );
  }
  if (handlers.onError) {
    unlisteners.push(
      await listen<HardwareDeviceErrorPayload>(hardwareDeviceEventNames.error, (event) => {
        handlers.onError?.(event.payload);
      }),
    );
  }
  return unlisteners;
}

export function unlistenHardwareDeviceEvents(unlisteners: UnlistenFn[]): void {
  for (const unlisten of unlisteners) {
    // 退订失败不应该影响其它监听，也不该让调用方的清理流程中断。
    try {
      unlisten();
    } catch {
      /* 忽略：窗口关闭时的常见情况。 */
    }
  }
}
