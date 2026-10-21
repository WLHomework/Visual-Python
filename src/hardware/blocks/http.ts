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
    type: "hardware_http_get",
    message0: "HTTP GET 地址 %1",
    args0: [{ type: "input_value", name: "URL", check: "String" }],
    inputsInline: true,
    output: "String",
    colour: hardwareColours.network,
    tooltip:
      "读取网址的响应正文。需要先连接 Wi-Fi。支持 http 和 https；HTTPS 不校验证书，响应内容过大时会占用设备内存。",
  },
  {
    type: "hardware_ntp_sync",
    message0: "NTP 校时",
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.network,
    tooltip: "通过 pool.ntp.org 把设备 RTC 校准为 UTC 时间，需要先连接 Wi-Fi；不会自动处理本地时区。",
  },
  {
    type: "hardware_ntp_now",
    message0: "设备当前时间（UTC）",
    output: "String",
    colour: hardwareColours.network,
    tooltip: "返回格式为 年-月-日 时:分:秒 的 UTC 时间。先运行「NTP 校时」；没有校准时从固件默认时间开始。",
  },
];

const advancedGuard = (): string | undefined => {
  const profile = getActiveHardwareBoard();
  if (!profile) return "请先选择硬件板卡";
  if (!profile.advancedWireless) return `${profile.displayName} 不支持 HTTP / NTP 积木（仅 ESP32-S3）`;
  return undefined;
};

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_http_get = (block, generator) => {
    if (advancedGuard()) return ['""', pythonOrder.ATOMIC];
    ensureImport("requests");
    const helper = hardwareInternals().provideFunction_("hardware_http_get", [
      `def ${hardwareInternals().FUNCTION_NAME_PLACEHOLDER_}(url):`,
      "  response = requests.get(str(url), timeout=5)",
      "  return response.text",
    ]);
    const url = generator.valueToCode(block, "URL", pythonOrder.NONE) || '""';
    return [`${helper}(${url})`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_ntp_sync = () => {
    const problem = advancedGuard();
    if (problem) return unavailable(problem);
    ensureImport("ntptime");
    return "ntptime.settime()\n";
  };

  hardwareGenerator.forBlock.hardware_ntp_now = () => {
    if (advancedGuard()) return ['""', pythonOrder.ATOMIC];
    ensureImport("time");
    return ['time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())', pythonOrder.FUNCTION_CALL];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.advancedWireless) return [];
  return [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("HTTP 与校时"),
    {
      kind: "block",
      type: "hardware_http_get",
      inputs: { URL: { shadow: { type: "text", fields: { TEXT: "http://example.com" } } } },
    },
    { kind: "block", type: "hardware_ntp_sync" },
    { kind: "block", type: "hardware_ntp_now" },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}

// provideFunction_ 需要生成器的内部接口；集中在 shared.ts 里没有导出，这里复用同一组字段。
const hardwareInternals = () => hardwareGenerator as unknown as {
  definitions_: Record<string, string>;
  FUNCTION_NAME_PLACEHOLDER_: string;
  provideFunction_(name: string, code: string[]): string;
};
