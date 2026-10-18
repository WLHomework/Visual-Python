import { useCallback, useRef } from "react";
import type { HostDeviceExecutionState, HostRunResult } from "../agentV2/visualPythonHost";
import { describeRunFinished, deviceEntryFileName } from "../hardware/hardwareDeviceLog";
import { deviceLibrariesForCode, deviceLibraryBytes, deviceLibraryPath } from "../hardware/deviceLibraries";
import type { HardwareDeviceController } from "../hardware/useHardwareDevice";

export type HardwareRunnerOptions = {
  device: HardwareDeviceController;
  /** 当前要上传到设备的程序文本（积木生成的 MicroPython，或代码模式下的源码）。 */
  getCode: () => string;
  /** 运行前的界面准备与校验（清空问题、展开输出面板）；返回 false 表示不要运行。 */
  prepare: () => boolean;
};

async function uploadRequiredDeviceLibraries(device: HardwareDeviceController, code: string): Promise<boolean> {
  for (const library of deviceLibrariesForCode(code)) {
    const report = await device.uploadFile(deviceLibraryPath(library), deviceLibraryBytes(library));
    if (!report) return false;
  }
  return true;
}

/**
 * 硬件工作台的运行语义：运行 = 上传入口文件并复位执行，停止 = 只中断不重启。
 *
 * 工具栏按钮、快捷键和 AI 工具都通过这里运行，`App` 不需要知道设备上传的细节。
 * 上传失败时后端不会启动设备上的旧程序，所以这里不需要额外兜底。
 */
export function useHardwareRunner(options: HardwareRunnerOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const run = useCallback(async () => {
    const { device, getCode, prepare } = optionsRef.current;
    if (!prepare()) return null;
    const code = getCode();
    if (!(await uploadRequiredDeviceLibraries(device, code))) return null;
    return device.run(code, `/${deviceEntryFileName}`);
  }, []);

  const stop = useCallback(() => optionsRef.current.device.stop(), []);

  /** 有设备操作正在进行：主按钮据此在「运行」与「停止」之间切换。 */
  const isBusy = useCallback(() => optionsRef.current.device.busy, []);

  /** AI 触发的运行：有界等待结果，死循环程序不会卡住工具调用。 */
  const runForAgent = useCallback(async (): Promise<HostRunResult> => {
    const { device, getCode } = optionsRef.current;
    const code = getCode();
    if (!(await uploadRequiredDeviceLibraries(device, code))) {
      return { started: false, target: "device", message: device.error ?? "设备端库上传失败。" };
    }
    const { accepted, outcome } = await device.runAndWait(code);
    if (!accepted) return { started: false, target: "device", message: device.error ?? "设备运行没有启动（请检查连接状态）。" };
    const message = outcome
      ? `${describeRunFinished(outcome).message}${outcome.tail ? ` 错误输出：${outcome.tail.slice(-400)}` : ""}`
      : "程序已上传到设备并开始运行，仍在运行中（死循环程序不会结束），设备输出见控制台与设备面板。";
    return { started: true, target: "device", runId: accepted.runId, message };
  }, []);

  const executionState = useCallback((): HostDeviceExecutionState => {
    const { device } = optionsRef.current;
    return { deviceRunning: device.running, devicePhase: device.phase, devicePort: device.snapshot?.portName ?? null, deviceConnected: device.connected };
  }, []);

  return { run, stop, isBusy, runForAgent, executionState };
}
