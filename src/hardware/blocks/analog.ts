import * as Blockly from "blockly/core";
import { boardPinChoices, getBoardProfile } from "../boardProfiles";
import { defineHardwareBlocks, ensureImport, hardwareColours, hardwareGenerator, pinTarget, pythonOrder } from "./shared";
import type { HardwareBoardId } from "../firmwareCatalog";

const definitions = [
  {
    type: "hardware_analog_read",
    message0: "读取模拟引脚 %1",
    args0: [{ type: "field_dropdown", name: "PIN", options: [["（请先选择硬件板卡）", ""]] }],
    output: "Number",
    colour: hardwareColours.pin,
    tooltip: "读取模拟电压数值，可用于电位器、光敏电阻等元件。",
    extensions: ["hardware_board_pin"],
  },
];

export function register(): void {
  defineHardwareBlocks(definitions);
  hardwareGenerator.forBlock.hardware_analog_read = (block) => {
    const target = pinTarget(block, "analog");
    if (typeof target === "string") return ["None", pythonOrder.ATOMIC];
    ensureImport("machine");
    if (target.profile.analogRead === "adc0") return ["machine.ADC(0).read()", pythonOrder.FUNCTION_CALL];
    return [`machine.ADC(machine.Pin(${target.pinId})).read()`, pythonOrder.FUNCTION_CALL];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  const analogPin = boardPinChoices(profile, "analog")[0]?.id ?? "";
  return [{ kind: "block", type: "hardware_analog_read", fields: { PIN: analogPin } }];
}
