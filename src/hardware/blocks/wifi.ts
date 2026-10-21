import * as Blockly from "blockly/core";
import { getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureImport,
  ensureWifiWaitHelper,
  ensureWlan,
  getActiveHardwareBoard,
  hardwareColours,
  hardwareGenerator,
  hardwareSectionLabel,
  numberShadow,
  numericInputValue,
  pythonOrder,
  unavailable,
} from "./shared";

const definitions = [
  {
    type: "hardware_wifi_connect",
    message0: "连接 Wi-Fi 名称 %1 密码 %2",
    args0: [
      { type: "input_value", name: "SSID", check: "String" },
      { type: "input_value", name: "PASSWORD", check: "String" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.network,
    tooltip:
      "连接 2.4 GHz Wi-Fi。密码会明文写入 .vpy 工程文件和设备上的 main.py，请勿使用重要密码。Wi-Fi 开启时 ADC2 引脚不可用；工具箱的模拟输入只开放 ADC1 引脚。可接「等待 Wi-Fi 连接」积木等待连接完成。",
  },
  {
    type: "hardware_wifi_wait",
    message0: "等待 Wi-Fi 连接 最多 %1 秒",
    args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
    inputsInline: true,
    output: "Boolean",
    colour: hardwareColours.network,
    tooltip: "阻塞等待，直到连接成功或超过指定秒数；返回是否连接成功。建议放在「连接 Wi-Fi」之后。",
  },
  {
    type: "hardware_wifi_disconnect",
    message0: "断开 Wi-Fi",
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.network,
    tooltip: "断开当前 Wi-Fi 并关闭无线接口。",
  },
  {
    type: "hardware_wifi_connected",
    message0: "Wi-Fi 已连接",
    output: "Boolean",
    colour: hardwareColours.network,
    tooltip: "返回是否已连接到 Wi-Fi 并取得 IP 地址。",
  },
  {
    type: "hardware_wifi_ip",
    message0: "Wi-Fi IP 地址",
    output: "String",
    colour: hardwareColours.network,
    tooltip: "返回当前 IP 地址；未连接时通常是 0.0.0.0。",
  },
];

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_wifi_connect = (block, generator) => {
    if (!getActiveHardwareBoard()) return unavailable("请先选择硬件板卡");
    ensureWlan();
    const ssid = generator.valueToCode(block, "SSID", pythonOrder.NONE) || '""';
    const password = generator.valueToCode(block, "PASSWORD", pythonOrder.NONE) || '""';
    return `_wlan.active(True)\n_wlan.connect(str(${ssid}), str(${password}))\n`;
  };

  hardwareGenerator.forBlock.hardware_wifi_wait = (block, generator) => {
    if (!getActiveHardwareBoard()) return ["False", pythonOrder.ATOMIC];
    const literal = numericInputValue(block, "SECONDS");
    if (literal !== undefined && (!Number.isInteger(literal) || literal <= 0)) return ["False", pythonOrder.ATOMIC];
    ensureWlan();
    ensureImport("time");
    const helper = ensureWifiWaitHelper();
    const seconds = generator.valueToCode(block, "SECONDS", pythonOrder.NONE) || "15";
    return [`${helper}(int(${seconds}) * 1000)`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_wifi_disconnect = () => {
    if (!getActiveHardwareBoard()) return unavailable("请先选择硬件板卡");
    ensureWlan();
    // 未连接时直接 disconnect() 在部分端口会抛 OSError，先判断再断开。
    return "if _wlan.isconnected():\n  _wlan.disconnect()\n_wlan.active(False)\n";
  };

  hardwareGenerator.forBlock.hardware_wifi_connected = () => {
    if (!getActiveHardwareBoard()) return ["False", pythonOrder.ATOMIC];
    ensureWlan();
    return ["_wlan.isconnected()", pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_wifi_ip = () => {
    if (!getActiveHardwareBoard()) return ['""', pythonOrder.ATOMIC];
    ensureWlan();
    return ["_wlan.ifconfig()[0]", pythonOrder.FUNCTION_CALL];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  if (!getBoardProfile(boardId)) return [];
  return [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("Wi-Fi"),
    {
      kind: "block",
      type: "hardware_wifi_connect",
      inputs: {
        SSID: { shadow: { type: "text", fields: { TEXT: "MyWiFi" } } },
        PASSWORD: { shadow: { type: "text", fields: { TEXT: "" } } },
      },
    },
    { kind: "block", type: "hardware_wifi_wait", inputs: { SECONDS: numberShadow(15) } },
    { kind: "block", type: "hardware_wifi_connected" },
    { kind: "block", type: "hardware_wifi_ip" },
    { kind: "block", type: "hardware_wifi_disconnect" },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
