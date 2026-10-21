import * as Blockly from "blockly/core";
import { boardPinChoices, getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureImport,
  hardwareColours,
  hardwareGenerator,
  hardwareSectionLabel,
  pinTargetField,
  pythonOrder,
} from "./shared";

const definitions = [
  {
    type: "hardware_ultrasonic_distance",
    message0: "超声波测距 触发引脚 %1 回响引脚 %2",
    args0: [
      { type: "field_dropdown", name: "TRIGGER", options: [["请先选择硬件板卡", ""]] },
      { type: "field_dropdown", name: "ECHO", options: [["请先选择硬件板卡", ""]] },
    ],
    output: "Number",
    colour: hardwareColours.sensor,
    tooltip: "返回距离（厘米）。等待回响超时 30000 微秒时返回 -1。",
    extensions: ["hardware_board_pin"],
  },
];

export function register(): void {
  defineHardwareBlocks(definitions);
  hardwareGenerator.forBlock.hardware_ultrasonic_distance = (block) => {
    const trigger = pinTargetField(block, "digital-output", "TRIGGER");
    const echo = pinTargetField(block, "digital-input", "ECHO");
    if (typeof trigger === "string") return ["None", pythonOrder.ATOMIC];
    if (typeof echo === "string") return ["None", pythonOrder.ATOMIC];
    ensureImport("machine");
    ensureImport("time");
    const helper = ensureUltrasonicHelper();
    return [`${helper}(${trigger.pinId}, ${echo.pinId})`, pythonOrder.FUNCTION_CALL];
  };
}

const ensureUltrasonicHelper = (): string => {
  const internals = hardwareGenerator as unknown as {
    FUNCTION_NAME_PLACEHOLDER_: string;
    provideFunction_(name: string, code: string[]): string;
  };
  return internals.provideFunction_("hardware_ultrasonic_distance", [
    `def ${internals.FUNCTION_NAME_PLACEHOLDER_}(trigger_pin, echo_pin):`,
    "  trigger = machine.Pin(trigger_pin, machine.Pin.OUT)",
    "  echo = machine.Pin(echo_pin, machine.Pin.IN)",
    "  trigger.value(0)",
    "  time.sleep_us(2)",
    "  trigger.value(1)",
    "  time.sleep_us(10)",
    "  trigger.value(0)",
    "  duration = machine.time_pulse_us(echo, 1, 30000)",
    "  if duration < 0:",
    "    return -1",
    "  return duration / 58.0",
  ]);
};

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  const trigger = boardPinChoices(profile, "digital-output")[0]?.id ?? "";
  const echo = boardPinChoices(profile, "digital-input").find((pin) => pin.id !== trigger)?.id ?? "";
  return [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("超声波测距"),
    { kind: "block", type: "hardware_ultrasonic_distance", fields: { TRIGGER: trigger, ECHO: echo } },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
