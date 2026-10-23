import { describe, expect, it } from "vitest";
import {
  decodeBase64,
  decodeDeviceText,
  encodeBase64,
  hardwareErrorCode,
  hardwareErrorMessage,
  isHardwareDisconnectedError,
  unlistenHardwareDeviceEvents,
} from "./hardwareDeviceApi";

describe("硬件命令错误格式化", () => {
  it("结构化错误取 message，而不是 [object Object]", () => {
    const error = { code: "busy", message: "设备忙：程序正在运行" };
    expect(hardwareErrorMessage(error)).toBe("设备忙：程序正在运行");
    expect(hardwareErrorCode(error)).toBe("busy");
  });

  it("只有 code 时退回 code，字符串与 Error 也都能处理", () => {
    expect(hardwareErrorMessage({ code: "protocol" })).toBe("protocol");
    expect(hardwareErrorMessage("串口被占用")).toBe("串口被占用");
    expect(hardwareErrorMessage(new Error("打开串口失败"))).toBe("打开串口失败");
  });

  it("把首次握手失败转换成 MicroPython 刷写引导", () => {
    const hint = "设备上没有可用的 MicroPython。请到 设备 → 固件刷写 刷写固件后再连接。";
    expect(
      hardwareErrorMessage({
        code: "protocol",
        message: "设备没有进入 Raw REPL，请确认已刷写 MicroPython 固件、串口未被其他程序占用",
      }),
    ).toBe(hint);
    expect(hardwareErrorMessage({ code: "unsupported", message: "固件不是 MicroPython" })).toBe(hint);
    expect(hardwareErrorMessage({ code: "device", message: "板卡与所选固件不匹配" })).toBe(hint);
    expect(hardwareErrorMessage({ code: "protocol", message: "设备输出没有正常结束" })).toBe("设备输出没有正常结束");
  });

  it("识别拔线错误，界面据此回到未连接状态", () => {
    expect(isHardwareDisconnectedError({ code: "disconnected", message: "" })).toBe(true);
    expect(isHardwareDisconnectedError({ code: "timeout", message: "" })).toBe(false);
    expect(isHardwareDisconnectedError(new Error("x"))).toBe(false);
    expect(isHardwareDisconnectedError(null)).toBe(false);
  });
});

describe("base64 上传内容", () => {
  it("二进制往返不丢字节（含 0x00 与 0xff）", () => {
    const bytes = new Uint8Array([0, 1, 2, 0x7f, 0x80, 0xff, 0xfe]);
    expect(Array.from(decodeBase64(encodeBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it("中文源码也能往返", () => {
    const bytes = new TextEncoder().encode("print('你好，设备')\n");
    expect(new TextDecoder().decode(decodeBase64(encodeBase64(bytes)))).toBe("print('你好，设备')\n");
  });

  it("超过一次分片上限的大文件也能编码", () => {
    const bytes = new Uint8Array(20000).map((_, index) => index % 251);
    expect(Array.from(decodeBase64(encodeBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it("读取设备文件时把 base64 解成文本，非法字节替换不抛错", () => {
    expect(decodeDeviceText(encodeBase64(new TextEncoder().encode("while True:\n    pass\n")))).toBe("while True:\n    pass\n");
    expect(decodeDeviceText(encodeBase64(new Uint8Array([0xff, 0xfe, 0x41])))).toBe("\uFFFD\uFFFDA");
  });
});

describe("事件退订", () => {
  it("逐个调用退订函数，失败也不影响其它监听", () => {
    const called: string[] = [];
    unlistenHardwareDeviceEvents([
      () => called.push("a"),
      () => called.push("b"),
    ]);
    expect(called).toEqual(["a", "b"]);
  });
});
