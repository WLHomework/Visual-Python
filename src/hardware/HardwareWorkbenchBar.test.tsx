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
    ports: [{ portName: "COM3", label: "USB-SERIAL CH340 (COM3)", portType: "usb" }],
    portName: "",
    device: null,
    busy: false,
    onSelectPort: vi.fn(),
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    onRun: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
  return renderToStaticMarkup(<HardwareWorkbenchBar {...props} />);
}

describe("hardware workbench bar", () => {
  it("只放串口、连接、运行，不常驻显示开发板下拉框、刷新和重置", () => {
    const html = render();
    expect(html).toContain(">COM3</option>");
    expect(html).toContain("连接");
    expect(html).toContain("运行");
    // 开发板型号是工程属性：状态栏会显示，操作条不再重复一个下拉框。
    expect(html).not.toContain("hardware-bar-board");
    expect(html).not.toContain("开发板型号");
    expect(html).not.toContain("ESP32 WROOM");
    // 串口已经自动刷新，工具栏不再保留刷新按钮；手动刷新在「设备」菜单里。
    expect(html).not.toContain("刷新串口");
    // 重置设备是低频兜底动作，放在「设备」菜单里，不占操作条。
    expect(html).not.toContain("重置设备");
    // 不再有文字标签与阶段说明。
    expect(html).not.toContain("开发板：");
    expect(html).not.toContain("已连接，等待运行");
  });

  it("串口选项只显示 COMx，完整描述放在 title 里", () => {
    const html = render({ portName: "COM3" });

    expect(html).toContain(">COM3</option>");
    expect(html).not.toContain(">USB-SERIAL CH340 (COM3)</option>");
    expect(html).toContain('title="COM3 · USB-SERIAL CH340 (COM3)"');
  });

  it("未选串口时不能连接、未连接时不能运行", () => {
    const html = render();
    expect(html).toContain('title="请先选择串口" disabled=""');
    expect(html).toMatch(/hardware-bar-run[^>]*disabled=""/);
  });

  it("选了串口就能连接；连接后变成断开，运行按钮可用", () => {
    const html = render({ portName: "COM3" });
    expect(html).toContain('title="连接开发板"');
    expect(html).not.toContain('title="请先选择串口" disabled=""');

    const connected = render({ portName: "COM3", device });
    expect(connected).toContain("断开");
    expect(connected).not.toMatch(/hardware-bar-run[^>]*disabled=""/);
  });

  it("设备忙时按钮变成「停止」，串口和连接都锁住", () => {
    const html = render({ portName: "COM3", device: { ...device, running: true }, busy: true });
    expect(html).toContain("停止");
    expect(html).toMatch(/hardware-bar-port[^>]*disabled=""/);
    expect(html.match(/disabled=""/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("连接过程中按钮显示「连接中」且禁用", () => {
    const html = render({ portName: "COM3", busy: true });
    expect(html).toContain("连接中");
    expect(html).not.toContain(">连接<");
  });
});
