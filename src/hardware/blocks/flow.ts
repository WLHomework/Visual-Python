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
  {
    type: "hardware_ticks_ms",
    message0: "当前毫秒计数",
    output: "Number",
    colour: hardwareColours.loop,
    tooltip: "返回一个不断增加的毫秒计数（起点由固件决定），过一段时间会回绕。不要直接对它做加减或大小比较，请用「计时差值」积木。",
  },
  {
    type: "hardware_ticks_diff",
    message0: "从 %1 到 %2 经过的毫秒",
    args0: [
      { type: "input_value", name: "START", check: "Number" },
      { type: "input_value", name: "END", check: "Number" },
    ],
    inputsInline: true,
    output: "Number",
    colour: hardwareColours.loop,
    tooltip: "计算两个「当前毫秒计数」之间经过的毫秒数，能正确处理计数回绕；两个时刻不要相隔超过计数范围的一半。不要直接用减法。",
  },
  {
    type: "hardware_reset",
    message0: "重启开发板",
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.loop,
    tooltip: "立即像按下复位键一样重启开发板，程序会从头运行，未保存的数据会丢失。",
  },
  {
    type: "hardware_deepsleep",
    message0: "深度睡眠 %1 毫秒",
    args0: [{ type: "input_value", name: "MS", check: "Number" }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.loop,
    tooltip: "进入深度睡眠以省电，指定毫秒后自动重启。睡眠期间串口和 USB 通信会中断（ESP32-S3 原生 USB 会断开），醒来后程序从头运行，普通变量不会保留。",
  },
];

export function register(): void {
  defineHardwareBlocks(definitions);
  hardwareGenerator.forBlock.hardware_sleep_ms = (block, generator) => {
    ensureImport("time");
    const ms = generator.valueToCode(block, "MS", pythonOrder.NONE) || "1000";
    return `time.sleep_ms(${ms})\n`;
  };
  hardwareGenerator.forBlock.hardware_ticks_ms = () => {
    ensureImport("time");
    return ["time.ticks_ms()", pythonOrder.FUNCTION_CALL];
  };
  hardwareGenerator.forBlock.hardware_ticks_diff = (block, generator) => {
    ensureImport("time");
    const start = generator.valueToCode(block, "START", pythonOrder.NONE) || "0";
    const end = generator.valueToCode(block, "END", pythonOrder.NONE) || "0";
    return [`time.ticks_diff(${end}, ${start})`, pythonOrder.FUNCTION_CALL];
  };
  hardwareGenerator.forBlock.hardware_reset = () => {
    ensureImport("machine");
    return "machine.reset()\n";
  };
  hardwareGenerator.forBlock.hardware_deepsleep = (block, generator) => {
    ensureImport("machine");
    const ms = generator.valueToCode(block, "MS", pythonOrder.NONE) || "10000";
    return `machine.deepsleep(int(max(0, ${ms})))\n`;
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
    { kind: "block", type: "hardware_ticks_ms" },
    { kind: "block", type: "hardware_ticks_diff", inputs: { START: numberShadow(0), END: numberShadow(0) } },
    { kind: "block", type: "hardware_forever" },
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("系统"),
    { kind: "block", type: "hardware_reset" },
    { kind: "block", type: "hardware_deepsleep", inputs: { MS: numberShadow(10000) } },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
