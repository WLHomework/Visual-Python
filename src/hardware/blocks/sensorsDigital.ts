import * as Blockly from "blockly/core";
import { boardPinChoices, getBoardProfile, validateDigitalInputPull } from "../boardProfiles";
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
    type: "hardware_button_read",
    message0: "读取按键 引脚 %1 消抖 %2 毫秒 触发电平 %3",
    args0: [
      { type: "field_dropdown", name: "PIN", options: [["（请先选择硬件板卡）", ""]] },
      { type: "input_value", name: "DEBOUNCE", check: "Number" },
      { type: "field_dropdown", name: "ACTIVE", options: [["低电平", "low"], ["高电平", "high"]] },
    ],
    inputsInline: true,
    output: "Boolean",
    colour: hardwareColours.pin,
    tooltip: "读取按键并按指定毫秒数消抖。低电平触发时使用内部上拉，高电平触发时使用内部下拉；返回真表示按下。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_pir_motion",
    message0: "PIR 人体感应 引脚 %1 保持 %2 秒",
    args0: [
      { type: "field_dropdown", name: "PIN", options: [["（请先选择硬件板卡）", ""]] },
      { type: "input_value", name: "HOLD", check: "Number" },
    ],
    inputsInline: true,
    output: "Boolean",
    colour: hardwareColours.sensor,
    tooltip: "读取 PIR 人体红外模块。传感器输出变低后，保持时间内的读取结果仍为真；每个引脚独立记录。",
    extensions: ["hardware_board_pin"],
  },
];

/** 按键消抖助手：只在确认按下时等待消抖，松开时立即返回。 */
const ensureButtonHelper = (): string => {
  ensureImport("machine");
  ensureImport("time");
  const placeholder = hardwareFunctionPlaceholder();
  return provideHardwareFunction("hardware_button_read", [
    `def ${placeholder}(pin, debounce_ms, active_low):`,
    "  button = machine.Pin(pin, machine.Pin.IN, machine.Pin.PULL_UP if active_low else machine.Pin.PULL_DOWN)",
    "  value = button.value()",
    "  if active_low:",
    "    pressed = value == 0",
    "  else:",
    "    pressed = value == 1",
    "  if not pressed:",
    "    return False",
    "  if debounce_ms < 0:",
    "    debounce_ms = 0",
    "  if debounce_ms > 1000:",
    "    debounce_ms = 1000",
    "  if debounce_ms > 0:",
    "    time.sleep_ms(int(debounce_ms))",
    "  value = button.value()",
    "  if active_low:",
    "    return value == 0",
    "  return value == 1",
  ]);
};

/** PIR 保持时间助手：用每个引脚独立的全局时间戳，避免多个 PIR 互相覆盖。 */
const ensurePirHelper = (): string => {
  ensureImport("machine");
  ensureImport("time");
  const placeholder = hardwareFunctionPlaceholder();
  return provideHardwareFunction("hardware_pir_motion", [
    `def ${placeholder}(pin, hold_ms):`,
    "  pir = machine.Pin(pin, machine.Pin.IN)",
    "  now = time.ticks_ms()",
    '  key = "_pir_last_" + str(pin)',
    "  if pir.value():",
    "    globals()[key] = now",
    "    return True",
    '  last = globals().get(key, -1)',
    "  if last < 0:",
    "    return False",
    "  if hold_ms < 0:",
    "    hold_ms = 0",
    "  if hold_ms > 3600000:",
    "    hold_ms = 3600000",
    "  return time.ticks_diff(now, last) < hold_ms",
  ]);
};

const validInteger = (value: number | undefined, min: number, max: number): boolean =>
  value === undefined || (Number.isInteger(value) && value >= min && value <= max);

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_button_read = (block, generator) => {
    const target = pinTarget(block, "digital-input");
    if (typeof target === "string") return ["False", pythonOrder.ATOMIC];
    const activeLow = block.getFieldValue("ACTIVE") !== "high";
    const pullProblem = validateDigitalInputPull(target.profile, target.pinId, activeLow ? "up" : "down");
    if (pullProblem) return ["False", pythonOrder.ATOMIC];
    const debounce = numericInputValue(block, "DEBOUNCE");
    if (!validInteger(debounce, 0, 1000)) return ["False", pythonOrder.ATOMIC];
    const helper = ensureButtonHelper();
    const debounceCode = generator.valueToCode(block, "DEBOUNCE", pythonOrder.NONE) || "30";
    return [`${helper}(${target.pinId}, ${debounceCode}, ${activeLow ? "True" : "False"})`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_pir_motion = (block, generator) => {
    const target = pinTarget(block, "digital-input");
    if (typeof target === "string") return ["False", pythonOrder.ATOMIC];
    const hold = numericInputValue(block, "HOLD");
    if (!validInteger(hold, 0, 3600)) return ["False", pythonOrder.ATOMIC];
    const helper = ensurePirHelper();
    const holdCode = generator.valueToCode(block, "HOLD", pythonOrder.NONE) || "2";
    return [`${helper}(${target.pinId}, int(${holdCode} * 1000))`, pythonOrder.FUNCTION_CALL];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.p0Modules) return [];
  const digitalPins = boardPinChoices(profile, "digital-input");
  const buttonPin = digitalPins[0]?.id ?? "";
  const pirPin = digitalPins[1]?.id ?? buttonPin;
  return [
    hardwareSectionLabel("数字输入模块"),
    {
      kind: "block",
      type: "hardware_button_read",
      fields: { PIN: buttonPin, ACTIVE: "low" },
      inputs: { DEBOUNCE: numberShadow(30) },
    },
    {
      kind: "block",
      type: "hardware_pir_motion",
      fields: { PIN: pirPin },
      inputs: { HOLD: numberShadow(2) },
    },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
