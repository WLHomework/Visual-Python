import * as Blockly from "blockly/core";
import { boardPinChoices, getBoardProfile } from "../boardProfiles";
import type { BoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureImport,
  ensurePwmHelper,
  hardwareColours,
  hardwareFunctionPlaceholder,
  hardwareGenerator,
  hardwareSectionLabel,
  numberShadow,
  numericInputValue,
  pinTarget,
  pinTargetField,
  provideHardwareFunction,
  pythonOrder,
  unavailable,
} from "./shared";

const definitions = [
  {
    type: "hardware_relay_set",
    message0: "继电器 引脚 %1 %2 触发电平 %3",
    args0: [
      { type: "field_dropdown", name: "PIN", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "STATE", options: [["开", "on"], ["关", "off"]] },
      { type: "field_dropdown", name: "ACTIVE", options: [["低电平", "low"], ["高电平", "high"]] },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.pwm,
    tooltip: "控制继电器模块。常见模块是低电平吸合；若动作相反，把触发电平改成高电平。强电侧必须做好隔离，不要直接触碰。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_dc_motor",
    message0: "直流电机 IN1 %1 IN2 %2 PWM %3 速度 %4",
    args0: [
      { type: "field_dropdown", name: "IN1", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "IN2", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "PWM", options: [["（请先选择硬件板卡）", ""]] },
      { type: "input_value", name: "SPEED", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.pwm,
    tooltip: "控制带方向控制的直流电机驱动器（如 L298N）。速度范围 -100 到 100，正数正转、负数反转、0 停止。",
    extensions: ["hardware_board_pin"],
  },
];

/** 电机助手：把速度限制到 -100..100，按方向设置 IN1/IN2，再用 PWM 调速。 */
const ensureMotorHelper = (profile: BoardProfile): string => {
  ensureImport("machine");
  const setPwm = ensurePwmHelper();
  const placeholder = hardwareFunctionPlaceholder();
  return provideHardwareFunction("hardware_dc_motor", [
    `def ${placeholder}(in1, in2, pwm_pin, speed):`,
    "  if speed > 100:",
    "    speed = 100",
    "  if speed < -100:",
    "    speed = -100",
    "  forward = machine.Pin(in1, machine.Pin.OUT)",
    "  backward = machine.Pin(in2, machine.Pin.OUT)",
    "  if speed > 0:",
    "    forward.value(1)",
    "    backward.value(0)",
    "  elif speed < 0:",
    "    forward.value(0)",
    "    backward.value(1)",
    "  else:",
    "    forward.value(0)",
    "    backward.value(0)",
    `  ${setPwm}(pwm_pin, ${profile.pwmFrequencyHz}, int(abs(speed) * ${profile.pwmDutyMax} / 100))`,
  ]);
};

const validSpeed = (value: number | undefined): boolean =>
  value === undefined || (Number.isFinite(value) && value >= -100 && value <= 100);

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_relay_set = (block) => {
    const target = pinTarget(block, "digital-output");
    if (typeof target === "string") return target;
    const on = block.getFieldValue("STATE") !== "off";
    const activeLow = block.getFieldValue("ACTIVE") !== "high";
    ensureImport("machine");
    const level = on === activeLow ? 0 : 1;
    return `machine.Pin(${target.pinId}, machine.Pin.OUT).value(${level})\n`;
  };

  hardwareGenerator.forBlock.hardware_dc_motor = (block, generator) => {
    const in1 = pinTargetField(block, "digital-output", "IN1");
    if (typeof in1 === "string") return in1;
    const in2 = pinTargetField(block, "digital-output", "IN2");
    if (typeof in2 === "string") return in2;
    const pwm = pinTargetField(block, "pwm", "PWM");
    if (typeof pwm === "string") return pwm;
    if (in1.pinId === in2.pinId || in1.pinId === pwm.pinId || in2.pinId === pwm.pinId) {
      return unavailable("IN1、IN2 和 PWM 必须使用不同引脚");
    }
    if (!validSpeed(numericInputValue(block, "SPEED"))) {
      return unavailable("电机速度必须在 -100 到 100 之间");
    }
    const helper = ensureMotorHelper(pwm.profile);
    const speed = generator.valueToCode(block, "SPEED", pythonOrder.NONE) || "0";
    return `${helper}(${in1.pinId}, ${in2.pinId}, ${pwm.pinId}, ${speed})\n`;
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.p0Modules) return [];
  const digital = boardPinChoices(profile, "digital-output");
  const pwm = boardPinChoices(profile, "pwm")[0]?.id ?? "";
  const in1 = digital.find((pin) => pin.id !== pwm)?.id ?? "";
  const in2 = digital.find((pin) => pin.id !== pwm && pin.id !== in1)?.id ?? "";
  return [
    hardwareSectionLabel("执行器模块"),
    {
      kind: "block",
      type: "hardware_relay_set",
      fields: { PIN: digital[0]?.id ?? "", STATE: "off", ACTIVE: "low" },
    },
    {
      kind: "block",
      type: "hardware_dc_motor",
      fields: { IN1: in1, IN2: in2, PWM: pwm },
      inputs: { SPEED: numberShadow(50) },
    },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
