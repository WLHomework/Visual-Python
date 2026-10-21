import * as Blockly from "blockly/core";
import { builtinLedPin, getBoardProfile, validateBoardPin, validateDigitalInputPull, validateToneFrequency } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import * as analog from "./analog";
import * as dht from "./dht";
import * as flow from "./flow";
import * as gpio from "./gpio";
import * as i2c from "./i2c";
import * as math from "./math";
import * as neopixel from "./neopixel";
import * as oled from "./oled";
import * as pwm from "./pwm";
import { esp8266RandomBlockIssue, installEsp8266RandomGuards } from "./randomCompat";
import * as temperature from "./temperature";
import * as uart from "./uart";
import * as ultrasonic from "./ultrasonic";
import * as wifi from "./wifi";
import {
  hardwareBlockLabels,
  hardwareSectionLabel,
  pinUseByBlockType,
  pinUsesForBlock,
  registerHardwareBoardPinExtension,
  setActiveHardwareBoard,
  numericInputValue,
  type HardwareBlockIssue,
} from "./shared";

export {
  countIncompatiblePins,
  getActiveHardwareBoard,
  hardwareBlockTypes,
  isHardwareBlockType,
  refreshHardwareBlocks,
  setActiveHardwareBoard,
} from "./shared";
export type { HardwareBlockIssue } from "./shared";

let hardwareBlocksRegistered = false;

export function registerHardwareBlocks(): void {
  if (hardwareBlocksRegistered) return;
  hardwareBlocksRegistered = true;

  registerHardwareBoardPinExtension();
  gpio.register();
  pwm.register();
  analog.register();
  neopixel.register();
  dht.register();
  ultrasonic.register();
  oled.register();
  flow.register();
  math.register();
  uart.register();
  i2c.register();
  wifi.register();
  temperature.register();
  installEsp8266RandomGuards();
}

export function hardwareToolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  setActiveHardwareBoard(boardId);
  return [
    hardwareSectionLabel(profile ? `${profile.displayName} · 设备程序` : "请先在工程中选择硬件板卡"),
    ...gpio.toolboxContents(boardId),
    ...pwm.toolboxContents(boardId),
    ...analog.toolboxContents(boardId),
    ...neopixel.toolboxContents(boardId),
    ...dht.toolboxContents(boardId),
    ...ultrasonic.toolboxContents(boardId),
    ...oled.toolboxContents(boardId),
    ...uart.toolboxContents(boardId),
    ...i2c.toolboxContents(boardId),
    ...wifi.toolboxContents(boardId),
    ...temperature.toolboxContents(boardId),
    ...flow.toolboxContents(),
    ...math.toolboxContents(),
  ];
}

export function collectHardwareBlockIssues(workspace: Blockly.Workspace, boardId?: HardwareBoardId): HardwareBlockIssue[] {
  const profile = getBoardProfile(boardId);
  const issues = new Map<string, HardwareBlockIssue>();
  const record = (key: string, issue: HardwareBlockIssue) => {
    if (!issues.has(key)) issues.set(key, issue);
  };
  for (const block of workspace.getAllBlocks(false)) {
    if (profile?.boardId === "esp8266-esp12e") {
      const randomIssue = esp8266RandomBlockIssue(block.type);
      if (randomIssue) record(`esp8266-random-${block.id}`, { blockId: block.id, message: randomIssue });
    }
    const label = hardwareBlockLabels[block.type];
    if (!label) continue;
    if (!profile) {
      record(`board-${block.id}`, { blockId: block.id, message: "硬件积木需要先在工程中选择硬件板卡" });
      continue;
    }
    const use = pinUseByBlockType[block.type];
    if (use) {
      const pinId = String(block.getFieldValue("PIN") ?? "");
      const problem = validateBoardPin(profile, use, pinId);
      if (problem) record(`pin-${block.id}`, { blockId: block.id, message: `「${label}」积木：${problem}` });
      if (!problem && block.type === "hardware_pin_read") {
        const pull = String(block.getFieldValue("PULL") ?? "none") as "none" | "up" | "down";
        const pullProblem = validateDigitalInputPull(profile, pinId, pull);
        if (pullProblem) record(`pull-${block.id}`, { blockId: block.id, message: `「${label}」积木：${pullProblem}` });
      }
      if (!problem && block.type === "hardware_tone") {
        const frequencyProblem = validateToneFrequency(profile, numericInputValue(block, "FREQ"));
        if (frequencyProblem) record(`tone-frequency-${block.id}`, { blockId: block.id, message: `「${label}」积木：${frequencyProblem}` });
      }
    }
    for (const { fieldName, use: fieldUse } of pinUsesForBlock(block).filter(({ fieldName }) => fieldName !== "PIN")) {
      const pinId = String(block.getFieldValue(fieldName) ?? "");
      const problem = validateBoardPin(profile, fieldUse, pinId);
      if (problem) record(`pin-${block.id}-${fieldName}`, { blockId: block.id, message: `「${label}」积木：${fieldName} ${problem}` });
    }
    if (block.type === "hardware_map_range") {
      const fromLow = numericInputValue(block, "FROM_LOW");
      const fromHigh = numericInputValue(block, "FROM_HIGH");
      if (fromLow !== undefined && fromHigh !== undefined && fromLow === fromHigh) {
        record(`map-range-${block.id}`, { blockId: block.id, message: `「${label}」积木：原范围的上下限不能相等（会除以零）` });
      }
    }
    if (block.type === "hardware_builtin_led" && !builtinLedPin(profile)) {
      record(`led-${block.id}`, { blockId: block.id, message: `「${label}」积木：${profile.displayName} 没有板载 LED` });
    }
    if (block.type === "hardware_onboard_rgb" && !profile.builtinRgb) {
      record(`rgb-${block.id}`, { blockId: block.id, message: `「${label}」积木：${profile.displayName} 没有板载 RGB 灯` });
    }
    if (block.type.startsWith("hardware_uart_") && !profile.uartIds?.length) {
      record(`uart-${block.id}`, { blockId: block.id, message: `「${label}」积木：${profile.displayName} 没有可用的串口` });
    }
    if (block.type === "hardware_uart_init" && profile.uartIds?.length) {
      const uartId = Number(block.getFieldValue("UART"));
      if (!profile.uartIds.includes(uartId)) {
        record(`uart-id-${block.id}`, { blockId: block.id, message: `「${label}」积木：${profile.displayName} 上没有串口 ${uartId}` });
      }
      const tx = String(block.getFieldValue("TX") ?? "");
      const rx = String(block.getFieldValue("RX") ?? "");
      if (tx && tx === rx) {
        record(`uart-pins-${block.id}`, { blockId: block.id, message: `「${label}」积木：发送和接收不能使用同一个引脚` });
      }
    }
    if (block.type === "hardware_i2c_init") {
      const sda = String(block.getFieldValue("SDA") ?? "");
      const scl = String(block.getFieldValue("SCL") ?? "");
      if (sda && sda === scl) {
        record(`i2c-pins-${block.id}`, { blockId: block.id, message: `「${label}」积木：SDA 和 SCL 不能使用同一个引脚` });
      }
    }
    if (block.type === "hardware_i2c_write_register" || block.type === "hardware_i2c_read_register") {
      const address = numericInputValue(block, "ADDRESS");
      if (address !== undefined && (!Number.isInteger(address) || address < 0x08 || address > 0x77)) {
        record(`i2c-address-${block.id}`, { blockId: block.id, message: `「${label}」积木：I2C 地址必须是 0x08–0x77 之间的整数` });
      }
      const register = numericInputValue(block, "REGISTER");
      if (register !== undefined && (!Number.isInteger(register) || register < 0 || register > 0xFF)) {
        record(`i2c-register-${block.id}`, { blockId: block.id, message: `「${label}」积木：寄存器地址必须是 0–255 之间的整数` });
      }
      if (block.type === "hardware_i2c_write_register") {
        const data = numericInputValue(block, "DATA");
        if (data !== undefined && (!Number.isInteger(data) || data < 0 || data > 0xFF)) {
          record(`i2c-data-${block.id}`, { blockId: block.id, message: `「${label}」积木：写入数据必须是 0–255 之间的整数` });
        }
      }
    }
    if (block.type === "hardware_wifi_connect") {
      const ssid = block.getInputTargetBlock("SSID");
      if (ssid?.type === "text" && !String(ssid.getFieldValue("TEXT") ?? "").trim()) {
        record(`wifi-ssid-${block.id}`, { blockId: block.id, message: `「${label}」积木：Wi-Fi 名称不能为空` });
      }
    }
    if (block.type === "hardware_wifi_wait") {
      const seconds = numericInputValue(block, "SECONDS");
      if (seconds !== undefined && (!Number.isInteger(seconds) || seconds <= 0)) {
        record(`wifi-wait-${block.id}`, { blockId: block.id, message: `「${label}」积木：等待时间必须是大于 0 的整数秒` });
      }
    }
    if (block.type === "hardware_mcu_temperature" && !profile.mcuTemperature) {
      record(`mcu-temperature-${block.id}`, { blockId: block.id, message: `「${label}」积木：${profile.displayName} 不支持读取芯片温度` });
    }
  }
  return [...issues.values()];
}
