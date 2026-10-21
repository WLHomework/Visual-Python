import * as Blockly from "blockly/core";
import {
  defineHardwareBlocks,
  ensureImport,
  hardwareColours,
  hardwareGenerator,
  hardwareSectionLabel,
  pinTarget,
  pythonOrder,
  unavailable,
} from "./shared";
import { boardPinChoices, builtinLedPin, getBoardProfile, validateDigitalInputPull } from "../boardProfiles";
import { getActiveHardwareBoard } from "./shared";
import type { HardwareBoardId } from "../firmwareCatalog";

const definitions = [
  {
    type: "hardware_pin_write",
    message0: "设置引脚 %1 输出 %2",
    args0: [
      { type: "field_dropdown", name: "PIN", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "LEVEL", options: [["高电平", "1"], ["低电平", "0"]] },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.pin,
    tooltip: "让选中的引脚输出高电平（约 3.3V）或低电平（0V）。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_pin_read",
    message0: "读取引脚 %1 电平 %2",
    args0: [
      { type: "field_dropdown", name: "PIN", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "PULL", options: [["不使用", "none"], ["上拉", "up"], ["下拉", "down"]] },
    ],
    inputsInline: true,
    output: "Boolean",
    colour: hardwareColours.pin,
    tooltip: "读取引脚当前的高低电平，返回真或假。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_touch_read",
    message0: "读取触摸引脚 %1",
    args0: [{ type: "field_dropdown", name: "PIN", options: [["（请先选择硬件板卡）", ""]] }],
    output: "Number",
    colour: hardwareColours.pin,
    tooltip: "读取电容触摸引脚的原始数值。触摸时数值会明显变化：ESP32 变小，ESP32-S3 变大；建议先记录未触摸时的读数再比较。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_builtin_led",
    message0: "板载 LED %1",
    args0: [{ type: "field_dropdown", name: "STATE", options: [["点亮", "on"], ["熄灭", "off"]] }],
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.light,
    tooltip: "控制开发板自带的 LED。",
  },
];

export function register(): void {
  defineHardwareBlocks(definitions);
  hardwareGenerator.forBlock.hardware_pin_write = (block) => {
    const target = pinTarget(block, "digital-output");
    if (typeof target === "string") return target;
    ensureImport("machine");
    const level = block.getFieldValue("LEVEL") === "0" ? 0 : 1;
    return `machine.Pin(${target.pinId}, machine.Pin.OUT).value(${level})\n`;
  };
  hardwareGenerator.forBlock.hardware_pin_read = (block) => {
    const target = pinTarget(block, "digital-input");
    if (typeof target === "string") return ["None", pythonOrder.ATOMIC];
    const pull = String(block.getFieldValue("PULL") ?? "none") as "none" | "up" | "down";
    if (validateDigitalInputPull(target.profile, target.pinId, pull)) return ["None", pythonOrder.ATOMIC];
    ensureImport("machine");
    const pullMode = pull === "up" ? ", machine.Pin.PULL_UP" : pull === "down" ? ", machine.Pin.PULL_DOWN" : "";
    return [`machine.Pin(${target.pinId}, machine.Pin.IN${pullMode}).value()`, pythonOrder.FUNCTION_CALL];
  };
  hardwareGenerator.forBlock.hardware_touch_read = (block) => {
    const target = pinTarget(block, "touch");
    if (typeof target === "string") return ["None", pythonOrder.ATOMIC];
    ensureImport("machine");
    return [`machine.TouchPad(machine.Pin(${target.pinId})).read()`, pythonOrder.FUNCTION_CALL];
  };
  hardwareGenerator.forBlock.hardware_builtin_led = (block) => {
    const profile = getActiveHardwareBoard();
    if (!profile) return unavailable("请先选择硬件板卡");
    const pin = builtinLedPin(profile);
    if (!pin) return unavailable(`${profile.displayName} 没有板载 LED`);
    ensureImport("machine");
    const on = block.getFieldValue("STATE") !== "off";
    const level = on === !profile.builtinLedActiveLow ? 1 : 0;
    return `machine.Pin(${pin.id}, machine.Pin.OUT).value(${level})\n`;
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  const contents: Blockly.utils.toolbox.FlyoutItemInfo[] = [];
  if (profile && builtinLedPin(profile)) {
    contents.push(
      { kind: "block", type: "hardware_builtin_led", fields: { STATE: "on" } } as unknown as Blockly.utils.toolbox.FlyoutItemInfo,
      { kind: "sep", gap: 20 } as unknown as Blockly.utils.toolbox.FlyoutItemInfo,
    );
  }
  contents.push(
    hardwareSectionLabel("数字引脚"),
    { kind: "block", type: "hardware_pin_write", fields: { PIN: boardPinChoices(profile, "digital-output")[0]?.id ?? "", LEVEL: "1" } },
    { kind: "block", type: "hardware_pin_read", fields: { PIN: boardPinChoices(profile, "digital-input")[0]?.id ?? "", PULL: "none" } },
  );
  const touchPin = boardPinChoices(profile, "touch")[0]?.id;
  if (touchPin) {
    contents.push(
      { kind: "sep", gap: 20 } as unknown as Blockly.utils.toolbox.FlyoutItemInfo,
      hardwareSectionLabel("电容触摸"),
      { kind: "block", type: "hardware_touch_read", fields: { PIN: touchPin } },
    );
  }
  return contents;
}
