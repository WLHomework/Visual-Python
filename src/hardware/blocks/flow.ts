import * as Blockly from "blockly/core";
import { defineHardwareBlocks, ensureImport, hardwareColours, hardwareGenerator, hardwareGeneratorIndent, hardwareSectionLabel, numberShadow, pythonOrder } from "./shared";

const definitions = [
  {
    type: "hardware_sleep_ms",
    message0: "等待 %1 毫秒",
    args0: [{ type: "input_value", name: "MS", check: "Number" }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.loop,
    tooltip: "让程序暂停指定的毫秒数，1000 毫秒等于 1 秒。",
  },
  {
    type: "hardware_forever",
    message0: "永远重复执行",
    message1: "%1",
    args1: [{ type: "input_statement", name: "BODY" }],
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.loop,
    tooltip: "设备上的程序会一直重复运行这里的积木，直到停止或断电。",
  },
];

export function register(): void {
  defineHardwareBlocks(definitions);
  hardwareGenerator.forBlock.hardware_sleep_ms = (block, generator) => {
    ensureImport("time");
    const ms = generator.valueToCode(block, "MS", pythonOrder.NONE) || "1000";
    return `time.sleep_ms(${ms})\n`;
  };
  hardwareGenerator.forBlock.hardware_forever = (block, generator) => {
    const body = generator.statementToCode(block, "BODY");
    return `while True:\n${body || `${hardwareGeneratorIndent()}pass\n`}`;
  };
}

export function toolboxContents(): Blockly.utils.toolbox.FlyoutItemInfo[] {
  return [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("时序与循环"),
    { kind: "block", type: "hardware_sleep_ms", inputs: { MS: numberShadow(1000) } },
    { kind: "block", type: "hardware_forever" },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
