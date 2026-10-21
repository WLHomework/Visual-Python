import * as Blockly from "blockly/core";
import { getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureImport,
  getActiveHardwareBoard,
  hardwareColours,
  hardwareGenerator,
  hardwareSectionLabel,
  i2cBusExpression,
  numberShadow,
  numericInputValue,
  pinTargetField,
  pythonOrder,
  unavailable,
} from "./shared";

const definitions = [
  {
    type: "hardware_i2c_init",
    message0: "初始化 I2C SDA %1 SCL %2",
    args0: [
      { type: "field_dropdown", name: "SDA", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "SCL", options: [["（请先选择硬件板卡）", ""]] },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.communication,
    tooltip: "按当前板卡的默认引脚初始化 I2C。ESP8266 使用软件 I2C；先运行此积木后，OLED 会复用这条总线。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_i2c_scan",
    message0: "扫描 I2C 设备地址",
    output: "Array",
    colour: hardwareColours.communication,
    tooltip: "返回总线上响应的 7 位地址列表（0x08–0x77）。请先运行「初始化 I2C」积木。",
  },
  {
    type: "hardware_i2c_write_register",
    message0: "I2C 写寄存器 地址 %1 寄存器 %2 数据 %3",
    args0: [
      { type: "input_value", name: "ADDRESS", check: "Number" },
      { type: "input_value", name: "REGISTER", check: "Number" },
      { type: "input_value", name: "DATA", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.communication,
    tooltip: "向 7 位地址设备的寄存器写入 1 个字节（0–255）。地址和寄存器号用十进制填写，例如 0x3C 填 60。",
  },
  {
    type: "hardware_i2c_read_register",
    message0: "I2C 读寄存器 地址 %1 寄存器 %2",
    args0: [
      { type: "input_value", name: "ADDRESS", check: "Number" },
      { type: "input_value", name: "REGISTER", check: "Number" },
    ],
    inputsInline: true,
    output: "Number",
    colour: hardwareColours.communication,
    tooltip: "读取 7 位地址设备某个寄存器的 1 个字节（0–255）。地址和寄存器号用十进制填写。",
  },
];

const literalProblem = (block: Blockly.Block, input: string, min: number, max: number, message: string): string | undefined => {
  const value = numericInputValue(block, input);
  if (value === undefined) return undefined;
  return Number.isInteger(value) && value >= min && value <= max ? undefined : message;
};

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_i2c_init = (block) => {
    const profile = getActiveHardwareBoard();
    if (!profile) return unavailable("请先选择硬件板卡");
    const sda = pinTargetField(block, "digital-output", "SDA");
    if (typeof sda === "string") return sda;
    const scl = pinTargetField(block, "digital-output", "SCL");
    if (typeof scl === "string") return scl;
    if (sda.pinId === scl.pinId) return unavailable("I2C 的 SDA 和 SCL 不能使用同一个引脚");
    ensureImport("machine");
    return `_i2c = ${i2cBusExpression(profile, sda.pinId, scl.pinId)}\n`;
  };

  hardwareGenerator.forBlock.hardware_i2c_scan = () => {
    if (!getActiveHardwareBoard()) return ["[]", pythonOrder.ATOMIC];
    return ["_i2c.scan()", pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_i2c_write_register = (block, generator) => {
    if (!getActiveHardwareBoard()) return unavailable("请先选择硬件板卡");
    const problem =
      literalProblem(block, "ADDRESS", 0x08, 0x77, "I2C 地址必须在 0x08–0x77 之间") ??
      literalProblem(block, "REGISTER", 0, 0xFF, "寄存器地址必须在 0–255 之间") ??
      literalProblem(block, "DATA", 0, 0xFF, "写入数据必须在 0–255 之间");
    if (problem) return unavailable(problem);
    const address = generator.valueToCode(block, "ADDRESS", pythonOrder.NONE) || "0";
    const register = generator.valueToCode(block, "REGISTER", pythonOrder.NONE) || "0";
    const data = generator.valueToCode(block, "DATA", pythonOrder.NONE) || "0";
    return `_i2c.writeto_mem(int(${address}), int(${register}), bytes([int(${data}) & 0xFF]))\n`;
  };

  hardwareGenerator.forBlock.hardware_i2c_read_register = (block, generator) => {
    if (!getActiveHardwareBoard()) return ["None", pythonOrder.ATOMIC];
    const problem =
      literalProblem(block, "ADDRESS", 0x08, 0x77, "I2C 地址必须在 0x08–0x77 之间") ??
      literalProblem(block, "REGISTER", 0, 0xFF, "寄存器地址必须在 0–255 之间");
    if (problem) return ["None", pythonOrder.ATOMIC];
    const address = generator.valueToCode(block, "ADDRESS", pythonOrder.NONE) || "0";
    const register = generator.valueToCode(block, "REGISTER", pythonOrder.NONE) || "0";
    return [`_i2c.readfrom_mem(int(${address}), int(${register}), 1)[0]`, pythonOrder.FUNCTION_CALL];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile) return [];
  return [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("I2C 通信"),
    {
      kind: "block",
      type: "hardware_i2c_init",
      fields: { SDA: profile.defaultI2c.sda, SCL: profile.defaultI2c.scl },
    },
    { kind: "block", type: "hardware_i2c_scan" },
    {
      kind: "block",
      type: "hardware_i2c_write_register",
      inputs: { ADDRESS: numberShadow(0x3C), REGISTER: numberShadow(0), DATA: numberShadow(0) },
    },
    {
      kind: "block",
      type: "hardware_i2c_read_register",
      inputs: { ADDRESS: numberShadow(0x3C), REGISTER: numberShadow(0) },
    },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
