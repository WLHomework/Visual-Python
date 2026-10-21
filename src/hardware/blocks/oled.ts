import * as Blockly from "blockly/core";
import { getActiveHardwareBoard, defineHardwareBlocks, ensureImport, hardwareColours, hardwareGenerator, hardwareSectionLabel, numberShadow, pythonOrder, unavailable } from "./shared";
import { getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";

const definitions = [
  {
    type: "hardware_oled_init",
    message0: "初始化 OLED 宽 %1 高 %2 地址 %3",
    args0: [
      { type: "input_value", name: "WIDTH", check: "Number" },
      { type: "input_value", name: "HEIGHT", check: "Number" },
      { type: "field_dropdown", name: "ADDRESS", options: [["0x3C", "0x3C"], ["0x3D", "0x3D"]] },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.display,
    tooltip: "使用当前板卡的默认 I2C 引脚初始化 SSD1306 OLED。常见地址为 0x3C；请先运行此积木。",
  },
  {
    type: "hardware_oled_clear",
    message0: "清空 OLED 画面",
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.display,
    tooltip: "清空内存中的 OLED 画面，运行刷新积木后才会显示。",
  },
  {
    type: "hardware_oled_text",
    message0: "OLED 显示文字 %1 坐标 X %2 Y %3",
    args0: [
      { type: "input_value", name: "TEXT" },
      { type: "input_value", name: "X", check: "Number" },
      { type: "input_value", name: "Y", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.display,
    tooltip: "在 OLED 缓冲区写入一行文字，坐标单位为像素；请先初始化 OLED。",
  },
  {
    type: "hardware_oled_pixel",
    message0: "OLED 像素 X %1 Y %2 %3",
    args0: [
      { type: "input_value", name: "X", check: "Number" },
      { type: "input_value", name: "Y", check: "Number" },
      { type: "field_dropdown", name: "STATE", options: [["点亮", "on"], ["熄灭", "off"]] },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.display,
    tooltip: "设置 OLED 缓冲区中的单个像素，运行刷新积木后才会显示。",
  },
  {
    type: "hardware_oled_write",
    message0: "刷新 OLED 显示",
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.display,
    tooltip: "将 OLED 缓冲区内容写入屏幕。",
  },
];

function i2cExpression(boardId: string): string {
  const profile = getBoardProfile(boardId as HardwareBoardId);
  if (!profile) return "";
  const { sda, scl } = profile.defaultI2c;
  if (profile.chipFamily === "esp8266") return `machine.I2C(scl=machine.Pin(${scl}), sda=machine.Pin(${sda}), freq=100000)`;
  return `machine.I2C(0, scl=machine.Pin(${scl}), sda=machine.Pin(${sda}), freq=400000)`;
}

export function register(): void {
  defineHardwareBlocks(definitions);
  hardwareGenerator.forBlock.hardware_oled_init = (block, generator) => {
    const profile = getActiveHardwareBoard();
    if (!profile) return unavailable("请先选择硬件板卡");
    ensureImport("machine");
    ensureImport("ssd1306");
    const width = generator.valueToCode(block, "WIDTH", pythonOrder.NONE) || "128";
    const height = generator.valueToCode(block, "HEIGHT", pythonOrder.NONE) || "64";
    const address = String(block.getFieldValue("ADDRESS") || "0x3C");
    return [
      `_oled_i2c = ${i2cExpression(profile.boardId)}\n`,
      `_oled = ssd1306.SSD1306_I2C(int(${width}), int(${height}), _oled_i2c, addr=${address})\n`,
    ].join("");
  };
  hardwareGenerator.forBlock.hardware_oled_clear = () => "_oled.fill(0)\n";
  hardwareGenerator.forBlock.hardware_oled_text = (block, generator) => {
    const text = generator.valueToCode(block, "TEXT", pythonOrder.NONE) || '""';
    const x = generator.valueToCode(block, "X", pythonOrder.NONE) || "0";
    const y = generator.valueToCode(block, "Y", pythonOrder.NONE) || "0";
    return `_oled.text(str(${text}), int(${x}), int(${y}), 1)\n`;
  };
  hardwareGenerator.forBlock.hardware_oled_pixel = (block, generator) => {
    const x = generator.valueToCode(block, "X", pythonOrder.NONE) || "0";
    const y = generator.valueToCode(block, "Y", pythonOrder.NONE) || "0";
    const state = block.getFieldValue("STATE") === "off" ? 0 : 1;
    return `_oled.pixel(int(${x}), int(${y}), ${state})\n`;
  };
  hardwareGenerator.forBlock.hardware_oled_write = () => "_oled.show()\n";
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  void boardId;
  return [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("OLED 显示"),
    { kind: "block", type: "hardware_oled_init", fields: { ADDRESS: "0x3C" }, inputs: { WIDTH: numberShadow(128), HEIGHT: numberShadow(64) } },
    { kind: "block", type: "hardware_oled_clear" },
    { kind: "block", type: "hardware_oled_text", inputs: { TEXT: { shadow: { type: "text", fields: { TEXT: "Hello" } } }, X: numberShadow(0), Y: numberShadow(0) } },
    { kind: "block", type: "hardware_oled_pixel", fields: { STATE: "on" }, inputs: { X: numberShadow(0), Y: numberShadow(0) } },
    { kind: "block", type: "hardware_oled_write" },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
