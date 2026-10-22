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
  {
    type: "hardware_ble_gatt_start",
    message0: "开启 BLE GATT 服务 名称 %1 服务 UUID %2 特征 UUID %3",
    args0: [
      { type: "input_value", name: "NAME", check: "String" },
      { type: "input_value", name: "SERVICE", check: "String" },
      { type: "input_value", name: "CHARACTERISTIC", check: "String" },
    ],
    inputsInline: false,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.communication,
    tooltip:
      "开启 BLE 并注册一个可连接、可通知的 GATT 服务与特征，然后开始广播。手机连接后可按 UUID 发现服务。默认使用 Nordic UART 的 UUID；同一时间只注册一组服务，重复运行会重新注册。",
  },
  {
    type: "hardware_ble_gatt_notify",
    message0: "BLE 通知 %1",
    args0: [{ type: "input_value", name: "MESSAGE", check: "String" }],
    inputsInline: true,
    output: "Boolean",
    colour: hardwareColours.communication,
    tooltip: "向已连接的中心设备发送通知，成功返回真；未连接、没有开启 GATT 服务或发送失败返回假。",
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
  internals().definitions_.hardware_ble = ["_ble = bluetooth.BLE()", "_ble_conn = None", "_ble_handle = 0"].join("\n");
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

const ensureGattStartHelper = (): string =>
  internals().provideFunction_("hardware_ble_gatt_start", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(name, service_uuid, characteristic_uuid):`,
    "  global _ble, _ble_conn, _ble_handle",
    "  if _ble is None:",
    "    _ble = bluetooth.BLE()",
    "  _ble.active(True)",
    "  service = (bluetooth.UUID(str(service_uuid)), ((bluetooth.UUID(str(characteristic_uuid)), bluetooth.FLAG_READ | bluetooth.FLAG_NOTIFY),))",
    "  ((_ble_handle,),) = _ble.gatts_register_services((service,))",
    "  _ble_conn = None",
    "  def _ble_irq(event, data):",
    "    global _ble_conn",
    "    if event == 1:",
    "      _ble_conn = data[0]",
    "    elif event == 2:",
    "      _ble_conn = None",
    "  _ble.irq(_ble_irq)",
    "  text = str(name)",
    "  data = text.encode()",
    "  while len(data) > 20:",
    "    text = text[:-1]",
    "    data = text.encode()",
    "  _ble.config(gap_name=text)",
    "  _ble.gap_advertise(None)",
    "  _ble.gap_advertise(200000, adv_data=bytes([0x02, 0x01, 0x06, len(data) + 1, 0x09]) + data, connectable=True)",
  ]);

const ensureGattNotifyHelper = (): string =>
  internals().provideFunction_("hardware_ble_gatt_notify", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(message):`,
    "  if _ble_conn is None:",
    "    return False",
    "  try:",
    "    _ble.gatts_notify(_ble_conn, _ble_handle, str(message).encode())",
    "    return True",
    "  except OSError:",
    "    return False",
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

  hardwareGenerator.forBlock.hardware_ble_gatt_start = (block, generator) => {
    const problem = advancedGuard();
    if (problem) return unavailable(problem);
    ensureBle();
    const helper = ensureGattStartHelper();
    const name = generator.valueToCode(block, "NAME", pythonOrder.NONE) || '"VisualPython"';
    const service = generator.valueToCode(block, "SERVICE", pythonOrder.NONE) || '"6E400001-B5A3-F393-E0A9-E50E24DCCA9E"';
    const characteristic = generator.valueToCode(block, "CHARACTERISTIC", pythonOrder.NONE) || '"6E400003-B5A3-F393-E0A9-E50E24DCCA9E"';
    return `${helper}(${name}, ${service}, ${characteristic})\n`;
  };

  hardwareGenerator.forBlock.hardware_ble_gatt_notify = (block, generator) => {
    if (advancedGuard()) return ["False", pythonOrder.ATOMIC];
    ensureBle();
    const helper = ensureGattNotifyHelper();
    const message = generator.valueToCode(block, "MESSAGE", pythonOrder.NONE) || '""';
    return [`${helper}(${message})`, pythonOrder.FUNCTION_CALL];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.advancedWireless) return [];
  const text = (value: string) => ({ shadow: { type: "text", fields: { TEXT: value } } });
  const contents: unknown[] = [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("蓝牙广播"),
    {
      kind: "block",
      type: "hardware_ble_start",
      inputs: { NAME: text("VisualPython") },
    },
    { kind: "block", type: "hardware_ble_stop" },
  ];
  if (profile.p2Modules) {
    contents.push(
      hardwareSectionLabel("蓝牙 GATT"),
      {
        kind: "block",
        type: "hardware_ble_gatt_start",
        inputs: {
          NAME: text("VisualPython"),
          SERVICE: text("6E400001-B5A3-F393-E0A9-E50E24DCCA9E"),
          CHARACTERISTIC: text("6E400003-B5A3-F393-E0A9-E50E24DCCA9E"),
        },
      },
      { kind: "block", type: "hardware_ble_gatt_notify", inputs: { MESSAGE: text("hello") } },
    );
  }
  return contents as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
