import * as Blockly from "blockly/core";
import { builtinLedPin, getBoardProfile, validateBoardPin, validateDigitalInputPull, validateToneFrequency } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import * as analog from "./analog";
import * as ble from "./ble";
import * as dht from "./dht";
import * as espnow from "./espnow";
import * as flow from "./flow";
import * as gpio from "./gpio";
import * as http from "./http";
import * as i2c from "./i2c";
import * as math from "./math";
import * as mqtt from "./mqtt";
import * as neopixel from "./neopixel";
import * as oled from "./oled";
import * as pwm from "./pwm";
import { esp8266RandomBlockIssue, installEsp8266RandomGuards } from "./randomCompat";
import * as storage from "./storage";
import * as temperature from "./temperature";
import * as uart from "./uart";
import * as ultrasonic from "./ultrasonic";
import * as wifi from "./wifi";
import {
  advancedWirelessBlockTypes,
  deviceStorageBlockTypes,
  hardwareBlockLabels,
  hardwareSectionLabel,
  pinUseByBlockType,
  pinUsesForBlock,
  registerHardwareBoardPinExtension,
  setActiveHardwareBoard,
  numericInputValue,
  textInputValue,
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

const macLiteralPattern = /^[0-9a-fA-F]{2}([:-][0-9a-fA-F]{2}){5}$/;
const nvsKeyPattern = /^[A-Za-z0-9_]{1,15}$/;

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
  http.register();
  ble.register();
  espnow.register();
  mqtt.register();
  storage.register();
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
    ...http.toolboxContents(boardId),
    ...ble.toolboxContents(boardId),
    ...espnow.toolboxContents(boardId),
    ...mqtt.toolboxContents(boardId),
    ...storage.toolboxContents(boardId),
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
    if (advancedWirelessBlockTypes.includes(block.type) && !profile.advancedWireless) {
      record(`advanced-${block.id}`, {
        blockId: block.id,
        message: `「${label}」积木：${profile.displayName} 不支持该联网/无线积木（仅 ESP32-S3）`,
      });
      continue;
    }
    if (deviceStorageBlockTypes.includes(block.type) && !profile.deviceStorage) {
      record(`storage-${block.id}`, {
        blockId: block.id,
        message: `「${label}」积木：${profile.displayName} 不支持设备存储积木（仅 ESP32-S3）`,
      });
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
    if (block.type === "hardware_http_get") {
      const url = textInputValue(block, "URL");
      if (url !== undefined && !url.trim()) {
        record(`http-url-${block.id}`, { blockId: block.id, message: `「${label}」积木：网址不能为空` });
      } else if (url !== undefined && !/^https?:\/\//i.test(url.trim())) {
        record(`http-url-scheme-${block.id}`, { blockId: block.id, message: `「${label}」积木：网址必须以 http:// 或 https:// 开头` });
      }
    }
    if (block.type === "hardware_ble_start") {
      const name = textInputValue(block, "NAME");
      if (name !== undefined && !name.trim()) {
        record(`ble-name-${block.id}`, { blockId: block.id, message: `「${label}」积木：广播名称不能为空` });
      }
    }
    if (block.type === "hardware_espnow_send") {
      const mac = textInputValue(block, "MAC");
      if (mac !== undefined && !macLiteralPattern.test(mac.trim())) {
        record(`espnow-mac-${block.id}`, {
          blockId: block.id,
          message: `「${label}」积木：MAC 地址应写成 6 组十六进制，例如 aa:bb:cc:dd:ee:ff`,
        });
      }
    }
    if (block.type === "hardware_espnow_receive") {
      const timeout = numericInputValue(block, "TIMEOUT");
      if (timeout !== undefined && (!Number.isInteger(timeout) || timeout < 0)) {
        record(`espnow-timeout-${block.id}`, { blockId: block.id, message: `「${label}」积木：等待时间必须是大于等于 0 的整数毫秒` });
      }
    }
    if (block.type === "hardware_mqtt_connect") {
      const server = textInputValue(block, "SERVER");
      const clientId = textInputValue(block, "CLIENT_ID");
      const port = numericInputValue(block, "PORT");
      if (server !== undefined && !server.trim()) {
        record(`mqtt-server-${block.id}`, { blockId: block.id, message: `「${label}」积木：服务器地址不能为空` });
      }
      if (clientId !== undefined && !clientId.trim()) {
        record(`mqtt-client-${block.id}`, { blockId: block.id, message: `「${label}」积木：客户端 ID 不能为空` });
      }
      if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
        record(`mqtt-port-${block.id}`, { blockId: block.id, message: `「${label}」积木：端口必须是 1–65535 之间的整数` });
      }
    }
    if (block.type === "hardware_mqtt_publish" || block.type === "hardware_mqtt_subscribe") {
      const topic = textInputValue(block, "TOPIC");
      if (topic !== undefined && !topic.trim()) {
        record(`mqtt-topic-${block.id}`, { blockId: block.id, message: `「${label}」积木：主题不能为空` });
      }
    }
    if (block.type === "hardware_mqtt_wait") {
      const timeout = numericInputValue(block, "TIMEOUT");
      if (timeout !== undefined && (!Number.isInteger(timeout) || timeout < 0)) {
        record(`mqtt-timeout-${block.id}`, { blockId: block.id, message: `「${label}」积木：等待时间必须是大于等于 0 的整数毫秒` });
      }
    }
    if (block.type === "hardware_file_write" || block.type === "hardware_file_read") {
      const path = textInputValue(block, "PATH");
      if (path !== undefined && !path.trim()) {
        record(`file-path-${block.id}`, { blockId: block.id, message: `「${label}」积木：文件路径不能为空` });
      } else if (block.type === "hardware_file_write" && path !== undefined && /(^|\/)main\.py$/i.test(path.replace(/\\/g, "/"))) {
        record(`file-main-${block.id}`, { blockId: block.id, message: `「${label}」积木：不要写入 /main.py，它会覆盖正在运行的程序` });
      }
    }
    if (block.type === "hardware_nvs_set" || block.type === "hardware_nvs_get") {
      const key = textInputValue(block, "KEY");
      if (key !== undefined && !nvsKeyPattern.test(key)) {
        record(`nvs-key-${block.id}`, {
          blockId: block.id,
          message: `「${label}」积木：NVS 键必须是 1–15 个 ASCII 字母、数字或下划线`,
        });
      }
      if (block.type === "hardware_nvs_set") {
        const value = textInputValue(block, "VALUE");
        if (value !== undefined && new TextEncoder().encode(value).length > 1024) {
          record(`nvs-value-${block.id}`, { blockId: block.id, message: `「${label}」积木：NVS 文本值不能超过约 1 KB` });
        }
      }
    }
    if (block.type === "hardware_mcu_temperature" && !profile.mcuTemperature) {
      record(`mcu-temperature-${block.id}`, { blockId: block.id, message: `「${label}」积木：${profile.displayName} 不支持读取芯片温度` });
    }
  }
  return [...issues.values()];
}
