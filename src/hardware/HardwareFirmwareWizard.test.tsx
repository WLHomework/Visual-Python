import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FirmwareFlashWizardView, type FirmwareWizardSnapshot } from "./HardwareFirmwareWizard";

const snapshot: FirmwareWizardSnapshot = {
  catalog: {
    schemaVersion: 1,
    images: [
      {
        boardId: "esp32-wroom",
        chipFamily: "esp32",
        version: "1.29.0",
        filename: "ESP32_GENERIC.bin",
        url: "https://example.com/esp32.bin",
        sha256: "a".repeat(64),
      },
      {
        boardId: "esp8266-esp12e",
        chipFamily: "esp8266",
        version: "1.29.0",
        filename: "ESP8266_GENERIC.bin",
        url: "https://example.com/esp8266.bin",
        sha256: "b".repeat(64),
      },
    ],
  },
  ports: [{ portName: "COM3", label: "USB-SERIAL CH340 (COM3)", portType: "usb" }],
  selectedBoard: "esp32-wroom",
  selectedPort: "COM3",
  status: "ready",
  progress: 0,
  confirmed: false,
  message: null,
};

describe("firmware flash wizard view", () => {
  it("shows board, port, firmware metadata, and a guarded flash action", () => {
    const html = renderToStaticMarkup(<FirmwareFlashWizardView snapshot={snapshot} onBoardChange={vi.fn()} onPortChange={vi.fn()} onRefresh={vi.fn()} onDownload={vi.fn()} onFlash={vi.fn()} onConfirmChange={vi.fn()} />);

    expect(html).toContain("ESP32 WROOM / 常见 DevKit");
    expect(html).toContain("USB-SERIAL CH340 (COM3)");
    expect(html).toContain("1.29.0");
    expect(html).toContain("SHA-256");
    expect(html).toContain("我确认刷写会覆盖设备 Flash");
    expect(html).toContain('disabled=""');
  });

  it("shows progress and an actionable error without hiding the selected device", () => {
    const html = renderToStaticMarkup(<FirmwareFlashWizardView snapshot={{ ...snapshot, status: "flashing", progress: 35, message: "擦除 Flash" }} onBoardChange={vi.fn()} onPortChange={vi.fn()} onRefresh={vi.fn()} onDownload={vi.fn()} onFlash={vi.fn()} onConfirmChange={vi.fn()} />);

    expect(html).toContain("擦除 Flash");
    expect(html).toContain('value="35"');
    expect(html).toContain("ESP32 WROOM / 常见 DevKit");
  });
});
