// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getFirmwareCatalog: vi.fn(),
  downloadFirmware: vi.fn(),
  flashFirmware: vi.fn(),
}));

vi.mock("./hardwareApi", () => ({
  getFirmwareCatalog: api.getFirmwareCatalog,
  downloadFirmware: api.downloadFirmware,
  flashFirmware: api.flashFirmware,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => undefined),
}));

import { FirmwareFlashDialog } from "./FirmwareFlashDialog";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const image = {
  boardId: "esp32-s3" as const,
  chipFamily: "esp32s3" as const,
  version: "1.29.0",
  filename: "ESP32_GENERIC_S3.bin",
  url: "https://example.com/firmware.bin",
  sha256: "a".repeat(64),
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("FirmwareFlashDialog", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("确认后自动下载并刷写，显示成功状态", async () => {
    api.getFirmwareCatalog.mockResolvedValue({ schemaVersion: 1, images: [image] });
    api.downloadFirmware.mockResolvedValue({ boardId: "esp32-s3", version: "1.29.0", cached: false });
    api.flashFirmware.mockResolvedValue({ boardId: "esp32-s3", portName: "COM6", version: "1.29.0" });
    const onDisconnect = vi.fn(async () => undefined);
    const onRefreshPorts = vi.fn();
    const onClose = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<FirmwareFlashDialog boardId="esp32-s3" portName="COM6" connected onDisconnect={onDisconnect} onRefreshPorts={onRefreshPorts} onClose={onClose} />);
    });
    await flush();
    expect(container.textContent).toContain("开始刷写");
    expect(container.textContent).toContain("MicroPython 1.29.0");
    expect(container.textContent).toContain("ESP32_GENERIC_S3.bin");
    expect(container.textContent).toContain("SHA-256 aaaaaaaaaaaa");

    const start = [...container.querySelectorAll("button")].find((button) => button.textContent === "开始刷写");
    await act(async () => {
      start?.click();
    });
    await flush();

    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(api.downloadFirmware).toHaveBeenCalledWith("esp32-s3");
    expect(api.flashFirmware).toHaveBeenCalledWith("esp32-s3", "COM6", true);
    expect(onRefreshPorts).toHaveBeenCalled();
    expect(container.textContent).toContain("已刷入 MicroPython 1.29.0");

    await act(async () => {
      root.unmount();
    });
  });

  it("没有串口时不能开始刷写", async () => {
    api.getFirmwareCatalog.mockResolvedValue({ schemaVersion: 1, images: [image] });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(<FirmwareFlashDialog boardId="esp32-s3" portName="" connected={false} onDisconnect={vi.fn(async () => undefined)} onRefreshPorts={vi.fn()} onClose={vi.fn()} />);
    });
    await flush();

    expect(container.textContent).toContain("请先在顶部选择串口");
    const start = [...container.querySelectorAll("button")].find((button) => button.textContent === "开始刷写") as HTMLButtonElement | undefined;
    expect(start?.disabled).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });
});
