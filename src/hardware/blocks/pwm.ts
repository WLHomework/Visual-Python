import * as Blockly from "blockly/core";
import { defineHardwareBlocks, ensureImport, ensurePwmHelper, hardwareColours, hardwareGenerator, hardwareSectionLabel, numberShadow, pinTarget, pythonOrder } from "./shared";
import { numericInputValue, unavailable } from "./shared";
import { boardPinChoices, getBoardProfile, validateToneFrequency } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";

const definitions = [
  {
    type: "hardware_pwm_write",
    message0: "设置引脚 %1 PWM 频率 %2 Hz 占空比 %3",
    args0: [
      { type: "field_dropdown", name: "PIN", options: [["（请先选择硬件板卡）", ""]] },
      { type: "input_value", name: "FREQ", check: "Number" },
      { type: "input_value", name: "DUTY", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.pwm,
    tooltip: "输出 PWM 信号，占空比越大输出越强，可用来调光或调速。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_servo_write",
    message0: "设置引脚 %1 舵机角度 %2",
    args0: [
      { type: "field_dropdown", name: "PIN", options: [["（请先选择硬件板卡）", ""]] },
      { type: "input_value", name: "ANGLE", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.pwm,
    tooltip: "用固定 50 Hz 控制舵机，角度范围为 0 到 180 度。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_tone",
    message0: "输出引脚 %1 音调 %2 Hz 持续 %3 毫秒",
    args0: [
      { type: "field_dropdown", name: "PIN", options: [["（请先选择硬件板卡）", ""]] },
      { type: "input_value", name: "FREQ", check: "Number" },
      { type: "input_value", name: "DURATION", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.pwm,
    tooltip: "输出指定频率的方波，持续时间结束后自动静音。",
    extensions: ["hardware_board_pin"],
  },
];

export function register(): void {
  defineHardwareBlocks(definitions);
  hardwareGenerator.forBlock.hardware_pwm_write = (block, generator) => {
    const target = pinTarget(block, "pwm");
    if (typeof target === "string") return target;
    ensureImport("machine");
    const freq = generator.valueToCode(block, "FREQ", pythonOrder.NONE) || String(target.profile.pwmFrequencyHz);
    const duty = generator.valueToCode(block, "DUTY", pythonOrder.NONE) || String(Math.round(target.profile.pwmDutyMax / 2));
    return `${ensurePwmHelper()}(${target.pinId}, ${freq}, ${duty})\n`;
  };
  hardwareGenerator.forBlock.hardware_servo_write = (block, generator) => {
    const target = pinTarget(block, "pwm");
    if (typeof target === "string") return target;
    ensureImport("machine");
    const angle = generator.valueToCode(block, "ANGLE", pythonOrder.NONE) || "90";
    const clampedAngle = `max(0, min(180, ${angle}))`;
    const duty = `int((0.5 + (${clampedAngle} / 180) * 2.0) * ${target.profile.pwmDutyMax} / 20.0)`;
    return `${ensurePwmHelper()}(${target.pinId}, 50, ${duty})\n`;
  };
  hardwareGenerator.forBlock.hardware_tone = (block, generator) => {
    const target = pinTarget(block, "pwm");
    if (typeof target === "string") return target;
    const frequency = generator.valueToCode(block, "FREQ", pythonOrder.NONE) || "440";
    const frequencyProblem = validateToneFrequency(target.profile, numericInputValue(block, "FREQ"));
    if (frequencyProblem) return unavailable(frequencyProblem);
    const duration = generator.valueToCode(block, "DURATION", pythonOrder.NONE) || "500";
    const safeFrequency = target.profile.pwmFrequencyMaxHz === undefined
      ? `int(max(1, ${frequency}))`
      : `int(max(1, min(${target.profile.pwmFrequencyMaxHz}, ${frequency})))`;
    const duty = Math.round(target.profile.pwmDutyMax / 2);
    const setPwm = ensurePwmHelper();
    ensureImport("machine");
    ensureImport("time");
    return [
      `${setPwm}(${target.pinId}, ${safeFrequency}, ${duty})\n`,
      `time.sleep_ms(int(max(0, ${duration})))\n`,
      `${setPwm}(${target.pinId}, ${safeFrequency}, 0)\n`,
    ].join("");
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  const pwmPin = boardPinChoices(profile, "pwm")[0]?.id ?? "";
  return [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("PWM 与模拟"),
    {
      kind: "block",
      type: "hardware_pwm_write",
      fields: { PIN: pwmPin },
      inputs: { FREQ: numberShadow(profile?.pwmFrequencyHz ?? 1000), DUTY: numberShadow(512) },
    },
    {
      kind: "block",
      type: "hardware_servo_write",
      fields: { PIN: pwmPin },
      inputs: { ANGLE: numberShadow(90) },
    },
    {
      kind: "block",
      type: "hardware_tone",
      fields: { PIN: pwmPin },
      inputs: { FREQ: numberShadow(440), DURATION: numberShadow(500) },
    },
  ];
}
