import * as Blockly from "blockly/core";
import { analogReadMax, builtinLedPin, getBoardProfile, validateBoardPin, validateDigitalInputPull, validateToneFrequency } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import * as actuators from "./actuators";
import * as analog from "./analog";
import * as ble from "./ble";
import * as dht from "./dht";
import * as espnow from "./espnow";
import * as flow from "./flow";
import * as gpio from "./gpio";
import * as http from "./http";
import * as i2c from "./i2c";
import * as infrared from "./infrared";
import * as lcd1602 from "./lcd1602";
import * as math from "./math";
import * as mqtt from "./mqtt";
import * as neopixel from "./neopixel";
import * as oled from "./oled";
import { hardwarePackToolboxContents, registerHardwarePacks, type HardwareBlockPack } from "./pack";
import * as pwm from "./pwm";
import { esp8266RandomBlockIssue, installEsp8266RandomGuards } from "./randomCompat";
import * as rfid from "./rfid";
import * as rtc from "./rtc";
import * as sensorsAnalog from "./sensorsAnalog";
import * as sensorsDigital from "./sensorsDigital";
import * as sensorsI2c from "./sensorsI2c";
import * as sensorsOneWire from "./sensorsOneWire";
import * as spi from "./spi";
import * as stepper from "./stepper";
import * as storage from "./storage";
import * as temperature from "./temperature";
import * as timer from "./timer";
import * as tm1637 from "./tm1637";
import * as uart from "./uart";
import * as ultrasonic from "./ultrasonic";
import * as webserver from "./webserver";
import * as wifi from "./wifi";
import {
  advancedWirelessBlockTypes,
  deviceStorageBlockTypes,
  hardwareBlockLabels,
  hardwareSectionLabel,
  p0ModuleBlockTypes,
  p1ModuleBlockTypes,
  p2ModuleBlockTypes,
  pinUseByBlockType,
  pinUsesForBlock,
  registerHardwareBoardPinExtension,
  setActiveHardwareBoard,
  spiBlockTypes,
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

/**
 * 工具箱顺序只在下面这个数组里维护；注册和内容组装都按同一顺序走。
 * 新增积木包时直接加一行，避免注册了积木却忘记加进工具箱。
 */
export const hardwareBlockPacks: readonly HardwareBlockPack[] = [
  gpio,
  pwm,
  analog,
  sensorsAnalog,
  sensorsDigital,
  sensorsI2c,
  sensorsOneWire,
  rtc,
  infrared,
  rfid,
  actuators,
  stepper,
  neopixel,
  dht,
  ultrasonic,
  oled,
  tm1637,
  lcd1602,
  uart,
  i2c,
  spi,
  wifi,
  http,
  ble,
  espnow,
  mqtt,
  webserver,
  storage,
  temperature,
  timer,
  flow,
  math,
];

let hardwareBlocksRegistered = false;

export function registerHardwareBlocks(): void {
  if (hardwareBlocksRegistered) return;
  hardwareBlocksRegistered = true;

  registerHardwareBoardPinExtension();
  registerHardwarePacks(hardwareBlockPacks);
  installEsp8266RandomGuards();
}

export function hardwareToolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  setActiveHardwareBoard(boardId);
  return [
    hardwareSectionLabel(profile ? `${profile.displayName} · 设备程序` : "请先在工程中选择硬件板卡"),
    ...hardwarePackToolboxContents(hardwareBlockPacks, boardId),
  ];
}

export function collectHardwareBlockIssues(workspace: Blockly.Workspace, boardId?: HardwareBoardId): HardwareBlockIssue[] {
  const profile = getBoardProfile(boardId);
  const issues = new Map<string, HardwareBlockIssue>();
  const timerBlocks = workspace.getAllBlocks(false).filter((block) => block.type === "hardware_timer_every");
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
    if (spiBlockTypes.includes(block.type) && !profile.spiIds?.length) {
      record(`spi-${block.id}`, {
        blockId: block.id,
        message: `「${label}」积木：${profile.displayName} 不支持 SPI 积木（仅 ESP32-S3）`,
      });
      continue;
    }
    if (p0ModuleBlockTypes.includes(block.type) && !profile.p0Modules) {
      record(`p0-${block.id}`, {
        blockId: block.id,
        message: `「${label}」积木：${profile.displayName} 暂未开放该模块积木（仅 ESP32-S3，待 S3 真机验证后评估下放）`,
      });
      continue;
    }
    if (p1ModuleBlockTypes.includes(block.type) && !profile.p1Modules) {
      record(`p1-${block.id}`, {
        blockId: block.id,
        message: `「${label}」积木：${profile.displayName} 暂未开放该模块积木（仅 ESP32-S3，待 S3 真机验证后评估下放）`,
      });
      continue;
    }
    if (p2ModuleBlockTypes.includes(block.type) && !profile.p2Modules) {
      record(`p2-${block.id}`, {
        blockId: block.id,
        message: `「${label}」积木：${profile.displayName} 暂未开放该模块积木（仅 ESP32-S3，待 S3 真机验证后评估下放）`,
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
    if (block.type === "hardware_button_read") {
      const debounce = numericInputValue(block, "DEBOUNCE");
      if (debounce !== undefined && (!Number.isInteger(debounce) || debounce < 0 || debounce > 1000)) {
        record(`button-debounce-${block.id}`, { blockId: block.id, message: `「${label}」积木：消抖时间必须是 0–1000 之间的整数毫秒` });
      }
      const activeLow = block.getFieldValue("ACTIVE") !== "high";
      const pinId = String(block.getFieldValue("PIN") ?? "");
      if (!validateBoardPin(profile, "digital-input", pinId)) {
        const pullProblem = validateDigitalInputPull(profile, pinId, activeLow ? "up" : "down");
        if (pullProblem) record(`button-pull-${block.id}`, { blockId: block.id, message: `「${label}」积木：${pullProblem}` });
      }
    }
    if (block.type === "hardware_pir_motion") {
      const hold = numericInputValue(block, "HOLD");
      if (hold !== undefined && (!Number.isInteger(hold) || hold < 0 || hold > 3600)) {
        record(`pir-hold-${block.id}`, { blockId: block.id, message: `「${label}」积木：保持时间必须是 0–3600 之间的整数秒` });
      }
    }
    if (block.type === "hardware_light_percent" || block.type === "hardware_soil_percent") {
      const max = analogReadMax(profile);
      const fields = block.type === "hardware_light_percent" ? ["DARK", "BRIGHT"] : ["DRY", "WET"];
      const labels = block.type === "hardware_light_percent" ? ["暗值", "亮值"] : ["干值", "湿值"];
      const values = fields.map((field) => numericInputValue(block, field));
      for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > max)) {
          record(`calibration-${block.id}-${fields[index]}`, {
            blockId: block.id,
            message: `「${label}」积木：${labels[index]}必须是 0–${max} 之间的读数`,
          });
        }
      }
      if (values[0] !== undefined && values[1] !== undefined && values[0] === values[1]) {
        record(`calibration-equal-${block.id}`, { blockId: block.id, message: `「${label}」积木：两个校准值不能相等（会无法换算百分比）` });
      }
    }
    if (block.type === "hardware_dc_motor") {
      const speed = numericInputValue(block, "SPEED");
      if (speed !== undefined && (!Number.isFinite(speed) || speed < -100 || speed > 100)) {
        record(`motor-speed-${block.id}`, { blockId: block.id, message: `「${label}」积木：速度必须在 -100 到 100 之间` });
      }
      const in1 = String(block.getFieldValue("IN1") ?? "");
      const in2 = String(block.getFieldValue("IN2") ?? "");
      const pwmPin = String(block.getFieldValue("PWM") ?? "");
      if (in1 && in2 && pwmPin && (in1 === in2 || in1 === pwmPin || in2 === pwmPin)) {
        record(`motor-pins-${block.id}`, { blockId: block.id, message: `「${label}」积木：IN1、IN2 和 PWM 必须使用不同引脚` });
      }
    }
    if (block.type === "hardware_lcd1602_init") {
      const cols = numericInputValue(block, "COLS");
      if (cols !== undefined && (!Number.isInteger(cols) || cols < 1 || cols > 20)) {
        record(`lcd-cols-${block.id}`, { blockId: block.id, message: `「${label}」积木：列数必须是 1–20 之间的整数` });
      }
      const rows = numericInputValue(block, "ROWS");
      if (rows !== undefined && (!Number.isInteger(rows) || rows < 1 || rows > 4)) {
        record(`lcd-rows-${block.id}`, { blockId: block.id, message: `「${label}」积木：行数必须是 1–4 之间的整数` });
      }
    }
    if (block.type === "hardware_lcd1602_text") {
      const row = numericInputValue(block, "ROW");
      if (row !== undefined && (!Number.isInteger(row) || row < 1 || row > 4)) {
        record(`lcd-row-${block.id}`, { blockId: block.id, message: `「${label}」积木：行号必须是 1–4 之间的整数` });
      }
      const col = numericInputValue(block, "COL");
      if (col !== undefined && (!Number.isInteger(col) || col < 1 || col > 20)) {
        record(`lcd-col-${block.id}`, { blockId: block.id, message: `「${label}」积木：列号必须是 1–20 之间的整数` });
      }
      const text = textInputValue(block, "TEXT");
      if (text !== undefined && !/^[\x20-\x7E]*$/.test(text)) {
        record(`lcd-text-${block.id}`, {
          blockId: block.id,
          message: `「${label}」积木：LCD1602 默认字库只能显示英文字母、数字和常用符号`,
        });
      }
    }
    if (block.type === "hardware_ds18b20_temperature") {
      const index = numericInputValue(block, "INDEX");
      if (index !== undefined && (!Number.isInteger(index) || index < 1 || index > 8)) {
        record(`ds18b20-index-${block.id}`, { blockId: block.id, message: `「${label}」积木：传感器序号必须是 1–8 之间的整数` });
      }
    }
    if (block.type === "hardware_tm1637_init") {
      const clk = String(block.getFieldValue("CLK") ?? "");
      const dio = String(block.getFieldValue("DIO") ?? "");
      if (clk && dio && clk === dio) {
        record(`tm1637-pins-${block.id}`, { blockId: block.id, message: `「${label}」积木：CLK 和 DIO 必须使用不同引脚` });
      }
    }
    if (block.type === "hardware_tm1637_number") {
      const decimals = numericInputValue(block, "DECIMALS");
      if (decimals !== undefined && (!Number.isInteger(decimals) || decimals < 0 || decimals > 3)) {
        record(`tm1637-decimals-${block.id}`, { blockId: block.id, message: `「${label}」积木：小数位必须是 0–3 之间的整数` });
      }
    }
    if (block.type === "hardware_stepper_move") {
      const pins = ["IN1", "IN2", "IN3", "IN4"].map((field) => String(block.getFieldValue(field) ?? ""));
      if (pins.every(Boolean) && new Set(pins).size < 4) {
        record(`stepper-pins-${block.id}`, { blockId: block.id, message: `「${label}」积木：IN1–IN4 必须使用 4 个不同引脚` });
      }
      const steps = numericInputValue(block, "STEPS");
      if (steps !== undefined && (!Number.isInteger(steps) || steps < -100000 || steps > 100000)) {
        record(`stepper-steps-${block.id}`, { blockId: block.id, message: `「${label}」积木：步数必须是 -100000 到 100000 之间的整数` });
      }
      const interval = numericInputValue(block, "INTERVAL");
      if (interval !== undefined && (!Number.isInteger(interval) || interval < 1 || interval > 1000)) {
        record(`stepper-interval-${block.id}`, { blockId: block.id, message: `「${label}」积木：间隔必须是 1–1000 之间的整数毫秒` });
      }
    }
    if (block.type === "hardware_ds3231_set") {
      const ranges: Array<[string, number, number, string]> = [
        ["YEAR", 2000, 2099, "年份必须是 2000–2099 之间的整数"],
        ["MONTH", 1, 12, "月份必须是 1–12 之间的整数"],
        ["DAY", 1, 31, "日期必须是 1–31 之间的整数"],
        ["HOUR", 0, 23, "小时必须是 0–23 之间的整数"],
        ["MINUTE", 0, 59, "分钟必须是 0–59 之间的整数"],
        ["SECOND", 0, 59, "秒必须是 0–59 之间的整数"],
      ];
      for (const [field, min, max, message] of ranges) {
        const value = numericInputValue(block, field);
        if (value !== undefined && (!Number.isInteger(value) || value < min || value > max)) {
          record(`ds3231-${field}-${block.id}`, { blockId: block.id, message: `「${label}」积木：${message}` });
        }
      }
    }
    if (block.type === "hardware_oled_progress") {
      const percent = numericInputValue(block, "PERCENT");
      if (percent !== undefined && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
        record(`oled-progress-${block.id}`, { blockId: block.id, message: `「${label}」积木：百分比必须是 0–100 之间的数` });
      }
    }
    if (block.type === "hardware_ir_receive") {
      const timeout = numericInputValue(block, "TIMEOUT");
      if (timeout !== undefined && (!Number.isInteger(timeout) || timeout < 0 || timeout > 60000)) {
        record(`ir-timeout-${block.id}`, { blockId: block.id, message: `「${label}」积木：超时必须是 0–60000 之间的整数毫秒` });
      }
    }
    if (block.type === "hardware_rc522_uid") {
      const spiId = Number(block.getFieldValue("SPI"));
      if (profile.spiIds?.length && !profile.spiIds.includes(spiId)) {
        record(`rc522-spi-${block.id}`, { blockId: block.id, message: `「${label}」积木：${profile.displayName} 上没有 SPI ${spiId}` });
      }
      const pins = ["SCK", "MOSI", "MISO", "CS", "RST"].map((field) => String(block.getFieldValue(field) ?? ""));
      if (pins.every(Boolean) && new Set(pins).size < 5) {
        record(`rc522-pins-${block.id}`, { blockId: block.id, message: `「${label}」积木：SCK、MOSI、MISO、CS、RST 必须使用不同引脚` });
      }
    }
    if (block.type === "hardware_sd_card" && block.getFieldValue("ACTION") !== "unmount") {
      const pins = ["SCK", "MOSI", "MISO", "CS"].map((field) => String(block.getFieldValue(field) ?? ""));
      if (pins.every(Boolean) && new Set(pins).size < 4) {
        record(`sd-pins-${block.id}`, { blockId: block.id, message: `「${label}」积木：SCK、MOSI、MISO、CS 必须使用不同引脚` });
      }
    }
    if (block.type === "hardware_webserver_serve") {
      const port = numericInputValue(block, "PORT");
      if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
        record(`webserver-port-${block.id}`, { blockId: block.id, message: `「${label}」积木：端口必须是 1–65535 之间的整数` });
      }
    }
    if (block.type === "hardware_timer_every") {
      const period = numericInputValue(block, "PERIOD");
      if (period !== undefined && (!Number.isInteger(period) || period < 1 || period > 3600000)) {
        record(`timer-period-${block.id}`, { blockId: block.id, message: `「${label}」积木：周期必须是 1–3600000 之间的整数毫秒` });
      }
      if (timerBlocks.length > 4) {
        record(`timer-count-${block.id}`, { blockId: block.id, message: `「${label}」积木：最多同时使用 4 个定时器（当前 ${timerBlocks.length} 个）` });
      }
    }
    if (block.type === "hardware_ble_gatt_start") {
      const name = textInputValue(block, "NAME");
      if (name !== undefined && new TextEncoder().encode(name).length > 20) {
        record(`gatt-name-${block.id}`, { blockId: block.id, message: `「${label}」积木：设备名不能超过 20 字节` });
      }
      for (const field of ["SERVICE", "CHARACTERISTIC"]) {
        const uuid = textInputValue(block, field);
        if (uuid !== undefined && !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid.trim())) {
          record(`gatt-uuid-${field}-${block.id}`, { blockId: block.id, message: `「${label}」积木：${field === "SERVICE" ? "服务" : "特征"} UUID 格式无效` });
        }
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
    if (block.type === "hardware_wifi_ap_start") {
      const ssid = textInputValue(block, "SSID");
      const password = textInputValue(block, "PASSWORD");
      const channel = numericInputValue(block, "CHANNEL");
      if (ssid !== undefined && !ssid.trim()) {
        record(`wifi-ap-ssid-${block.id}`, { blockId: block.id, message: `「${label}」积木：热点名称不能为空` });
      } else if (ssid !== undefined && new TextEncoder().encode(ssid).length > 32) {
        record(`wifi-ap-ssid-length-${block.id}`, { blockId: block.id, message: `「${label}」积木：热点名称不能超过 32 字节` });
      }
      if (password !== undefined && !/^[\x20-\x7E]{8,63}$/.test(password)) {
        record(`wifi-ap-password-${block.id}`, {
          blockId: block.id,
          message: `「${label}」积木：热点密码必须是 8–63 个 ASCII 字符`,
        });
      }
      if (channel !== undefined && (!Number.isInteger(channel) || channel < 1 || channel > 13)) {
        record(`wifi-ap-channel-${block.id}`, { blockId: block.id, message: `「${label}」积木：信道必须是 1–13 之间的整数` });
      }
    }
    if (block.type === "hardware_http_get" || block.type === "hardware_http_post" || block.type === "hardware_http_download") {
      const url = textInputValue(block, "URL");
      if (url !== undefined && !url.trim()) {
        record(`http-url-${block.id}`, { blockId: block.id, message: `「${label}」积木：网址不能为空` });
      } else if (url !== undefined && !/^https?:\/\//i.test(url.trim())) {
        record(`http-url-scheme-${block.id}`, { blockId: block.id, message: `「${label}」积木：网址必须以 http:// 或 https:// 开头` });
      }
    }
    if (block.type === "hardware_http_download") {
      const path = textInputValue(block, "PATH");
      const normalized = path?.replace(/\\/g, "/");
      if (path !== undefined && !path.trim()) {
        record(`http-path-${block.id}`, { blockId: block.id, message: `「${label}」积木：保存路径不能为空` });
      } else if (normalized !== undefined && /(^|\/)main\.py$/i.test(normalized)) {
        record(`http-path-main-${block.id}`, { blockId: block.id, message: `「${label}」积木：不要覆盖 /main.py，它会替换正在运行的程序` });
      }
    }
    if (block.type === "hardware_ntp_local") {
      const offset = numericInputValue(block, "OFFSET");
      if (offset !== undefined && (!Number.isFinite(offset) || offset < -12 || offset > 14)) {
        record(`ntp-offset-${block.id}`, { blockId: block.id, message: `「${label}」积木：时区偏移必须在 -12 到 14 小时之间` });
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
    if (
      block.type === "hardware_file_write" ||
      block.type === "hardware_file_append" ||
      block.type === "hardware_file_read" ||
      block.type === "hardware_file_exists" ||
      block.type === "hardware_file_size" ||
      block.type === "hardware_file_delete" ||
      block.type === "hardware_file_list"
    ) {
      const path = textInputValue(block, "PATH");
      const normalized = path?.replace(/\\/g, "/");
      if (path !== undefined && !path.trim()) {
        record(`file-path-${block.id}`, { blockId: block.id, message: `「${label}」积木：文件路径不能为空` });
      } else if (normalized !== undefined && /(^|\/)main\.py$/i.test(normalized)) {
        if (block.type === "hardware_file_delete") {
          record(`file-main-${block.id}`, { blockId: block.id, message: `「${label}」积木：不要删除 /main.py，它可能正在运行` });
        } else if (block.type !== "hardware_file_read" && block.type !== "hardware_file_exists" && block.type !== "hardware_file_size" && block.type !== "hardware_file_list") {
          record(`file-main-${block.id}`, { blockId: block.id, message: `「${label}」积木：不要写入 /main.py，它会覆盖正在运行的程序` });
        }
      }
    }
    if (block.type === "hardware_nvs_set" || block.type === "hardware_nvs_get" || block.type === "hardware_nvs_delete") {
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
    if (block.type === "hardware_spi_init") {
      const spiId = Number(block.getFieldValue("SPI"));
      if (profile.spiIds?.length && !profile.spiIds.includes(spiId)) {
        record(`spi-id-${block.id}`, { blockId: block.id, message: `「${label}」积木：${profile.displayName} 上没有 SPI ${spiId}` });
      }
      const baud = numericInputValue(block, "BAUD");
      if (baud !== undefined && (!Number.isInteger(baud) || baud < 1000 || baud > 80000000)) {
        record(`spi-baud-${block.id}`, { blockId: block.id, message: `「${label}」积木：SPI 波特率必须是 1000–80000000 之间的整数` });
      }
      const sck = String(block.getFieldValue("SCK") ?? "");
      const mosi = String(block.getFieldValue("MOSI") ?? "");
      const miso = String(block.getFieldValue("MISO") ?? "");
      if (sck && mosi && miso && new Set([sck, mosi, miso]).size < 3) {
        record(`spi-pins-${block.id}`, { blockId: block.id, message: `「${label}」积木：SCK、MOSI 和 MISO 必须使用不同引脚` });
      }
    }
    if (block.type === "hardware_spi_transfer") {
      const value = numericInputValue(block, "VALUE");
      if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 0xFF)) {
        record(`spi-value-${block.id}`, { blockId: block.id, message: `「${label}」积木：SPI 发送字节必须是 0–255 之间的整数` });
      }
    }
    if (block.type === "hardware_mcu_temperature" && !profile.mcuTemperature) {
      record(`mcu-temperature-${block.id}`, { blockId: block.id, message: `「${label}」积木：${profile.displayName} 不支持读取芯片温度` });
    }
  }
  return [...issues.values()];
}
