import { afterEach, describe, expect, it } from "vitest";
import { getActiveHardwareBoard, hardwareBlockTypes, setActiveHardwareBoard } from "../blocks/shared";
import { hardwareBlockEntries } from "./hardwareEntries";

const boards = ["esp32-wroom", "esp8266-esp12e", "esp32-s3"] as const;
/** 该板卡没有的积木：板载 LED、板载 RGB 灯、电容触摸、串口与芯片温度随板卡变化。 */
const missingByBoard: Record<string, readonly string[]> = {
  "esp32-s3": ["hardware_builtin_led"],
  "esp32-wroom": ["hardware_onboard_rgb", "hardware_mcu_temperature"],
  "esp8266-esp12e": [
    "hardware_touch_read",
    "hardware_onboard_rgb",
    "hardware_mcu_temperature",
    "hardware_uart_init",
    "hardware_uart_write",
    "hardware_uart_read",
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
    expect(hardwareBlockEntries("esp32-s3").has("hardware_mcu_temperature")).toBe(true);
    expect(hardwareBlockEntries("esp32-wroom").has("hardware_uart_init")).toBe(true);
    expect(hardwareBlockEntries("esp32-wroom").has("hardware_mcu_temperature")).toBe(false);
    expect(hardwareBlockEntries("esp8266-esp12e").has("hardware_uart_init")).toBe(false);
    expect(hardwareBlockEntries("esp8266-esp12e").has("hardware_mcu_temperature")).toBe(false);
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
