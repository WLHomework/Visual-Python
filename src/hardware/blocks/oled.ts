import * as Blockly from "blockly/core";
import { getBoardProfile } from "../boardProfiles";
import {
  getActiveHardwareBoard,
  defineHardwareBlocks,
  ensureI2cBus,
  ensureImport,
  hardwareColours,
  hardwareFunctionPlaceholder,
  hardwareGenerator,
  hardwareSectionLabel,
  numberShadow,
  provideHardwareFunction,
  pythonOrder,
  unavailable,
} from "./shared";
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
    tooltip: "使用当前板卡的默认 I2C 引脚初始化 SSD1306 OLED。之前运行过「初始化 I2C」时会复用同一条总线；未运行时会自动创建。常见地址为 0x3C；请先运行此积木。",
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
  {
    type: "hardware_oled_line",
    message0: "OLED 画线 从 X %1 Y %2 到 X %3 Y %4 %5",
    args0: [
      { type: "input_value", name: "X1", check: "Number" },
      { type: "input_value", name: "Y1", check: "Number" },
      { type: "input_value", name: "X2", check: "Number" },
      { type: "input_value", name: "Y2", check: "Number" },
      { type: "field_dropdown", name: "STATE", options: [["点亮", "on"], ["熄灭", "off"]] },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.display,
    tooltip: "在 OLED 缓冲区画一条直线，坐标单位为像素；运行刷新积木后才会显示。",
  },
  {
    type: "hardware_oled_rect",
    message0: "OLED 画矩形 X %1 Y %2 宽 %3 高 %4 %5",
    args0: [
      { type: "input_value", name: "X", check: "Number" },
      { type: "input_value", name: "Y", check: "Number" },
      { type: "input_value", name: "WIDTH", check: "Number" },
      { type: "input_value", name: "HEIGHT", check: "Number" },
      { type: "field_dropdown", name: "FILL", options: [["空心", "outline"], ["填充", "fill"]] },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.display,
    tooltip: "在 OLED 缓冲区画矩形，坐标和宽高单位为像素；运行刷新积木后才会显示。宽或高为 0 时不会绘制。",
  },
  {
    type: "hardware_oled_progress",
    message0: "OLED 进度条 X %1 Y %2 宽 %3 高 %4 百分比 %5",
    args0: [
      { type: "input_value", name: "X", check: "Number" },
      { type: "input_value", name: "Y", check: "Number" },
      { type: "input_value", name: "WIDTH", check: "Number" },
      { type: "input_value", name: "HEIGHT", check: "Number" },
      { type: "input_value", name: "PERCENT", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.display,
    tooltip: "在 OLED 缓冲区绘制进度条：外框加按百分比填充的条。百分比会被限制在 0–100；运行刷新积木后才会显示。",
  },
];

export function register(): void {
  defineHardwareBlocks(definitions);
  hardwareGenerator.forBlock.hardware_oled_init = (block, generator) => {
    const profile = getActiveHardwareBoard();
    if (!profile) return unavailable("请先选择硬件板卡");
    ensureImport("ssd1306");
    const width = generator.valueToCode(block, "WIDTH", pythonOrder.NONE) || "128";
    const height = generator.valueToCode(block, "HEIGHT", pythonOrder.NONE) || "64";
    const address = String(block.getFieldValue("ADDRESS") || "0x3C");
    const bus = ensureI2cBus(profile);
    return [
      // 复用「初始化 I2C」建好的总线；没有初始化时由共享助手按板卡默认引脚创建。
      `_oled_i2c = ${bus}()\n`,
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
  hardwareGenerator.forBlock.hardware_oled_line = (block, generator) => {
    const x1 = generator.valueToCode(block, "X1", pythonOrder.NONE) || "0";
    const y1 = generator.valueToCode(block, "Y1", pythonOrder.NONE) || "0";
    const x2 = generator.valueToCode(block, "X2", pythonOrder.NONE) || "0";
    const y2 = generator.valueToCode(block, "Y2", pythonOrder.NONE) || "0";
    const state = block.getFieldValue("STATE") === "off" ? 0 : 1;
    return `_oled.line(int(${x1}), int(${y1}), int(${x2}), int(${y2}), ${state})\n`;
  };
  hardwareGenerator.forBlock.hardware_oled_rect = (block, generator) => {
    const x = generator.valueToCode(block, "X", pythonOrder.NONE) || "0";
    const y = generator.valueToCode(block, "Y", pythonOrder.NONE) || "0";
    const width = generator.valueToCode(block, "WIDTH", pythonOrder.NONE) || "0";
    const height = generator.valueToCode(block, "HEIGHT", pythonOrder.NONE) || "0";
    const fill = block.getFieldValue("FILL") === "fill";
    return `_oled.${fill ? "fill_rect" : "rect"}(int(${x}), int(${y}), int(${width}), int(${height}), 1)\n`;
  };
  hardwareGenerator.forBlock.hardware_oled_progress = (block, generator) => {
    const x = generator.valueToCode(block, "X", pythonOrder.NONE) || "0";
    const y = generator.valueToCode(block, "Y", pythonOrder.NONE) || "0";
    const width = generator.valueToCode(block, "WIDTH", pythonOrder.NONE) || "0";
    const height = generator.valueToCode(block, "HEIGHT", pythonOrder.NONE) || "0";
    const percent = generator.valueToCode(block, "PERCENT", pythonOrder.NONE) || "0";
    const helper = provideHardwareFunction("hardware_oled_progress", [
      `def ${hardwareFunctionPlaceholder()}(x, y, width, height, percent):`,
      "  if percent < 0:",
      "    percent = 0",
      "  if percent > 100:",
      "    percent = 100",
      "  _oled.rect(x, y, width, height, 1)",
      "  _oled.fill_rect(x, y, int(width * percent / 100), height, 1)",
    ]);
    return `${helper}(int(${x}), int(${y}), int(${width}), int(${height}), ${percent})\n`;
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  const contents: unknown[] = [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("OLED 显示"),
    { kind: "block", type: "hardware_oled_init", fields: { ADDRESS: "0x3C" }, inputs: { WIDTH: numberShadow(128), HEIGHT: numberShadow(64) } },
    { kind: "block", type: "hardware_oled_clear" },
    { kind: "block", type: "hardware_oled_text", inputs: { TEXT: { shadow: { type: "text", fields: { TEXT: "Hello" } } }, X: numberShadow(0), Y: numberShadow(0) } },
    { kind: "block", type: "hardware_oled_pixel", fields: { STATE: "on" }, inputs: { X: numberShadow(0), Y: numberShadow(0) } },
  ];
  if (profile?.p1Modules) {
    contents.push(
      { kind: "block", type: "hardware_oled_line", fields: { STATE: "on" }, inputs: { X1: numberShadow(0), Y1: numberShadow(0), X2: numberShadow(64), Y2: numberShadow(32) } },
      { kind: "block", type: "hardware_oled_rect", fields: { FILL: "outline" }, inputs: { X: numberShadow(0), Y: numberShadow(0), WIDTH: numberShadow(32), HEIGHT: numberShadow(16) } },
    );
  }
  if (profile?.p2Modules) {
    contents.push({
      kind: "block",
      type: "hardware_oled_progress",
      inputs: { X: numberShadow(0), Y: numberShadow(48), WIDTH: numberShadow(128), HEIGHT: numberShadow(10), PERCENT: numberShadow(50) },
    });
  }
  contents.push({ kind: "block", type: "hardware_oled_write" });
  return contents as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
