import * as Blockly from "blockly/core";
import { analogReadMax, boardPinChoices, getBoardProfile } from "../boardProfiles";
import type { BoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureImport,
  hardwareColours,
  hardwareFunctionPlaceholder,
  hardwareGenerator,
  hardwareSectionLabel,
  numberShadow,
  numericInputValue,
  pinTarget,
  provideHardwareFunction,
  pythonOrder,
} from "./shared";

const definitions = [
  {
    type: "hardware_light_percent",
    message0: "光敏电阻百分比 引脚 %1 暗值 %2 亮值 %3",
    args0: [
      { type: "field_dropdown", name: "PIN", options: [["（请先选择硬件板卡）", ""]] },
      { type: "input_value", name: "DARK", check: "Number" },
      { type: "input_value", name: "BRIGHT", check: "Number" },
    ],
    inputsInline: true,
    output: "Number",
    colour: hardwareColours.sensor,
    tooltip: "把光敏电阻的模拟读数换算成 0–100%。先遮光读取原始值填到「暗值」，再强光读取原始值填到「亮值」；读数方向相反时交换两个校准值。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_soil_percent",
    message0: "土壤湿度百分比 引脚 %1 干值 %2 湿值 %3",
    args0: [
      { type: "field_dropdown", name: "PIN", options: [["（请先选择硬件板卡）", ""]] },
      { type: "input_value", name: "DRY", check: "Number" },
      { type: "input_value", name: "WET", check: "Number" },
    ],
    inputsInline: true,
    output: "Number",
    colour: hardwareColours.sensor,
    tooltip: "把土壤湿度传感器的模拟读数换算成 0–100%。先把空气中读到的原始值填到「干值」，再把水中读到的原始值填到「湿值」；不同传感器需要现场校准。",
    extensions: ["hardware_board_pin"],
  },
];

/** 两种百分比积木共用一个换算助手；校准值相等时返回 0，避免除以零。 */
const ensureAdcPercentHelper = (profile: BoardProfile): string => {
  ensureImport("machine");
  const adc = profile.analogRead === "adc0" ? "machine.ADC(0).read()" : "machine.ADC(machine.Pin(pin)).read()";
  const placeholder = hardwareFunctionPlaceholder();
  return provideHardwareFunction("hardware_adc_percent", [
    `def ${placeholder}(pin, low, high):`,
    `  value = ${adc}`,
    "  if high == low:",
    "    return 0",
    "  percent = (value - low) * 100.0 / (high - low)",
    "  if percent < 0:",
    "    return 0",
    "  if percent > 100:",
    "    return 100",
    "  return percent",
  ]);
};

const calibrationProblem = (low: number | undefined, high: number | undefined, max: number): boolean => {
  const valid = (value: number | undefined) => value === undefined || (Number.isFinite(value) && value >= 0 && value <= max);
  return !valid(low) || !valid(high) || (low !== undefined && high !== undefined && low === high);
};

export function register(): void {
  defineHardwareBlocks(definitions);

  const generatePercent = (block: Blockly.Block, generator: Parameters<typeof hardwareGenerator.forBlock[string]>[1], lowInput: string, highInput: string, lowDefault: (max: number) => number, highDefault: (max: number) => number): [string, number] => {
    const target = pinTarget(block, "analog");
    if (typeof target === "string") return ["0", pythonOrder.ATOMIC];
    const max = analogReadMax(target.profile);
    if (calibrationProblem(numericInputValue(block, lowInput), numericInputValue(block, highInput), max)) {
      return ["0", pythonOrder.ATOMIC];
    }
    const helper = ensureAdcPercentHelper(target.profile);
    const low = generator.valueToCode(block, lowInput, pythonOrder.NONE) || String(lowDefault(max));
    const high = generator.valueToCode(block, highInput, pythonOrder.NONE) || String(highDefault(max));
    // ESP8266 只有 ADC(0)，引脚参数不使用；传 0 避免把 "A0" 当成 Python 标识符。
    const pinArgument = target.profile.analogRead === "adc0" ? "0" : target.pinId;
    return [`${helper}(${pinArgument}, ${low}, ${high})`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_light_percent = (block, generator) =>
    generatePercent(block, generator, "DARK", "BRIGHT", () => 0, (max) => max);

  hardwareGenerator.forBlock.hardware_soil_percent = (block, generator) =>
    generatePercent(block, generator, "DRY", "WET", (max) => max, () => 0);
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.p0Modules) return [];
  const pin = boardPinChoices(profile, "analog")[0]?.id ?? "";
  const max = analogReadMax(profile);
  return [
    hardwareSectionLabel("模拟传感器"),
    {
      kind: "block",
      type: "hardware_light_percent",
      fields: { PIN: pin },
      inputs: { DARK: numberShadow(0), BRIGHT: numberShadow(max) },
    },
    {
      kind: "block",
      type: "hardware_soil_percent",
      fields: { PIN: pin },
      inputs: { DRY: numberShadow(max), WET: numberShadow(0) },
    },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
