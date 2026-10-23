import { useCallback, useEffect, useRef, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { listHardwareSerialPorts, sendHardwareSerial, type HardwareSerialPort } from "./hardwareApi";
import type { HardwareBoardId } from "./firmwareCatalog";
import {
  connectHardwareDevice,
  deleteHardwareDeviceFile,
  disconnectHardwareDevice,
  getHardwareDeviceState,
  hardwareErrorMessage,
  isHardwareDisconnectedError,
  listHardwareDeviceFiles,
  listenHardwareDeviceEvents,
  readHardwareDeviceFile,
  resetHardwareDeviceProgram,
  runHardwareDeviceProgram,
  stopHardwareDeviceProgram,
  unlistenHardwareDeviceEvents,
  uploadHardwareDeviceFile,
  type HardwareDeviceFile,
  type HardwareDeviceSnapshot,
  type HardwareReadFileResult,
  type HardwareRunAccepted,
  type HardwareRunFinishedPayload,
  type HardwareUploadReport,
} from "./hardwareDeviceApi";
import {
  appendDeviceLog,
  describeRunFinished,
  deviceDefaultPath,
  deviceEntryFileName,
  deviceParentPath,
  runIdFromOperation,
  type DeviceLogLine,
  type DeviceLogStream,
  type DeviceRunPhase,
} from "./hardwareDeviceLog";

/**
 * 设备会话的前端控制器：连接、文件、运行、日志。
 *
 * 这里**没有**任何串口协议：所有字节都来自后端事件，前端只负责显示与把动作翻译成命令。
 * 设备一旦断开（拔线或后端报告 `disconnected`），相关状态立刻回到「未连接」，
 * 界面上的运行/停止/文件操作随之失效。
 */

export type HardwareDeviceOptions = {
  /** 当前 MicroPython 工作台选定的板卡；连接时用它做握手校验。 */
  boardId: HardwareBoardId | undefined;
  /** 设备输出（stdout）和用户发送的内容转发给控制台，让用户不必盯着面板也能看到。 */
  onOutput?: (stream: DeviceLogStream | "input", text: string) => void;
  onNotice?: (message: string) => void;
  onRunFinished?: (payload: HardwareRunFinishedPayload) => void;
};

export type HardwareDeviceController = {
  ports: HardwareSerialPort[];
  portName: string;
  snapshot: HardwareDeviceSnapshot | null;
  connected: boolean;
  /** 设备上有程序在跑（上传、运行、重置期间都为 true）。 */
  running: boolean;
  /** 有设备操作正在进行：界面据此禁用按钮、显示进度。 */
  busy: boolean;
  phase: DeviceRunPhase;
  progress: { written: number; total: number } | null;
  log: DeviceLogLine[];
  files: HardwareDeviceFile[];
  filesPath: string;
  error: string | null;
  selectPort: (portName: string) => void;
  refreshPorts: () => Promise<void>;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  openDirectory: (path: string) => Promise<void>;
  goToParentDirectory: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  readFile: (path: string) => Promise<HardwareReadFileResult | null>;
  deleteFile: (path: string) => Promise<boolean>;
  uploadFile: (path: string, bytes: Uint8Array) => Promise<HardwareUploadReport | null>;
  run: (code: string, entryPath?: string) => Promise<HardwareRunAccepted | null>;
  /** 运行并在有界窗口内等待结果（AI 工具用：短程序直接拿到输出，死循环不会卡住）。 */
  runAndWait: (code: string, timeoutMs?: number) => Promise<{ accepted: HardwareRunAccepted | null; outcome: HardwareRunFinishedPayload | null }>;
  stop: () => Promise<void>;
  reset: () => Promise<void>;
  /** 发送到设备：空闲执行 REPL，运行中写入程序 stdin。 */
  sendSerial: (text: string, lineEnding?: "crlf" | "lf" | "none") => Promise<string | null>;
  clearLog: () => void;
  clearError: () => void;
};

/** 运行结束事件最多缓存几条，供“先结束再等待”的极短程序使用。 */
const finishedRunCacheLimit = 16;

export function useHardwareDevice(options: HardwareDeviceOptions): HardwareDeviceController {
  const { boardId } = options;
  const [ports, setPorts] = useState<HardwareSerialPort[]>([]);
  const [portName, setPortName] = useState("");
  const [snapshot, setSnapshot] = useState<HardwareDeviceSnapshot | null>(null);
  const [phase, setPhase] = useState<DeviceRunPhase>("idle");
  const [progress, setProgress] = useState<{ written: number; total: number } | null>(null);
  const [log, setLog] = useState<DeviceLogLine[]>([]);
  const [files, setFiles] = useState<HardwareDeviceFile[]>([]);
  const [filesPath, setFilesPath] = useState(deviceDefaultPath);
  const [error, setError] = useState<string | null>(null);

  const logId = useRef(1);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const waiters = useRef(new Map<number, (payload: HardwareRunFinishedPayload) => void>());
  const finishedRuns = useRef(new Map<number, HardwareRunFinishedPayload>());
  const disposed = useRef(false);
  // 轮询串口时读最新状态：连接中/运行中不重新枚举，避免和会话抢串口或打断下拉框。
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const pushLog = useCallback((stream: DeviceLogStream, text: string) => {
    if (disposed.current || !text) return;
    setLog((lines) => {
      const next = appendDeviceLog(lines, stream, text, logId.current);
      logId.current += Math.max(1, next.length - lines.length);
      return next;
    });
    // 设备打印（stdout）已经由事件回调转发到「输出」页签；系统消息和错误也必须送过去，
    // 否则用户只看得到设备的 print，看不到“开始运行/上传完成/运行结束/失败原因”，界面像是没反应。
    if (stream !== "stdout") optionsRef.current.onOutput?.(stream, text);
  }, []);

  const resolveWaiter = useCallback((payload: HardwareRunFinishedPayload) => {
    const waiter = waiters.current.get(payload.runId);
    if (waiter) {
      waiters.current.delete(payload.runId);
      waiter(payload);
      return;
    }
    // 极短的程序可能在“等待者登记”之前就结束了：先存起来，等 `runAndWait` 来取。
    finishedRuns.current.set(payload.runId, payload);
    if (finishedRuns.current.size > finishedRunCacheLimit) {
      const oldest = finishedRuns.current.keys().next();
      if (!oldest.done) finishedRuns.current.delete(oldest.value);
    }
  }, []);

  const loadFiles = useCallback(
    async (path: string) => {
      try {
        const next = await listHardwareDeviceFiles(path);
        setFiles(next);
        setFilesPath(path);
        setError(null);
      } catch (caught) {
        const message = hardwareErrorMessage(caught);
        setError(message);
        pushLog("stderr", `${message}\n`);
        if (isHardwareDisconnectedError(caught)) setSnapshot(null);
      }
    },
    [pushLog],
  );

  // 事件订阅只建立一次；回调用 ref 读最新的配置，避免反复退订。
  //
  // `cancelled` 必须是每次 effect 自己的局部变量：开发版的严格模式会「挂载 → 清理 → 再挂载」，
  // 而 `listen` 是异步的。用共享 ref 记“已卸载”时，第二次挂载会把标记改回来，
  // 第一次的订阅于是活了下来——每个设备事件被处理两遍，输出面板里运行结束/错误消息成对重复。
  useEffect(() => {
    let cancelled = false;
    let unlisteners: UnlistenFn[] = [];
    void listenHardwareDeviceEvents({
      onStateChanged: (next) => setSnapshot(next),
      onOutput: (payload) => {
        pushLog("stdout", payload.text);
        optionsRef.current.onOutput?.("stdout", payload.text);
      },
      onProgress: (payload) => {
        setProgress({ written: payload.written, total: payload.total });
        if (payload.operation.startsWith("hardware_upload")) {
          // 写完最后一个分块就进入执行阶段：界面从“上传中”切到“运行中”。
          setPhase(payload.total > 0 && payload.written >= payload.total ? "running" : "uploading");
        }
      },
      onRunFinished: (payload) => {
        const described = describeRunFinished(payload);
        pushLog("system", `${described.message}\n`);
        setProgress(null);
        setPhase("idle");
        resolveWaiter(payload);
        optionsRef.current.onRunFinished?.(payload);
      },
      onError: (payload) => {
        setError(payload.message);
        setProgress(null);
        setPhase("idle");
        pushLog("stderr", `${payload.message}\n`);
        const runId = runIdFromOperation(payload.operation);
        if (runId !== null) {
          // 运行作业失败时后端不会发 run_finished：这里补齐，等待者才不会白等。
          resolveWaiter({ runId, status: "exception", streamedBytes: 0, tail: payload.message });
        }
      },
    }).then((listeners) => {
      if (cancelled) {
        unlistenHardwareDeviceEvents(listeners);
        return;
      }
      unlisteners = listeners;
    }).catch(() => {
      /* 非 Tauri 环境（纯浏览器预览）里没有事件系统：忽略即可。 */
    });
    return () => {
      cancelled = true;
      unlistenHardwareDeviceEvents(unlisteners);
    };
  }, [pushLog, resolveWaiter]);

  // 组件卸载后不再往日志里追加（事件回调可能比卸载晚一步到达）。
  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
    };
  }, []);

  // 重新打开面板（或刷新页面）时恢复已有连接：后端状态在进程里，不随界面丢失。
  useEffect(() => {
    void (async () => {
      try {
        const current = await getHardwareDeviceState();
        if (!disposed.current && current) {
          setSnapshot(current);
          setPortName(current.portName);
        }
      } catch {
        /* 非 Tauri 环境或命令不可用：保持未连接即可。 */
      }
    })();
  }, []);

  const loadPorts = useCallback(async (quiet: boolean) => {
    try {
      const next = await listHardwareSerialPorts();
      // 列表没变化时保留原数组，避免每 2 秒触发一次无意义的重渲染、把打开的下拉框关掉。
      setPorts((current) => (
        current.length === next.length
        && current.every((port, index) => port.portName === next[index].portName && port.label === next[index].label)
          ? current
          : next
      ));
      setPortName((current) => {
        if (current && next.some((port) => port.portName === current)) return current;
        // 没有用户选择时优先 USB 串口：COM1 往往是主板自带串口，不是开发板。
        const preferred = next.find((port) => port.portType === "usb") ?? next[0];
        return preferred?.portName ?? "";
      });
    } catch (caught) {
      // 后台轮询失败不打扰用户；手动刷新/首次枚举才把错误显示出来。
      if (!quiet) setError(hardwareErrorMessage(caught));
    }
  }, []);

  const refreshPorts = useCallback(() => loadPorts(false), [loadPorts]);

  /**
   * 串口热插拔：未连接且空闲时每 2 秒重新枚举，并在窗口重新获得焦点/切回前台时立即刷新。
   * 连接期间不轮询，避免与设备会话抢串口；断开后下一轮会自动恢复。
   */
  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (phaseRef.current !== "idle" || snapshotRef.current) return;
      void loadPorts(true);
    };
    void loadPorts(true);
    const timer = window.setInterval(tick, 2000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [boardId, loadPorts]);

  const connect = useCallback(async () => {
    if (!portName) {
      optionsRef.current.onNotice?.("请先选择串口：插上开发板后点「刷新」。");
      return false;
    }
    if (!boardId) {
      optionsRef.current.onNotice?.("请先在顶部工具栏选择开发板型号。");
      return false;
    }
    setPhase("connecting");
    setError(null);
    try {
      const next = await connectHardwareDevice(portName, boardId);
      setSnapshot(next);
      setPhase("idle");
      pushLog("system", `已连接 ${next.portName}（${next.machine || next.boardId}，固件 ${next.release || next.version}）。\n`);
      await loadFiles(deviceDefaultPath);
      return true;
    } catch (caught) {
      const message = hardwareErrorMessage(caught);
      setPhase("idle");
      setError(message);
      pushLog("stderr", `${message}\n`);
      optionsRef.current.onNotice?.(`连接设备失败：${message}`);
      return false;
    }
  }, [boardId, loadFiles, portName, pushLog]);

  const disconnect = useCallback(async () => {
    try {
      await disconnectHardwareDevice();
    } catch (caught) {
      setError(hardwareErrorMessage(caught));
    }
    setSnapshot(null);
    setFiles([]);
    setFilesPath(deviceDefaultPath);
    setPhase("idle");
    setProgress(null);
    pushLog("system", "已断开设备。\n");
  }, [pushLog]);

  const refreshFiles = useCallback(() => loadFiles(filesPath), [filesPath, loadFiles]);
  const openDirectory = useCallback((path: string) => loadFiles(path), [loadFiles]);
  const goToParentDirectory = useCallback(() => loadFiles(deviceParentPath(filesPath)), [filesPath, loadFiles]);

  const sendSerial = useCallback(async (text: string, lineEnding: "crlf" | "lf" | "none" = "crlf") => {
    // 控制台里直接回显用户这一行，而不是“已发送”的提示；运行中的 stdin 也不会有设备回显。
    optionsRef.current.onOutput?.("input", text.endsWith("\n") ? text : `${text}\n`);
    try {
      const output = await sendHardwareSerial(text, lineEnding);
      if (output) {
        const line = output.endsWith("\n") ? output : `${output}\n`;
        // 空闲时命令是走 Raw REPL 执行的，输出只从命令返回值回来，不会走设备事件。
        optionsRef.current.onOutput?.("stdout", line);
        pushLog("stdout", line);
      }
      return output;
    } catch (caught) {
      const message = hardwareErrorMessage(caught);
      setError(message);
      pushLog("stderr", `${message}\n`);
      return null;
    }
  }, [pushLog]);

  const readFile = useCallback(
    async (path: string) => {
      try {
        const result = await readHardwareDeviceFile(path);
        pushLog("system", `已读取 ${path}（${result.size} 字节，sha256 ${result.sha256.slice(0, 12)}…）。\n`);
        return result;
      } catch (caught) {
        const message = hardwareErrorMessage(caught);
        setError(message);
        pushLog("stderr", `${message}\n`);
        if (isHardwareDisconnectedError(caught)) setSnapshot(null);
        return null;
      }
    },
    [pushLog],
  );

  const deleteFile = useCallback(
    async (path: string) => {
      try {
        await deleteHardwareDeviceFile(path);
        pushLog("system", `已删除设备文件 ${path}。\n`);
        await loadFiles(filesPath);
        return true;
      } catch (caught) {
        const message = hardwareErrorMessage(caught);
        setError(message);
        pushLog("stderr", `${message}\n`);
        if (isHardwareDisconnectedError(caught)) setSnapshot(null);
        return false;
      }
    },
    [filesPath, loadFiles, pushLog],
  );

  const uploadFile = useCallback(
    async (path: string, bytes: Uint8Array) => {
      try {
        const report = await uploadHardwareDeviceFile(path, bytes);
        pushLog("system", `已上传 ${report.path}（${report.size} 字节，校验${report.verifiedHash ? " SHA-256" : "大小"}通过）。\n`);
        await loadFiles(filesPath);
        return report;
      } catch (caught) {
        const message = hardwareErrorMessage(caught);
        setError(message);
        pushLog("stderr", `${message}\n`);
        if (isHardwareDisconnectedError(caught)) setSnapshot(null);
        return null;
      }
    },
    [filesPath, loadFiles, pushLog],
  );

  const run = useCallback(
    async (code: string, entryPath = `/${deviceEntryFileName}`) => {
      if (!snapshot) {
        optionsRef.current.onNotice?.("还没有连接开发板：请在顶部工具栏选择串口并点「连接」。");
        return null;
      }
      setError(null);
      setProgress(null);
      setPhase("uploading");
      try {
        const accepted = await runHardwareDeviceProgram({ entryPath, code, boardId: snapshot.boardId });
        setPhase("running");
        pushLog("system", `开始运行编号 ${accepted.runId}：先把程序上传到 ${entryPath}，校验通过后再软复位执行。\n`);
        return accepted;
      } catch (caught) {
        const message = hardwareErrorMessage(caught);
        setError(message);
        setPhase("idle");
        setProgress(null);
        if (isHardwareDisconnectedError(caught)) setSnapshot(null);
        optionsRef.current.onNotice?.(`设备运行失败：${message}`);
        return null;
      }
    },
    [pushLog, snapshot],
  );

  const runAndWait = useCallback(
    async (code: string, timeoutMs = 2500) => {
      const accepted = await run(code);
      if (!accepted) return { accepted: null, outcome: null };
      const cached = finishedRuns.current.get(accepted.runId);
      if (cached) {
        finishedRuns.current.delete(accepted.runId);
        return { accepted, outcome: cached };
      }
      const outcome = await new Promise<HardwareRunFinishedPayload | null>((resolve) => {
        const timer = window.setTimeout(() => {
          waiters.current.delete(accepted.runId);
          resolve(null);
        }, timeoutMs);
        waiters.current.set(accepted.runId, (payload) => {
          window.clearTimeout(timer);
          resolve(payload);
        });
      });
      return { accepted, outcome };
    },
    [run],
  );

  const stop = useCallback(async () => {
    setPhase("stopping");
    try {
      const stopped = await stopHardwareDeviceProgram();
      if (!stopped) {
        pushLog("system", "设备上没有正在运行的程序。\n");
        setPhase("idle");
      }
    } catch (caught) {
      setError(hardwareErrorMessage(caught));
      setPhase("idle");
    }
  }, [pushLog]);

  const reset = useCallback(async () => {
    if (!snapshot) {
      optionsRef.current.onNotice?.("还没有连接开发板：请在顶部工具栏选择串口并点「连接」。");
      return;
    }
    setError(null);
    setPhase("resetting");
    try {
      const accepted = await resetHardwareDeviceProgram();
      setPhase("running");
      pushLog("system", `已重置设备（编号 ${accepted.runId}）：软复位后重新执行设备上的 ${deviceEntryFileName}。\n`);
    } catch (caught) {
      const message = hardwareErrorMessage(caught);
      setError(message);
      setPhase("idle");
      if (isHardwareDisconnectedError(caught)) setSnapshot(null);
      optionsRef.current.onNotice?.(`设备重置失败：${message}`);
    }
  }, [pushLog, snapshot]);

  const clearLog = useCallback(() => setLog([]), []);
  const clearError = useCallback(() => setError(null), []);

  return {
    ports,
    portName,
    snapshot,
    connected: Boolean(snapshot),
    running: phase === "running" || phase === "uploading" || Boolean(snapshot?.running),
    busy: phase !== "idle" || Boolean(snapshot?.running),
    phase,
    progress,
    log,
    files,
    filesPath,
    error,
    selectPort: setPortName,
    refreshPorts,
    connect,
    disconnect,
    openDirectory,
    goToParentDirectory,
    refreshFiles,
    readFile,
    deleteFile,
    uploadFile,
    run,
    runAndWait,
    stop,
    reset,
    sendSerial,
    clearLog,
    clearError,
  };
}
