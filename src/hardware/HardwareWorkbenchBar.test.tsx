import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HardwareWorkbenchBar, type HardwareWorkbenchBarProps } from "./HardwareWorkbenchBar";
import type { HardwareDeviceSnapshot } from "./hardwareDeviceApi";

const device: HardwareDeviceSnapshot = {
  portName: "COM3",
  boardId: "esp32-wroom",
  implementation: "micropython",
  version: "3.4.0; MicroPython v1.29.0 on 2026-08-24",
  release: "1.29.0",
  machine: "ESP32 module with ESP32",
  running: false,
};

function render(overrides: Partial<HardwareWorkbenchBarProps> = {}) {
  const props: HardwareWorkbenchBarProps = {
    boardId: "esp32-wroom",
    ports: [{ portName: "COM3", label: "USB-SERIAL CH340 (COM3)", portType: "usb" }],
    portName: "",
    device: null,
    busy: false,
    onSelectBoard: vi.fn(),
    onSelectPort: vi.fn(),
    onRefreshPorts: vi.fn(),
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    onRun: vi.fn(),
    onStop: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };
  return renderToStaticMarkup(<HardwareWorkbenchBar {...props} />);
}

describe("hardware workbench bar", () => {
  it("只放控件，不放说明文字：板卡、串口、刷新、连接、运行、重置", () => {
    const html = render();
    expect(html).toContain("ESP32 WROOM");
    expect(html).toContain("USB-SERIAL CH340 (COM3)");
    expect(html).toContain("刷新串口");
    expect(html).toContain("连接");
    expect(html).toContain("运行");
    expect(html).toContain("重置设备");
    // 不再有文字标签与阶段说明。
    expect(html).not.toContain("开发板：");
    expect(html).not.toContain("已连接，等待运行");
  });

  it("未选串口时不能连接、未连接时不能运行或重置", () => {
    const html = render();
    expect(html).toContain('title="请先选择串口" disabled=""');
    expect(html).toMatch(/hardware-bar-run[^>]*disabled=""/);
    expect(html).toMatch(/aria-label="重置设备" disabled=""/);
  });

  it("选了串口就能连接；连接后变成断开，运行按钮可用", () => {
    const html = render({ portName: "COM3" });
    expect(html).toContain('title="连接开发板"');
    expect(html).not.toContain('title="请先选择串口" disabled=""');

    const connected = render({ portName: "COM3", device });
    expect(connected).toContain("断开");
    expect(connected).not.toMatch(/hardware-bar-run[^>]*disabled=""/);
  });

  it("设备忙时按钮变成「停止」，板卡/串口/重置都锁住", () => {
    const html = render({ portName: "COM3", device: { ...device, running: true }, busy: true });
    expect(html).toContain("停止");
    expect(html).toMatch(/hardware-bar-board[^>]*disabled=""/);
    expect(html).toMatch(/hardware-bar-port[^>]*disabled=""/);
    expect(html).toMatch(/aria-label="重置设备" disabled=""/);
    expect(html.match(/disabled=""/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("连接过程中按钮显示「连接中」且禁用", () => {
    const html = render({ portName: "COM3", busy: true });
    expect(html).toContain("连接中");
    expect(html).not.toContain(">连接<");
  });
});
