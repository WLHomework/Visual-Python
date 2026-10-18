import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { downloadFirmware, flashFirmware, getFirmwareCatalog, listHardwareSerialPorts } from "./hardwareApi";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("hardware API", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("loads the firmware catalog through the typed command", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([{
      boardId: "esp32-wroom",
      chipFamily: "esp32",
      version: "1.29.0",
      filename: "firmware.bin",
      url: "https://example.com/firmware.bin",
      sha256: "a".repeat(64),
      flashOffset: 4096,
    }]);

    await expect(getFirmwareCatalog()).resolves.toMatchObject({ schemaVersion: 1, images: [{ boardId: "esp32-wroom" }] });
    expect(invoke).toHaveBeenCalledWith("hardware_get_firmware_catalog");
  });

  it("rejects an empty catalog before the UI can start a flash", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);

    await expect(getFirmwareCatalog()).rejects.toThrow("固件清单为空");
  });

  it("lists serial ports through the typed command", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);

    await expect(listHardwareSerialPorts()).resolves.toEqual([]);
    expect(invoke).toHaveBeenCalledWith("hardware_list_serial_ports");
  });

  it("downloads a fixed firmware image by board id", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ boardId: "esp32-wroom", version: "1.29.0", path: "cache.bin", cached: false, sizeBytes: 42 });

    await expect(downloadFirmware("esp32-wroom")).resolves.toMatchObject({ path: "cache.bin", cached: false });
    expect(invoke).toHaveBeenCalledWith("hardware_download_firmware", { boardId: "esp32-wroom" });
  });

  it("requires the caller to pass an explicit confirmation to flash", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ boardId: "esp32-wroom", portName: "COM3", version: "1.29.0" });

    await expect(flashFirmware("esp32-wroom", "COM3", true)).resolves.toMatchObject({ portName: "COM3" });
    expect(invoke).toHaveBeenCalledWith("hardware_flash_firmware", { boardId: "esp32-wroom", portName: "COM3", confirmed: true });
  });
});
