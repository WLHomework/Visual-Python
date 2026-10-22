import * as Blockly from "blockly/core";
import { getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureI2cBus,
  ensureImport,
  getActiveHardwareBoard,
  hardwareColours,
  hardwareGenerator,
  hardwareSectionLabel,
  numberShadow,
  numericInputValue,
  pythonOrder,
  unavailable,
} from "./shared";

const definitions = [
  {
    type: "hardware_lcd1602_init",
    message0: "初始化 LCD1602 地址 %1 列数 %2 行数 %3 背光 %4",
    args0: [
      { type: "field_dropdown", name: "ADDRESS", options: [["0x27", "0x27"], ["0x3F", "0x3F"]] },
      { type: "input_value", name: "COLS", check: "Number" },
      { type: "input_value", name: "ROWS", check: "Number" },
      { type: "field_dropdown", name: "BACKLIGHT", options: [["开", "on"], ["关", "off"]] },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.display,
    tooltip: "通过 PCF8574 I2C 背包初始化 LCD1602。常见地址为 0x27 或 0x3F，列数通常 16、行数通常 2。未运行「初始化 I2C」时会复用板卡默认引脚自动创建总线。",
  },
  {
    type: "hardware_lcd1602_text",
    message0: "LCD1602 第 %1 行 第 %2 列 显示 %3",
    args0: [
      { type: "input_value", name: "ROW", check: "Number" },
      { type: "input_value", name: "COL", check: "Number" },
      { type: "input_value", name: "TEXT" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.display,
    tooltip: "从指定行列开始显示英文、数字和常用符号；行列从 1 开始，不要超过初始化时设置的行数和列数。LCD1602 默认字库不支持中文，中文会显示为问号。请先初始化 LCD1602。",
  },
  {
    type: "hardware_lcd1602_clear",
    message0: "清空 LCD1602",
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.display,
    tooltip: "清除 LCD1602 的全部字符并把光标移回左上角。",
  },
];

const rangeProblem = (value: number | undefined, min: number, max: number, message: string): string | undefined => {
  if (value === undefined) return undefined;
  return Number.isInteger(value) && value >= min && value <= max ? undefined : message;
};

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_lcd1602_init = (block, generator) => {
    const profile = getActiveHardwareBoard();
    if (!profile) return unavailable("请先选择硬件板卡");
    const problem =
      rangeProblem(numericInputValue(block, "COLS"), 1, 20, "LCD1602 列数必须是 1–20 之间的整数") ??
      rangeProblem(numericInputValue(block, "ROWS"), 1, 4, "LCD1602 行数必须是 1–4 之间的整数");
    if (problem) return unavailable(problem);
    const cols = generator.valueToCode(block, "COLS", pythonOrder.NONE) || "16";
    const rows = generator.valueToCode(block, "ROWS", pythonOrder.NONE) || "2";
    const address = String(block.getFieldValue("ADDRESS") || "0x27");
    const backlight = block.getFieldValue("BACKLIGHT") !== "off" ? "True" : "False";
    ensureImport("lcd1602");
    const bus = ensureI2cBus(profile);
    return `_lcd = lcd1602.Lcd1602(${bus}(), address=${address}, cols=int(${cols}), rows=int(${rows}), backlight=${backlight})\n`;
  };

  hardwareGenerator.forBlock.hardware_lcd1602_text = (block, generator) => {
    const row = generator.valueToCode(block, "ROW", pythonOrder.NONE) || "1";
    const col = generator.valueToCode(block, "COL", pythonOrder.NONE) || "1";
    const text = generator.valueToCode(block, "TEXT", pythonOrder.NONE) || '""';
    return `_lcd.text(int(${row}) - 1, int(${col}) - 1, str(${text}))\n`;
  };

  hardwareGenerator.forBlock.hardware_lcd1602_clear = () => "_lcd.clear()\n";
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.p0Modules) return [];
  return [
    hardwareSectionLabel("LCD1602 显示"),
    {
      kind: "block",
      type: "hardware_lcd1602_init",
      fields: { ADDRESS: "0x27", BACKLIGHT: "on" },
      inputs: { COLS: numberShadow(16), ROWS: numberShadow(2) },
    },
    {
      kind: "block",
      type: "hardware_lcd1602_text",
      inputs: {
        ROW: numberShadow(1),
        COL: numberShadow(1),
        TEXT: { shadow: { type: "text", fields: { TEXT: "Hello" } } },
      },
    },
    { kind: "block", type: "hardware_lcd1602_clear" },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
