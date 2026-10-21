import * as Blockly from "blockly/core";
import { getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureImport,
  getActiveHardwareBoard,
  hardwareColours,
  hardwareGenerator,
  hardwareSectionLabel,
  pythonOrder,
  unavailable,
} from "./shared";

const definitions = [
  {
    type: "hardware_ble_start",
    message0: "开启 BLE 广播 名称 %1",
    args0: [{ type: "input_value", name: "NAME", check: "String" }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.communication,
    tooltip:
      "以低功耗蓝牙（BLE）广播设备名，不建立连接。名称超过 20 个 UTF-8 字节时会截断。BLE 与 Wi-Fi / ESP-NOW 共用 2.4 GHz 无线，同时使用时吞吐会下降。",
  },
  {
    type: "hardware_ble_stop",
    message0: "停止 BLE 广播",
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.communication,
    tooltip: "停止广播；BLE 无线本身仍保持开启。",
  },
];

const advancedGuard = (): string | undefined => {
  const profile = getActiveHardwareBoard();
  if (!profile) return "请先选择硬件板卡";
  if (!profile.advancedWireless) return `${profile.displayName} 不支持 BLE 积木（仅 ESP32-S3）`;
  return undefined;
};

const internals = () => hardwareGenerator as unknown as {
  definitions_: Record<string, string>;
  FUNCTION_NAME_PLACEHOLDER_: string;
  provideFunction_(name: string, code: string[]): string;
};

const ensureBle = (): void => {
  ensureImport("bluetooth");
  internals().definitions_.hardware_ble = "_ble = bluetooth.BLE()";
};

const ensureStartHelper = (): string =>
  internals().provideFunction_("hardware_ble_start", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(name):`,
    "  text = str(name)",
    "  data = text.encode()",
    "  while len(data) > 20:",
    "    text = text[:-1]",
    "    data = text.encode()",
    "  _ble.active(True)",
    "  _ble.config(gap_name=text)",
    "  _ble.gap_advertise(None)",
    "  _ble.gap_advertise(200000, adv_data=bytes([0x02, 0x01, 0x06, len(data) + 1, 0x09]) + data, connectable=False)",
  ]);

const ensureStopHelper = (): string =>
  internals().provideFunction_("hardware_ble_stop", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}():`,
    "  if _ble.active():",
    "    _ble.gap_advertise(None)",
  ]);

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_ble_start = (block, generator) => {
    const problem = advancedGuard();
    if (problem) return unavailable(problem);
    ensureBle();
    const helper = ensureStartHelper();
    const name = generator.valueToCode(block, "NAME", pythonOrder.NONE) || '"VisualPython"';
    return `${helper}(${name})\n`;
  };

  hardwareGenerator.forBlock.hardware_ble_stop = () => {
    const problem = advancedGuard();
    if (problem) return unavailable(problem);
    ensureBle();
    return `${ensureStopHelper()}()\n`;
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.advancedWireless) return [];
  return [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("蓝牙广播"),
    {
      kind: "block",
      type: "hardware_ble_start",
      inputs: { NAME: { shadow: { type: "text", fields: { TEXT: "VisualPython" } } } },
    },
    { kind: "block", type: "hardware_ble_stop" },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
