import * as Blockly from "blockly/core";
import { getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureImport,
  ensureWifiWaitHelper,
  ensureWlan,
  ensureWlanAp,
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
  {
    type: "hardware_wifi_ap_start",
    message0: "开启 Wi-Fi 热点 名称 %1 密码 %2 信道 %3",
    args0: [
      { type: "input_value", name: "SSID", check: "String" },
      { type: "input_value", name: "PASSWORD", check: "String" },
      { type: "input_value", name: "CHANNEL", check: "Number" },
    ],
    inputsInline: false,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.network,
    tooltip:
      "开启 2.4 GHz 热点（设备作为 AP），信道 1–13。密码必须是 8–63 个 ASCII 字符，会明文写入 .vpy 工程文件和设备上的 main.py，请勿使用重要密码。热点与 Wi-Fi 连接共用射频；热点开启时 ADC2 引脚不可用。",
  },
  {
    type: "hardware_wifi_ap_stop",
    message0: "关闭 Wi-Fi 热点",
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.network,
    tooltip: "关闭热点，已连接的客户端会断开。",
  },
  {
    type: "hardware_wifi_ap_ip",
    message0: "热点 IP 地址",
    output: "String",
    colour: hardwareColours.network,
    tooltip: "返回热点接口 IP 地址；热点未开启时通常是 0.0.0.0。",
  },
  {
    type: "hardware_wifi_rssi",
    message0: "Wi-Fi 信号强度（dBm）",
    output: "Number",
    colour: hardwareColours.network,
    tooltip: "返回当前 Wi-Fi 连接的信号强度，典型值约 -30（强）到 -90（弱）；未连接时返回 0。",
  },
];

const advancedGuard = (): string | undefined => {
  const profile = getActiveHardwareBoard();
  if (!profile) return "请先选择硬件板卡";
  if (!profile.advancedWireless) return `${profile.displayName} 不支持热点 / Wi-Fi 信号强度积木（仅 ESP32-S3）`;
  return undefined;
};

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

  hardwareGenerator.forBlock.hardware_wifi_ap_start = (block, generator) => {
    const problem = advancedGuard();
    if (problem) return unavailable(problem);
    ensureWlanAp();
    const ssid = generator.valueToCode(block, "SSID", pythonOrder.NONE) || '""';
    const password = generator.valueToCode(block, "PASSWORD", pythonOrder.NONE) || '""';
    const channel = generator.valueToCode(block, "CHANNEL", pythonOrder.NONE) || "1";
    return [
      `_ap.config(essid=str(${ssid}), password=str(${password}), authmode=network.WLAN.SEC_WPA_WPA2, channel=int(${channel}))`,
      "_ap.active(True)",
      "",
    ].join("\n");
  };

  hardwareGenerator.forBlock.hardware_wifi_ap_stop = () => {
    const problem = advancedGuard();
    if (problem) return unavailable(problem);
    ensureWlanAp();
    return "_ap.active(False)\n";
  };

  hardwareGenerator.forBlock.hardware_wifi_ap_ip = () => {
    if (advancedGuard()) return ['""', pythonOrder.ATOMIC];
    ensureWlanAp();
    return ["_ap.ifconfig()[0]", pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_wifi_rssi = () => {
    if (advancedGuard()) return ["0", pythonOrder.ATOMIC];
    ensureWlan();
    return ['_wlan.status("rssi") if _wlan.isconnected() else 0', pythonOrder.FUNCTION_CALL];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile) return [];
  const apBlocks: Blockly.utils.toolbox.FlyoutItemInfo[] = profile.advancedWireless
    ? [
        {
          kind: "block",
          type: "hardware_wifi_ap_start",
          inputs: {
            SSID: { shadow: { type: "text", fields: { TEXT: "VisualPython" } } },
            PASSWORD: { shadow: { type: "text", fields: { TEXT: "12345678" } } },
            CHANNEL: numberShadow(1),
          },
        },
        { kind: "block", type: "hardware_wifi_ap_stop" },
        { kind: "block", type: "hardware_wifi_ap_ip" },
        { kind: "block", type: "hardware_wifi_rssi" },
      ]
    : [];
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
    ...apBlocks,
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
