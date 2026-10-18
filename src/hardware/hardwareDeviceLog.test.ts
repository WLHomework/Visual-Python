import { describe, expect, it } from "vitest";
import {
  appendDeviceLog,
  describeHardwareDevice,
  describeRunFinished,
  deviceLogLineLimit,
  deviceParentPath,
  devicePathJoin,
  deviceProgressPercent,
  deviceRunPhaseLabel,
  formatDeviceBytes,
  runIdFromOperation,
  type DeviceLogLine,
} from "./hardwareDeviceLog";

describe("appendDeviceLog", () => {
  it("按行拆分输出并分配递增编号", () => {
    const lines = appendDeviceLog([], "stdout", "tick 1\r\ntick 2\r\n", 1);
    expect(lines).toEqual<DeviceLogLine[]>([
      { id: 1, stream: "stdout", text: "tick 1" },
      { id: 2, stream: "stdout", text: "tick 2" },
    ]);
  });

  it("没有换行结尾时也保留最后一行，并且空输入不产生新行", () => {
    const lines = appendDeviceLog([], "stdout", "blink", 5);
    expect(lines).toEqual<DeviceLogLine[]>([{ id: 5, stream: "stdout", text: "blink" }]);
    expect(appendDeviceLog(lines, "stdout", "", 6)).toBe(lines);
  });

  it("超过上限时只保留最新的行", () => {
    let lines: DeviceLogLine[] = [];
    for (let index = 0; index < deviceLogLineLimit + 5; index += 1) {
      lines = appendDeviceLog(lines, "stdout", `line ${index}\n`, index + 1);
    }
    expect(lines).toHaveLength(deviceLogLineLimit);
    expect(lines[0].text).toBe("line 5");
    expect(lines[lines.length - 1].text).toBe(`line ${deviceLogLineLimit + 4}`);
  });

  it("截断超长行，避免一行输出撑爆界面", () => {
    const lines = appendDeviceLog([], "stdout", "x".repeat(5000), 1);
    expect(lines[0].text).toHaveLength(4000);
  });
});

describe("设备文件路径", () => {
  it("拼接根目录与子目录", () => {
    expect(devicePathJoin("/", "lib")).toBe("/lib");
    expect(devicePathJoin("/lib", "util.py")).toBe("/lib/util.py");
  });

  it("回到上级目录时根目录收敛到自身", () => {
    expect(deviceParentPath("/lib/util.py")).toBe("/lib");
    expect(deviceParentPath("/lib")).toBe("/");
    expect(deviceParentPath("/")).toBe("/");
    expect(deviceParentPath("")).toBe("/");
  });
});

describe("设备状态文案", () => {
  it("未连接时给出引导文案", () => {
    expect(describeHardwareDevice(null).title).toBe("未连接设备");
  });

  it("连接后用串口与固件版本描述设备", () => {
    const described = describeHardwareDevice({
      portName: "COM3",
      boardId: "esp32-wroom",
      implementation: "micropython",
      version: "3.4.0; MicroPython v1.29.0 on 2026-08-24",
      release: "1.29.0",
      machine: "ESP32 module with ESP32",
      running: false,
    });
    expect(described.title).toBe("COM3 · MicroPython 1.29.0");
    expect(described.detail).toContain("ESP32 module with ESP32");
  });

  it("运行阶段只在进行中才有标签", () => {
    expect(deviceRunPhaseLabel("idle")).toBeNull();
    expect(deviceRunPhaseLabel("uploading")).toContain("上传");
    expect(deviceRunPhaseLabel("running")).toContain("运行");
    expect(deviceRunPhaseLabel("resetting")).toContain("重置");
  });

  it("按运行结果给出不同的语气", () => {
    const base = { runId: 1, streamedBytes: 10, tail: "" };
    expect(describeRunFinished({ ...base, status: "finished" }).tone).toBe("success");
    expect(describeRunFinished({ ...base, status: "exception" }).tone).toBe("error");
    // 停止是中断而不是失败：设备没有重启，提示语气是警告而不是错误。
    const interrupted = describeRunFinished({ ...base, status: "interrupted" });
    expect(interrupted.tone).toBe("warning");
    expect(interrupted.message).toContain("没有重启");
    expect(describeRunFinished({ ...base, status: "stillRunning" }).message).toContain("仍在");
  });
});

describe("进度与体积格式", () => {
  it("没有总数时进度不确定", () => {
    expect(deviceProgressPercent(null)).toBeUndefined();
    expect(deviceProgressPercent({ written: 0, total: 0 })).toBeUndefined();
  });

  it("进度取整并夹在 0-100", () => {
    expect(deviceProgressPercent({ written: 1, total: 4 })).toBe(25);
    expect(deviceProgressPercent({ written: 5, total: 4 })).toBe(100);
  });

  it("体积按量级换算", () => {
    expect(formatDeviceBytes(512)).toBe("512 B");
    expect(formatDeviceBytes(2048)).toBe("2.0 KB");
    expect(formatDeviceBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("运行编号解析", () => {
  it("从后端操作名里取出编号", () => {
    expect(runIdFromOperation("hardware_run#12")).toBe(12);
    expect(runIdFromOperation("hardware_upload#7")).toBe(7);
  });

  it("换行或没有编号时返回 null", () => {
    expect(runIdFromOperation("hardware_run")).toBeNull();
    expect(runIdFromOperation("读取文件列表")).toBeNull();
  });
});
