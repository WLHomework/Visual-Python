import { afterEach, describe, expect, it } from "vitest";
import {
  advancedWirelessBlockTypes,
  deviceStorageBlockTypes,
  getActiveHardwareBoard,
  hardwareBlockTypes,
  p0ModuleBlockTypes,
  setActiveHardwareBoard,
  spiBlockTypes,
} from "../blocks/shared";
import { hardwareBlockEntries } from "./hardwareEntries";

const boards = ["esp32-wroom", "esp8266-esp12e", "esp32-s3"] as const;
/** 该板卡没有的积木：板载 LED、板载 RGB 灯、电容触摸、串口、芯片温度与 S3 专属联网/存储/模块随板卡变化。 */
const missingByBoard: Record<string, readonly string[]> = {
  "esp32-s3": ["hardware_builtin_led"],
  "esp32-wroom": [
    "hardware_onboard_rgb",
    "hardware_mcu_temperature",
    ...advancedWirelessBlockTypes,
    ...deviceStorageBlockTypes,
    ...p0ModuleBlockTypes,
    ...spiBlockTypes,
  ],
  "esp8266-esp12e": [
    "hardware_touch_read",
    "hardware_onboard_rgb",
    "hardware_mcu_temperature",
    "hardware_uart_init",
    "hardware_uart_write",
    "hardware_uart_read",
    "hardware_uart_available",
    "hardware_uart_deinit",
    ...advancedWirelessBlockTypes,
    ...deviceStorageBlockTypes,
    ...p0ModuleBlockTypes,
    ...spiBlockTypes,
  ],
};

afterEach(() => {
  setActiveHardwareBoard(undefined);
});

describe("hardwareBlockEntries", () => {
  it("indexes block entries by type and leaves labels out", () => {
    const entries = hardwareBlockEntries("esp32-s3");

    expect(entries.get("hardware_pin_write")).toHaveLength(1);
    expect(entries.get("hardware_pin_write")?.[0]).toMatchObject({ kind: "block", type: "hardware_pin_write" });
    expect([...entries.keys()].every((type) => type.startsWith("hardware_"))).toBe(true);
  });

  it("keeps the builtin LED only on boards that have one", () => {
    expect(hardwareBlockEntries("esp32-s3").has("hardware_builtin_led")).toBe(false);
    expect(hardwareBlockEntries("esp32-wroom").has("hardware_builtin_led")).toBe(true);
    expect(hardwareBlockEntries("esp8266-esp12e").has("hardware_builtin_led")).toBe(true);
  });

  it("keeps the onboard RGB light only on boards that have one", () => {
    expect(hardwareBlockEntries("esp32-s3").has("hardware_onboard_rgb")).toBe(true);
    expect(hardwareBlockEntries("esp32-wroom").has("hardware_onboard_rgb")).toBe(false);
    expect(hardwareBlockEntries("esp8266-esp12e").has("hardware_onboard_rgb")).toBe(false);
  });

  it("keeps capacitive touch only on boards that have it", () => {
    expect(hardwareBlockEntries("esp32-s3").has("hardware_touch_read")).toBe(true);
    expect(hardwareBlockEntries("esp32-wroom").has("hardware_touch_read")).toBe(true);
    expect(hardwareBlockEntries("esp8266-esp12e").has("hardware_touch_read")).toBe(false);
  });

  it("keeps UART and MCU temperature only on boards that have them", () => {
    expect(hardwareBlockEntries("esp32-s3").has("hardware_uart_init")).toBe(true);
    expect(hardwareBlockEntries("esp32-s3").has("hardware_uart_available")).toBe(true);
    expect(hardwareBlockEntries("esp32-s3").has("hardware_mcu_temperature")).toBe(true);
    expect(hardwareBlockEntries("esp32-wroom").has("hardware_uart_init")).toBe(true);
    expect(hardwareBlockEntries("esp32-wroom").has("hardware_uart_deinit")).toBe(true);
    expect(hardwareBlockEntries("esp32-wroom").has("hardware_mcu_temperature")).toBe(false);
    expect(hardwareBlockEntries("esp8266-esp12e").has("hardware_uart_init")).toBe(false);
    expect(hardwareBlockEntries("esp8266-esp12e").has("hardware_uart_available")).toBe(false);
    expect(hardwareBlockEntries("esp8266-esp12e").has("hardware_mcu_temperature")).toBe(false);
  });

  it("keeps HTTP/BLE/ESP-NOW/MQTT, device storage and SPI only on ESP32-S3", () => {
    const s3 = hardwareBlockEntries("esp32-s3");
    expect(s3.has("hardware_http_get")).toBe(true);
    expect(s3.has("hardware_http_post")).toBe(true);
    expect(s3.has("hardware_ntp_local")).toBe(true);
    expect(s3.has("hardware_wifi_ap_start")).toBe(true);
    expect(s3.has("hardware_wifi_rssi")).toBe(true);
    expect(s3.has("hardware_ble_start")).toBe(true);
    expect(s3.has("hardware_espnow_init")).toBe(true);
    expect(s3.has("hardware_mqtt_connect")).toBe(true);
    expect(s3.has("hardware_mqtt_disconnect")).toBe(true);
    expect(s3.has("hardware_file_write")).toBe(true);
    expect(s3.has("hardware_file_list")).toBe(true);
    expect(s3.has("hardware_nvs_delete")).toBe(true);
    expect(s3.has("hardware_spi_init")).toBe(true);
    expect(s3.has("hardware_i2c_deinit")).toBe(true);

    for (const boardId of ["esp32-wroom", "esp8266-esp12e"] as const) {
      const entries = hardwareBlockEntries(boardId);
      expect(entries.has("hardware_http_get")).toBe(false);
      expect(entries.has("hardware_http_post")).toBe(false);
      expect(entries.has("hardware_ntp_local")).toBe(false);
      expect(entries.has("hardware_wifi_ap_start")).toBe(false);
      expect(entries.has("hardware_wifi_rssi")).toBe(false);
      expect(entries.has("hardware_ble_start")).toBe(false);
      expect(entries.has("hardware_espnow_init")).toBe(false);
      expect(entries.has("hardware_mqtt_connect")).toBe(false);
      expect(entries.has("hardware_mqtt_disconnect")).toBe(false);
      expect(entries.has("hardware_file_write")).toBe(false);
      expect(entries.has("hardware_file_list")).toBe(false);
      expect(entries.has("hardware_nvs_delete")).toBe(false);
      expect(entries.has("hardware_spi_init")).toBe(false);
      expect(entries.has("hardware_i2c_deinit")).toBe(true);
    }
  });

  it("keeps the H1 module blocks only on ESP32-S3 for now", () => {
    const s3 = hardwareBlockEntries("esp32-s3");
    for (const type of p0ModuleBlockTypes) expect(s3.has(type)).toBe(true);

    for (const boardId of ["esp32-wroom", "esp8266-esp12e"] as const) {
      const entries = hardwareBlockEntries(boardId);
      for (const type of p0ModuleBlockTypes) expect(entries.has(type), `${boardId} 不应该有 ${type}`).toBe(false);
    }
  });

  it("covers every hardware block type the board supports", () => {
    for (const boardId of boards) {
      const entries = hardwareBlockEntries(boardId);
      const missing = missingByBoard[boardId] ?? [];
      for (const type of hardwareBlockTypes) {
        if (missing.includes(type)) {
          expect(entries.has(type), `${boardId} 不应该有 ${type}`).toBe(false);
          continue;
        }
        expect(entries.has(type), `${boardId} 缺少 ${type}`).toBe(true);
      }
      for (const type of entries.keys()) expect(hardwareBlockTypes).toContain(type);
    }
  });

  it("activates the board while scanning its toolbox", () => {
    setActiveHardwareBoard(undefined);

    hardwareBlockEntries("esp8266-esp12e");

    expect(getActiveHardwareBoard()?.boardId).toBe("esp8266-esp12e");
  });
});
