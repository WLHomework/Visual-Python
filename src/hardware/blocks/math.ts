import * as Blockly from "blockly/core";
import { defineHardwareBlocks, hardwareColours, hardwareGenerator, hardwareSectionLabel, numberShadow, pythonOrder } from "./shared";

const definitions = [
  {
    type: "hardware_map_range",
    message0: "把 %1 从 %2 ~ %3 映射到 %4 ~ %5",
    args0: [
      { type: "input_value", name: "VALUE", check: "Number" },
      { type: "input_value", name: "FROM_LOW", check: "Number" },
      { type: "input_value", name: "FROM_HIGH", check: "Number" },
      { type: "input_value", name: "TO_LOW", check: "Number" },
      { type: "input_value", name: "TO_HIGH", check: "Number" },
    ],
    inputsInline: true,
    output: "Number",
    colour: hardwareColours.math,
    tooltip: "按比例把数值从原范围换算到目标范围，例如把传感器读数映射为百分比。原范围的上下限不能相等。",
  },
];

export function register(): void {
  defineHardwareBlocks(definitions);
  hardwareGenerator.forBlock.hardware_map_range = (block, generator) => {
    const value = generator.valueToCode(block, "VALUE", pythonOrder.NONE) || "0";
    const fromLow = generator.valueToCode(block, "FROM_LOW", pythonOrder.NONE) || "0";
    const fromHigh = generator.valueToCode(block, "FROM_HIGH", pythonOrder.NONE) || "1023";
    const toLow = generator.valueToCode(block, "TO_LOW", pythonOrder.NONE) || "0";
    const toHigh = generator.valueToCode(block, "TO_HIGH", pythonOrder.NONE) || "100";
    return [`(${value} - ${fromLow}) * (${toHigh} - ${toLow}) / (${fromHigh} - ${fromLow}) + ${toLow}`, pythonOrder.ADDITIVE];
  };
}

export function toolboxContents(): Blockly.utils.toolbox.FlyoutItemInfo[] {
  return [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("数值映射"),
    {
      kind: "block",
      type: "hardware_map_range",
      inputs: {
        VALUE: numberShadow(0),
        FROM_LOW: numberShadow(0),
        FROM_HIGH: numberShadow(1023),
        TO_LOW: numberShadow(0),
        TO_HIGH: numberShadow(100),
      },
    },
  ];
}
