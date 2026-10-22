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
  pinTarget,
  provideHardwareFunction,
  pythonOrder,
} from "./shared";

const definitions = [
  {
    type: "hardware_ir_receive",
    message0: "红外接收 引脚 %1 超时 %2 毫秒",
    args0: [
      { type: "field_dropdown", name: "PIN", options: [["（请先选择硬件板卡）", ""]] },
      { type: "input_value", name: "TIMEOUT", check: "Number" },
    ],
    inputsInline: true,
    output: "Number",
    colour: hardwareColours.sensor,
    tooltip:
      "读取红外遥控器的 NEC 编码，返回按键命令字节（0–255）；超时或校验失败返回 -1。接收头输出脚接所选引脚，等待期间会阻塞程序。常见 38 kHz 接收头（如 VS1838B）输出为低电平有效。",
    extensions: ["hardware_board_pin"],
  },
];

/**
 * NEC 帧：9 ms 低电平引导 + 4.5 ms 高电平，随后 32 位（地址、反码、命令、反码），
 * 每位先 560 us 低电平，再用 560 us（0）或 1690 us（1）高电平区分。
 * 位按 LSB 先到，因此用 `1 << index` 组装；最后两个字节用于反码校验。
 */
const ensureIrHelper = (): string => {
  ensureImport("machine");
  ensureImport("time");
  const placeholder = hardwareFunctionPlaceholder();
  return provideHardwareFunction("hardware_ir_read", [
    `def ${placeholder}(pin, timeout_ms):`,
    "  receiver = machine.Pin(pin, machine.Pin.IN)",
    "  start = time.ticks_ms()",
    "  while receiver.value():",
    "    if time.ticks_diff(time.ticks_ms(), start) > timeout_ms:",
    "      return -1",
    "    time.sleep_ms(1)",
    "  if machine.time_pulse_us(receiver, 0, 20000) < 8000:",
    "    return -1",
    "  if machine.time_pulse_us(receiver, 1, 20000) < 3500:",
    "    return -1",
    "  value = 0",
    "  for index in range(32):",
    "    if machine.time_pulse_us(receiver, 0, 2000) < 0:",
    "      return -1",
    "    high = machine.time_pulse_us(receiver, 1, 2000)",
    "    if high < 0:",
    "      return -1",
    "    if high > 1000:",
    "      value |= 1 << index",
    "  address = value & 0xFF",
    "  command = (value >> 16) & 0xFF",
    "  if address ^ ((value >> 8) & 0xFF) != 0xFF:",
    "    return -1",
    "  if command ^ ((value >> 24) & 0xFF) != 0xFF:",
    "    return -1",
    "  return command",
  ]);
};

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_ir_receive = (block, generator) => {
    const target = pinTarget(block, "digital-input");
    if (typeof target === "string") return ["-1", pythonOrder.ATOMIC];
    const timeout = generator.valueToCode(block, "TIMEOUT", pythonOrder.NONE) || "5000";
    const helper = ensureIrHelper();
    return [`${helper}(${target.pinId}, int(${timeout}))`, pythonOrder.FUNCTION_CALL];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.p2Modules) return [];
  const pin = boardPinChoices(profile, "digital-input")[0]?.id ?? "";
  return [
    hardwareSectionLabel("红外接收"),
    {
      kind: "block",
      type: "hardware_ir_receive",
      fields: { PIN: pin },
      inputs: { TIMEOUT: numberShadow(5000) },
    },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
