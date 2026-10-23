import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HardwareDeviceFilesView, type HardwareDeviceFilesViewProps } from "./HardwareDeviceFiles";
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

function render(overrides: Partial<HardwareDeviceFilesViewProps> = {}) {
  const props: HardwareDeviceFilesViewProps = {
    device: null,
    files: [],
    filesPath: "/",
    busy: false,
    preview: null,
    onRefreshFiles: vi.fn(),
    onOpenDirectory: vi.fn(),
    onParentDirectory: vi.fn(),
    onReadFile: vi.fn(),
    onDeleteFile: vi.fn(),
    onClosePreview: vi.fn(),
    ...overrides,
  };
  return renderToStaticMarkup(<HardwareDeviceFilesView {...props} />);
}

describe("hardware device files view", () => {
  it("未连接时只给一行提示，文件操作全部禁用", () => {
    const html = render();
    expect(html).toContain("未连接开发板");
    expect(html).toContain("在顶部选择串口并点「连接」后，这里会列出设备上的文件。");
    expect(html.match(/disabled=""/g)?.length ?? 0).toBe(2);
  });

  it("连接后显示端口与固件版本，并列出文件与大小", () => {
    const html = render({
      device,
      files: [
        { name: "main.py", size: 428, isDirectory: false },
        { name: "lib", size: 0, isDirectory: true },
      ],
    });
    expect(html).toContain("COM3 · MicroPython 1.29.0");
    expect(html).toContain("428 B");
    expect(html).toContain("main.py");
    expect(html).toContain("lib");
    expect(html).toContain("读取");
    expect(html).toContain("删除 main.py");
  });

  it("根目录下禁用「上级」，设备忙时禁用文件操作", () => {
    const root = render({ device, files: [{ name: "main.py", size: 10, isDirectory: false }] });
    expect(root).toContain('title="上级目录" aria-label="上级目录" disabled=""');
    const busy = render({ device, busy: true, files: [{ name: "main.py", size: 10, isDirectory: false }] });
    expect(busy.match(/disabled=""/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("读取文件后显示代码容器与可拖动分隔条，加载时用同色占位", () => {
    const html = render({ device, preview: { path: "/main.py", content: "while True:\n    pass\n" } });
    expect(html).toContain("/main.py");
    expect(html).toContain("关闭文件内容");
    expect(html).toContain('aria-label="调整文件列表高度"');
    expect(html).toContain('title="拖动调整文件列表与代码区域的比例"');
    expect(html).toContain("hardware-files-code-loading");
  });
});
