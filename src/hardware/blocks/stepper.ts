import * as Blockly from "blockly/core";
import { boardPinChoices, getBoardProfile } from "../boardProfiles";
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
  pinTargetField,
  provideHardwareFunction,
  pythonOrder,
  unavailable,
} from "./shared";

const definitions = [
  {
    type: "hardware_stepper_move",
    message0: "步进电机 IN1 %1 IN2 %2 IN3 %3 IN4 %4 步数 %5 间隔毫秒 %6",
    args0: [
      { type: "field_dropdown", name: "IN1", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "IN2", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "IN3", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "IN4", options: [["（请先选择硬件板卡）", ""]] },
      { type: "input_value", name: "STEPS", check: "Number" },
      { type: "input_value", name: "INTERVAL", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.pwm,
    tooltip: "用 4 个引脚驱动 28BYJ-48 一类四相步进电机（经 ULN2003 等驱动板）。正数正转、负数反转，最多 100000 步；间隔 1–1000 毫秒，越小越快。转动结束后会释放线圈，避免电机持续发热。",
    extensions: ["hardware_board_pin"],
  },
];

/** 四相整步时序：每次只给一相通电，结束后统一关断。 */
const ensureStepperHelper = (): string => {
  ensureImport("machine");
  ensureImport("time");
  const placeholder = hardwareFunctionPlaceholder();
  return provideHardwareFunction("hardware_stepper_move", [
    `def ${placeholder}(in1, in2, in3, in4, steps, interval_ms):`,
    "  pins = (",
    "    machine.Pin(in1, machine.Pin.OUT),",
    "    machine.Pin(in2, machine.Pin.OUT),",
    "    machine.Pin(in3, machine.Pin.OUT),",
    "    machine.Pin(in4, machine.Pin.OUT),",
    "  )",
    "  sequence = ((1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1))",
    "  if interval_ms < 1:",
    "    interval_ms = 1",
    "  if steps < 0:",
    "    total = -steps",
    "    direction = -1",
    "  else:",
    "    total = steps",
    "    direction = 1",
    "  for index in range(total):",
    "    phase = sequence[(index * direction) % 4]",
    "    for pin, value in zip(pins, phase):",
    "      pin.value(value)",
    "    time.sleep_ms(interval_ms)",
    "  for pin in pins:",
    "    pin.value(0)",
  ]);
};

const validSteps = (value: number | undefined): boolean =>
  value === undefined || (Number.isInteger(value) && value >= -100000 && value <= 100000);
const validInterval = (value: number | undefined): boolean =>
  value === undefined || (Number.isInteger(value) && value >= 1 && value <= 1000);

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_stepper_move = (block, generator) => {
    const targets = ["IN1", "IN2", "IN3", "IN4"].map((field) => pinTargetField(block, "digital-output", field));
    const failure = targets.find((target) => typeof target === "string");
    if (typeof failure === "string") return failure;
    const pins = targets.map((target) => (typeof target === "string" ? "" : target.pinId));
    if (new Set(pins).size < 4) return unavailable("步进电机的 IN1–IN4 必须使用 4 个不同引脚");
    if (!validSteps(numericInputValue(block, "STEPS"))) return unavailable("步进电机的步数必须是 -100000 到 100000 之间的整数");
    if (!validInterval(numericInputValue(block, "INTERVAL"))) return unavailable("步进电机的间隔必须是 1–1000 之间的整数毫秒");
    const helper = ensureStepperHelper();
    const steps = generator.valueToCode(block, "STEPS", pythonOrder.NONE) || "0";
    const interval = generator.valueToCode(block, "INTERVAL", pythonOrder.NONE) || "5";
    return `${helper}(${pins.join(", ")}, int(${steps}), int(${interval}))\n`;
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.p1Modules) return [];
  const pins = boardPinChoices(profile, "digital-output").map((pin) => pin.id);
  return [
    hardwareSectionLabel("步进电机"),
    {
      kind: "block",
      type: "hardware_stepper_move",
      fields: { IN1: pins[0] ?? "", IN2: pins[1] ?? "", IN3: pins[2] ?? "", IN4: pins[3] ?? "" },
      inputs: { STEPS: numberShadow(200), INTERVAL: numberShadow(5) },
    },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
