import * as Blockly from "blockly/core";
import { getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureI2cBus,
  ensureImport,
  getActiveHardwareBoard,
  hardwareColours,
  hardwareFunctionPlaceholder,
  hardwareGenerator,
  hardwareSectionLabel,
  numberShadow,
  numericInputValue,
  provideHardwareFunction,
  pythonOrder,
  unavailable,
} from "./shared";

const definitions = [
  {
    type: "hardware_ds3231_read",
    message0: "DS3231 读取 %1",
    args0: [
      {
        type: "field_dropdown",
        name: "COMPONENT",
        options: [
          ["年", "0"],
          ["月", "1"],
          ["日", "2"],
          ["星期", "3"],
          ["时", "4"],
          ["分", "5"],
          ["秒", "6"],
        ],
      },
    ],
    output: "Number",
    colour: hardwareColours.sensor,
    tooltip: "读取 DS3231 实时时钟的年、月、日、星期（1–7）、时、分、秒。使用 24 小时制；I2C 地址固定为 0x68；读取失败返回 -1。",
  },
  {
    type: "hardware_ds3231_set",
    message0: "设置 DS3231 为 %1 年 %2 月 %3 日 %4 时 %5 分 %6 秒",
    args0: [
      { type: "input_value", name: "YEAR", check: "Number" },
      { type: "input_value", name: "MONTH", check: "Number" },
      { type: "input_value", name: "DAY", check: "Number" },
      { type: "input_value", name: "HOUR", check: "Number" },
      { type: "input_value", name: "MINUTE", check: "Number" },
      { type: "input_value", name: "SECOND", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.sensor,
    tooltip: "设置 DS3231 的日期和时间，星期由日期自动计算。年份 2000–2099；时、分、秒使用 24 小时制。写入后清除时钟停止标志。",
  },
];

const ensureDs3231ReadHelper = (): string => {
  ensureImport("ds3231");
  const bus = ensureI2cBus(getActiveHardwareBoard()!);
  const placeholder = hardwareFunctionPlaceholder();
  return provideHardwareFunction("hardware_ds3231_read", [
    `def ${placeholder}(component):`,
    '  sensor = globals().get("_ds3231")',
    "  if sensor is None:",
    `    sensor = ds3231.DS3231(${bus}())`,
    '    globals()["_ds3231"] = sensor',
    "  try:",
    "    values = sensor.read_datetime()",
    "  except OSError:",
    "    return -1",
    "  if component < 0 or component > 6:",
    "    return -1",
    "  return values[component]",
  ]);
};

const ensureDs3231WriteHelper = (): string => {
  ensureImport("ds3231");
  const bus = ensureI2cBus(getActiveHardwareBoard()!);
  const placeholder = hardwareFunctionPlaceholder();
  return provideHardwareFunction("hardware_ds3231_write", [
    `def ${placeholder}(year, month, day, hour, minute, second):`,
    '  sensor = globals().get("_ds3231")',
    "  if sensor is None:",
    `    sensor = ds3231.DS3231(${bus}())`,
    '    globals()["_ds3231"] = sensor',
    "  sensor.set_datetime(year, month, day, hour, minute, second)",
  ]);
};

const rangeProblem = (value: number | undefined, min: number, max: number, message: string): string | undefined =>
  value === undefined || (Number.isInteger(value) && value >= min && value <= max) ? undefined : message;

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_ds3231_read = (block) => {
    if (!getActiveHardwareBoard()) return ["0", pythonOrder.ATOMIC];
    const component = String(block.getFieldValue("COMPONENT") || "0");
    const helper = ensureDs3231ReadHelper();
    return [`${helper}(${component})`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_ds3231_set = (block, generator) => {
    if (!getActiveHardwareBoard()) return unavailable("请先选择硬件板卡");
    const problem =
      rangeProblem(numericInputValue(block, "YEAR"), 2000, 2099, "DS3231 年份必须是 2000–2099 之间的整数") ??
      rangeProblem(numericInputValue(block, "MONTH"), 1, 12, "DS3231 月份必须是 1–12 之间的整数") ??
      rangeProblem(numericInputValue(block, "DAY"), 1, 31, "DS3231 日期必须是 1–31 之间的整数") ??
      rangeProblem(numericInputValue(block, "HOUR"), 0, 23, "DS3231 小时必须是 0–23 之间的整数") ??
      rangeProblem(numericInputValue(block, "MINUTE"), 0, 59, "DS3231 分钟必须是 0–59 之间的整数") ??
      rangeProblem(numericInputValue(block, "SECOND"), 0, 59, "DS3231 秒必须是 0–59 之间的整数");
    if (problem) return unavailable(problem);
    const helper = ensureDs3231WriteHelper();
    const args = ["YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND"].map((name) => generator.valueToCode(block, name, pythonOrder.NONE) || "0");
    return `${helper}(${args.join(", ")})\n`;
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.p2Modules) return [];
  return [
    hardwareSectionLabel("DS3231 时钟"),
    { kind: "block", type: "hardware_ds3231_read", fields: { COMPONENT: "0" } },
    {
      kind: "block",
      type: "hardware_ds3231_set",
      inputs: {
        YEAR: numberShadow(2026),
        MONTH: numberShadow(1),
        DAY: numberShadow(1),
        HOUR: numberShadow(0),
        MINUTE: numberShadow(0),
        SECOND: numberShadow(0),
      },
    },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
