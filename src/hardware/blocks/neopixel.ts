import * as Blockly from "blockly/core";
import { boardPinChoices, getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureImport,
  getActiveHardwareBoard,
  hardwareColours,
  hardwareGenerator,
  hardwareSectionLabel,
  numberShadow,
  pinTarget,
  pythonOrder,
  unavailable,
} from "./shared";

const definitions = [
  {
    type: "hardware_onboard_rgb",
    message0: "板载 RGB 灯显示 %1",
    args0: [
      {
        type: "field_dropdown",
        name: "COLOR",
        options: [
          ["红色", "red"],
          ["绿色", "green"],
          ["蓝色", "blue"],
          ["白色", "white"],
          ["黄色", "yellow"],
          ["青色", "cyan"],
          ["紫色", "purple"],
          ["熄灭", "off"],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.light,
    tooltip: "控制开发板自带的单颗 WS2812 RGB 灯；数据引脚由板卡决定，请不要在同一引脚上再接其他设备。",
  },
  {
    type: "hardware_neopixel_init",
    message0: "初始化 NeoPixel 引脚 %1 灯珠数 %2",
    args0: [
      { type: "field_dropdown", name: "PIN", options: [["请先选择硬件板卡", ""]] },
      { type: "input_value", name: "COUNT", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.light,
    tooltip: "初始化一条 NeoPixel 灯带，请先运行此积木再使用其他设置积木。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_neopixel_set_pixel",
    message0: "设置 NeoPixel 第 %1 颗灯珠 RGB(%2, %3, %4)",
    args0: [
      { type: "input_value", name: "INDEX", check: "Number" },
      { type: "input_value", name: "R", check: "Number" },
      { type: "input_value", name: "G", check: "Number" },
      { type: "input_value", name: "B", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.light,
    tooltip: "设置指定灯珠的颜色，RGB 值会限制在 0 到 255，请先初始化 NeoPixel。",
  },
  {
    type: "hardware_neopixel_clear",
    message0: "NeoPixel 灯全部熄灭",
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.light,
    tooltip: "将所有灯珠待刷新的颜色设置为黑色。",
  },
  {
    type: "hardware_neopixel_fill",
    message0: "NeoPixel 全部填充 RGB(%1, %2, %3)",
    args0: [
      { type: "input_value", name: "R", check: "Number" },
      { type: "input_value", name: "G", check: "Number" },
      { type: "input_value", name: "B", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.light,
    tooltip: "把所有灯珠设置为同一种颜色，运行刷新积木后才会显示。RGB 值会限制在 0 到 255。",
  },
  {
    type: "hardware_neopixel_write",
    message0: "刷新 NeoPixel 显示",
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.light,
    tooltip: "将缓存的 NeoPixel 颜色写入灯带并显示出来。",
  },
];

const colorValue = (value: string) => `int(max(0, min(255, ${value})))`;

/** 板载 RGB 灯的预设颜色，元组顺序与 neopixel 的 (R, G, B) 一致。 */
const onboardRgbColors: Record<string, readonly [number, number, number]> = {
  red: [255, 0, 0],
  green: [0, 255, 0],
  blue: [0, 0, 255],
  white: [255, 255, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  purple: [255, 0, 255],
  off: [0, 0, 0],
};

export function register(): void {
  defineHardwareBlocks(definitions);
  hardwareGenerator.forBlock.hardware_onboard_rgb = (block) => {
    const profile = getActiveHardwareBoard();
    if (!profile) return unavailable("请先选择硬件板卡");
    if (!profile.builtinRgb) return unavailable(`${profile.displayName} 没有板载 RGB 灯`);
    ensureImport("machine");
    ensureImport("neopixel");
    const color = onboardRgbColors[String(block.getFieldValue("COLOR"))] ?? onboardRgbColors.off;
    return [
      `_onboard_rgb = neopixel.NeoPixel(machine.Pin(${profile.builtinRgb.pin}, machine.Pin.OUT), 1)`,
      `_onboard_rgb[0] = (${color[0]}, ${color[1]}, ${color[2]})`,
      "_onboard_rgb.write()",
    ].join("\n") + "\n";
  };
  hardwareGenerator.forBlock.hardware_neopixel_init = (block, generator) => {
    const target = pinTarget(block, "digital-output");
    if (typeof target === "string") return target;
    ensureImport("machine");
    ensureImport("neopixel");
    const count = generator.valueToCode(block, "COUNT", pythonOrder.NONE) || "1";
    return `_neopixel = neopixel.NeoPixel(machine.Pin(${target.pinId}), int(max(1, ${count})))\n`;
  };
  hardwareGenerator.forBlock.hardware_neopixel_set_pixel = (block, generator) => {
    const index = generator.valueToCode(block, "INDEX", pythonOrder.NONE) || "0";
    const red = generator.valueToCode(block, "R", pythonOrder.NONE) || "0";
    const green = generator.valueToCode(block, "G", pythonOrder.NONE) || "0";
    const blue = generator.valueToCode(block, "B", pythonOrder.NONE) || "0";
    return `_neopixel[int(${index})] = (${colorValue(red)}, ${colorValue(green)}, ${colorValue(blue)})\n`;
  };
  hardwareGenerator.forBlock.hardware_neopixel_clear = () => "_neopixel.fill((0, 0, 0))\n";
  hardwareGenerator.forBlock.hardware_neopixel_fill = (block, generator) => {
    const red = generator.valueToCode(block, "R", pythonOrder.NONE) || "0";
    const green = generator.valueToCode(block, "G", pythonOrder.NONE) || "0";
    const blue = generator.valueToCode(block, "B", pythonOrder.NONE) || "0";
    return `_neopixel.fill((${colorValue(red)}, ${colorValue(green)}, ${colorValue(blue)}))\n`;
  };
  hardwareGenerator.forBlock.hardware_neopixel_write = () => "_neopixel.write()\n";
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  const pin = boardPinChoices(profile, "digital-output")[0]?.id ?? "";
  return [
    ...(profile?.builtinRgb
      ? [
          { kind: "sep", gap: 20 },
          hardwareSectionLabel("板载 RGB 灯"),
          { kind: "block", type: "hardware_onboard_rgb", fields: { COLOR: "red" } },
        ]
      : []),
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("NeoPixel 灯带"),
    { kind: "block", type: "hardware_neopixel_init", fields: { PIN: pin }, inputs: { COUNT: numberShadow(8) } },
    {
      kind: "block",
      type: "hardware_neopixel_set_pixel",
      inputs: { INDEX: numberShadow(0), R: numberShadow(255), G: numberShadow(255), B: numberShadow(255) },
    },
    { kind: "block", type: "hardware_neopixel_clear" },
    ...(profile?.p0Modules
      ? [{ kind: "block", type: "hardware_neopixel_fill", inputs: { R: numberShadow(255), G: numberShadow(255), B: numberShadow(255) } }]
      : []),
    { kind: "block", type: "hardware_neopixel_write" },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
