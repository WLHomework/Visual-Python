import * as Blockly from "blockly/core";
import { boardPinChoices, getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureImport,
  hardwareColours,
  hardwareGenerator,
  hardwareSectionLabel,
  numberShadow,
  numericInputValue,
  pinTargetField,
  pythonOrder,
  unavailable,
} from "./shared";

const definitions = [
  {
    type: "hardware_tm1637_init",
    message0: "初始化 TM1637 CLK %1 DIO %2 亮度 %3",
    args0: [
      { type: "field_dropdown", name: "CLK", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "DIO", options: [["（请先选择硬件板卡）", ""]] },
      {
        type: "field_dropdown",
        name: "BRIGHTNESS",
        options: [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"], ["7", "7"]],
      },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.display,
    tooltip: "初始化 TM1637 四位七段数码管。CLK 和 DIO 用不同引脚；模块自带上拉电阻，使用 3.3 V 供电。亮度 1–7，数值越大越亮。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_tm1637_number",
    message0: "TM1637 显示 %1 小数位 %2 冒号 %3",
    args0: [
      { type: "input_value", name: "VALUE", check: "Number" },
      { type: "input_value", name: "DECIMALS", check: "Number" },
      { type: "field_dropdown", name: "COLON", options: [["关闭", "off"], ["显示", "on"]] },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.display,
    tooltip: "在数码管上显示 -999 到 9999 之间的数字。小数位 0–3；超出四位时只保留最右边四位，无法显示时显示空白。冒号只在第二位后显示，请先初始化 TM1637。",
  },
];

const brightnessDigits = (block: Blockly.Block): number => {
  const value = Number(block.getFieldValue("BRIGHTNESS"));
  return Number.isInteger(value) && value >= 1 && value <= 7 ? value : 7;
};

const decimalPlaces = (block: Blockly.Block): number | undefined => {
  const value = numericInputValue(block, "DECIMALS");
  return value !== undefined && Number.isInteger(value) && value >= 0 && value <= 3 ? value : undefined;
};

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_tm1637_init = (block) => {
    const clk = pinTargetField(block, "digital-output", "CLK");
    if (typeof clk === "string") return clk;
    const dio = pinTargetField(block, "digital-output", "DIO");
    if (typeof dio === "string") return dio;
    if (clk.pinId === dio.pinId) return unavailable("TM1637 的 CLK 和 DIO 必须使用不同引脚");
    ensureImport("machine");
    ensureImport("tm1637");
    return `_tm1637 = tm1637.Tm1637(machine.Pin(${clk.pinId}, machine.Pin.OUT, value=1), machine.Pin(${dio.pinId}, machine.Pin.OUT, value=1), brightness=${brightnessDigits(block)})\n`;
  };

  hardwareGenerator.forBlock.hardware_tm1637_number = (block, generator) => {
    if (numericInputValue(block, "DECIMALS") !== undefined && decimalPlaces(block) === undefined) {
      return unavailable("TM1637 小数位必须是 0–3 之间的整数");
    }
    const value = generator.valueToCode(block, "VALUE", pythonOrder.NONE) || "0";
    const decimals = generator.valueToCode(block, "DECIMALS", pythonOrder.NONE) || "0";
    const colon = block.getFieldValue("COLON") === "on" ? "True" : "False";
    return `_tm1637.show_number(${value}, decimals=int(${decimals}), colon=${colon})\n`;
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.p1Modules) return [];
  const digital = boardPinChoices(profile, "digital-output");
  const clk = digital[0]?.id ?? "";
  const dio = digital.find((pin) => pin.id !== clk)?.id ?? "";
  return [
    hardwareSectionLabel("TM1637 数码管"),
    {
      kind: "block",
      type: "hardware_tm1637_init",
      fields: { CLK: clk, DIO: dio, BRIGHTNESS: "7" },
    },
    {
      kind: "block",
      type: "hardware_tm1637_number",
      fields: { COLON: "off" },
      inputs: { VALUE: numberShadow(0), DECIMALS: numberShadow(0) },
    },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
