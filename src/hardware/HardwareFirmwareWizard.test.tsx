// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flashFirmware, getFirmwareCatalog } from "./hardwareApi";
import { HardwareFirmwareWizard, FirmwareFlashWizardView, type FirmwareWizardSnapshot } from "./HardwareFirmwareWizard";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => undefined) }));
vi.mock("./hardwareDeviceApi", () => ({ hardwareErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error) }));
vi.mock("./hardwareApi", () => ({
  downloadFirmware: vi.fn(),
  flashFirmware: vi.fn(),
  getFirmwareCatalog: vi.fn(),
}));

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

const view = (target: FirmwareWizardSnapshot) => renderToStaticMarkup(<FirmwareFlashWizardView snapshot={target} onPortChange={vi.fn()} onRefreshPorts={vi.fn()} onRetry={vi.fn()} onDownload={vi.fn()} onFlash={vi.fn()} onConfirmChange={vi.fn()} />);

describe("firmware flash wizard view", () => {
  beforeEach(() => {
    vi.mocked(getFirmwareCatalog).mockResolvedValue(snapshot.catalog!);
    vi.mocked(flashFirmware).mockResolvedValue({ boardId: "esp32-wroom", portName: "COM3", version: "1.29.0" });
  });

  it("shows the project board, port, firmware metadata, and a guarded flash action", () => {
    const html = view(snapshot);

    expect(html).toContain("ESP32 WROOM");
    expect(html).toContain("USB-SERIAL CH340 (COM3)");
    expect(html).toContain("1.29.0");
    expect(html).toContain("SHA-256");
    expect(html).toContain("我确认刷写会覆盖设备 Flash");
    expect(html).toContain('disabled=""');
  });

  it("preselects the port chosen in the workbench and only refreshes that shared list", () => {
    const html = view(snapshot);
    expect(html).toContain('<option value="COM3" selected=""');

    // 向导不再自己枚举串口：没传端口时只显示“选择串口”，不会凭空出现设备。
    const empty = view({ ...snapshot, ports: [], selectedPort: "" });
    expect(empty).not.toContain("<option value=\"COM3\"");
    expect(empty).toContain('<option value="" selected=""');
  });

  it("locks the firmware image to the project board and offers no board switcher", () => {
    const esp32 = view(snapshot);
    expect(esp32).toContain("ESP32_GENERIC.bin");
    expect(esp32).not.toContain("ESP8266_GENERIC.bin");
    expect(esp32).not.toContain("板卡系列");
    expect(esp32.match(/<select/g) ?? []).toHaveLength(1);

    const esp8266 = view({ ...snapshot, selectedBoard: "esp8266-esp12e" });
    expect(esp8266).toContain("ESP8266 ESP-12E（NodeMCU）");
    expect(esp8266).toContain("ESP8266_GENERIC.bin");
    expect(esp8266).not.toContain("ESP32_GENERIC.bin");
  });

  it("shows progress and an actionable error without hiding the selected device", () => {
    const html = view({ ...snapshot, status: "flashing", progress: 35, message: "擦除 Flash" });

    expect(html).toContain("擦除 Flash");
    expect(html).toContain('value="35"');
    expect(html).toContain("ESP32 WROOM");
  });

  it("refreshes shared ports and tells the user to connect after a successful flash", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const refreshPorts = vi.fn();

    await act(async () => {
      root.render(<HardwareFirmwareWizard
        boardId="esp32-wroom"
        ports={snapshot.ports}
        portName="COM3"
        connected={false}
        onSelectPort={vi.fn()}
        onRefreshPorts={refreshPorts}
        onDisconnect={vi.fn().mockResolvedValue(undefined)}
        onConfirmDisconnect={vi.fn().mockResolvedValue(true)}
      />);
    });

    const confirmation = container.querySelector<HTMLInputElement>("input[type=checkbox]");
    const flash = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("刷写固件"));
    expect(confirmation).not.toBeNull();
    expect(flash).not.toBeUndefined();

    await act(async () => {
      confirmation!.click();
      flash!.click();
    });

    expect(refreshPorts).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("现在可以关闭此页，点击顶部『连接』");
    root.unmount();
  });
});
